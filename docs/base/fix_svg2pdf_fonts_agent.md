# Agent Task: Fix svg2pdf Font Rendering — Convert Text to Paths
# Problem: svg2pdf.js cannot render <text> elements because web fonts
#          are not available at PDF conversion time. Text is silently dropped.
# Solution: Convert all SVG <text> elements to <path> elements using
#           opentype.js before passing to svg2pdf.
#           This is the standard professional CAD approach ("outline text").

---

## ROOT CAUSE

svg2pdf.js renders SVG geometry (lines, paths, circles) correctly but cannot
access web fonts loaded by the browser. Every <text> in the SVG becomes
invisible or falls back to an embedded PDF font that svg2pdf doesn't support.

The SVG output itself is correct — if you open it in a browser or Inkscape
you see text. The failure is ONLY in the svg → PDF conversion step.

## SOLUTION OVERVIEW

```
SVG string (has <text> elements)
         ↓
convertTextToPaths(svgString)     ← NEW step in PlotHandler.svgToPDF()
         ↓
SVG string (only <path> elements, no <text>)
         ↓
svg2pdf(outlinedSVG)              ← works perfectly now
         ↓
PDF with correct text
```

---

## STEP 1 — Install opentype.js

```bash
npm install opentype.js
npm install @types/opentype.js --save-dev
```

opentype.js loads TTF/OTF fonts and converts text strings to SVG path data.
It runs entirely in the browser — no server needed.

---

## STEP 2 — Add a bundled font

svg2pdf needs a real TTF file, not a system font name like "Arial".
Use **Arimo** (metrically identical to Arial, Apache 2.0 license):

Download: https://fonts.google.com/specimen/Arimo

Place the Regular and Bold variants in your project:

```
public/
  fonts/
    Arimo-Regular.ttf
    Arimo-Bold.ttf
    Arimo-Italic.ttf
```

These are loaded at runtime by opentype.js — no bundler changes needed.

The font paths are public assets. Reference them as `/fonts/Arimo-Regular.ttf`.

---

## STEP 3 — Create TextToPath.ts

**File to create:** `core/plot/TextToPath.ts`

```typescript
import opentype from 'opentype.js';

// ── Font cache — load each font only once per session ─────────

interface LoadedFont {
  regular: opentype.Font;
  bold:    opentype.Font;
}

let fontCache: LoadedFont | null = null;
let fontLoadPromise: Promise<LoadedFont> | null = null;

async function loadFonts(): Promise<LoadedFont> {
  if (fontCache) return fontCache;
  if (fontLoadPromise) return fontLoadPromise;

  fontLoadPromise = Promise.all([
    opentype.load('/fonts/Arimo-Regular.ttf'),
    opentype.load('/fonts/Arimo-Bold.ttf'),
  ]).then(([regular, bold]) => {
    fontCache = { regular, bold };
    return fontCache;
  });

  return fontLoadPromise;
}

// ── SVG text → path conversion ────────────────────────────────

/**
 * Converts all <text> and <tspan> elements in an SVG string to <path>
 * elements. The output SVG is font-independent and renders identically
 * in all PDF converters, Inkscape, and browsers.
 *
 * Handles:
 *   - font-size in mm units
 *   - fill colour
 *   - rotation via transform="rotate(...)"
 *   - text-anchor: start | middle | end
 *   - dy (baseline shift for tspan multi-line)
 *   - font-weight: bold
 */
export async function convertTextToPaths(svgString: string): Promise<string> {
  const fonts = await loadFonts();

  const parser  = new DOMParser();
  const svgDoc  = parser.parseFromString(svgString, 'image/svg+xml');

  // Check for parse errors
  const parseError = svgDoc.querySelector('parsererror');
  if (parseError) {
    console.warn('[TextToPath] SVG parse error — returning original SVG');
    return svgString;
  }

  const textElements = Array.from(svgDoc.querySelectorAll('text'));

  for (const textEl of textElements) {
    const replacement = convertTextElement(textEl, fonts, svgDoc);
    if (replacement) {
      textEl.parentNode!.replaceChild(replacement, textEl);
    }
  }

  // Serialize back to string
  const serializer = new XMLSerializer();
  return serializer.serializeToString(svgDoc.documentElement);
}

// ── Convert a single <text> element ───────────────────────────

function convertTextElement(
  textEl: SVGTextElement,
  fonts: LoadedFont,
  svgDoc: Document,
): Element | null {

  // Read text element attributes
  const x         = parseMM(textEl.getAttribute('x') ?? '0');
  const y         = parseMM(textEl.getAttribute('y') ?? '0');
  const fontSize  = parseMM(textEl.getAttribute('font-size') ?? '2.5mm');
  const fill      = textEl.getAttribute('fill') ?? '#000000';
  const transform = textEl.getAttribute('transform') ?? '';
  const anchor    = textEl.getAttribute('text-anchor') ?? 'start';
  const fontWeight = textEl.getAttribute('font-weight') ?? 'normal';

  const font = fontWeight === 'bold' ? fonts.bold : fonts.regular;

  // Collect text runs — either direct text or from <tspan> children
  const tspans = Array.from(textEl.querySelectorAll('tspan'));

  // Wrapper group preserves the original transform (rotation etc.)
  const group = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'g');
  if (transform) group.setAttribute('transform', transform);

  if (tspans.length === 0) {
    // Simple text — no tspans
    const content = textEl.textContent ?? '';
    if (!content.trim()) return null;

    const pathEl = textToPathElement(content, x, y, fontSize, fill, anchor, font, svgDoc);
    if (pathEl) group.appendChild(pathEl);

  } else {
    // Multi-line text via tspan — accumulate dy offsets
    let currentY = y;

    for (const tspan of tspans) {
      const tContent = tspan.textContent ?? '';
      if (!tContent.trim()) continue;

      // tspan x overrides parent x
      const tx = tspan.hasAttribute('x')
        ? parseMM(tspan.getAttribute('x')!)
        : x;

      // dy is additive — accumulate
      if (tspan.hasAttribute('dy')) {
        currentY += parseMM(tspan.getAttribute('dy')!);
      }

      // tspan may override font-weight
      const tWeight = tspan.getAttribute('font-weight') ?? fontWeight;
      const tFont   = tWeight === 'bold' ? fonts.bold : fonts.regular;

      // tspan may override text-anchor
      const tAnchor = tspan.getAttribute('text-anchor') ?? anchor;

      // tspan may override fill
      const tFill = tspan.getAttribute('fill') ?? fill;

      const pathEl = textToPathElement(tContent, tx, currentY, fontSize, tFill, tAnchor, tFont, svgDoc);
      if (pathEl) group.appendChild(pathEl);
    }
  }

  return group.childNodes.length > 0 ? group : null;
}

// ── Convert a text string to a <path> element ─────────────────

function textToPathElement(
  text: string,
  x: number,
  y: number,
  fontSizeMM: number,
  fill: string,
  anchor: string,
  font: opentype.Font,
  svgDoc: Document,
): Element | null {
  if (!text.trim()) return null;

  // opentype.js: fontSize in same units as x/y (here: mm)
  // getPath(text, x, y, fontSize) — y is the BASELINE (same as SVG)
  const path = font.getPath(text, 0, 0, fontSizeMM);

  // Apply text-anchor alignment
  // opentype renders left-anchored by default
  if (anchor === 'middle' || anchor === 'end') {
    const bb = path.getBoundingBox();
    const textWidth = bb.x2 - bb.x1;
    const shift = anchor === 'middle' ? -textWidth / 2 : -textWidth;
    // Adjust x by shift
    x += shift;
  }

  // Get SVG path data string
  const pathData = path.toPathData(4);   // 4 decimal places
  if (!pathData || pathData === 'Z' || pathData === '') return null;

  // Apply x/y translation via transform (keeps path data at origin)
  const pathEl = svgDoc.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('d', pathData);
  pathEl.setAttribute('transform', `translate(${x.toFixed(4)}, ${y.toFixed(4)})`);
  pathEl.setAttribute('fill', fill);
  pathEl.setAttribute('stroke', 'none');

  return pathEl;
}

// ── Unit parsing ──────────────────────────────────────────────

/**
 * Parses SVG length values to mm.
 * Handles: "2.5mm", "12pt", "10px", "2.5" (unitless = mm in our SVG)
 */
function parseMM(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('mm'))  return parseFloat(trimmed);
  if (trimmed.endsWith('pt'))  return parseFloat(trimmed) * 0.3528;  // 1pt = 0.3528mm
  if (trimmed.endsWith('px'))  return parseFloat(trimmed) * 0.2646;  // 1px = 0.2646mm at 96dpi
  if (trimmed.endsWith('em'))  return parseFloat(trimmed) * 4.2333;  // approx, no context here
  return parseFloat(trimmed);  // unitless — our SVG uses mm throughout
}
```

---

## STEP 4 — Update PlotHandler.svgToPDF()

**File to modify:** `core/engine/handlers/PlotHandler.ts`

Add the import at the top:

```typescript
import { convertTextToPaths } from '../../plot/TextToPath';
```

Modify `svgToPDF()` — add one `await` call before passing to svg2pdf:

```typescript
private async svgToPDF(svgString: string, settings: PlotSettings): Promise<Blob> {
  const { default: jsPDF } = await import('jspdf');
  await import('svg2pdf.js');

  const { PAPER_SIZES } = await import('../../commands/types');
  const paper = PAPER_SIZES[settings.paperSizeKey];
  const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
  const ph = settings.orientation === 'landscape' ? paper.height : paper.width;

  // ── NEW: outline all text before PDF conversion ──────────────
  let outlinedSVG: string;
  try {
    outlinedSVG = await convertTextToPaths(svgString);
  } catch (e) {
    console.warn('[PlotHandler] Text outlining failed, using original SVG:', e);
    outlinedSVG = svgString;   // fallback — geometry works, text missing
  }
  // ─────────────────────────────────────────────────────────────

  const pdf = new jsPDF({
    orientation: settings.orientation,
    unit: 'mm',
    format: [pw, ph],
  });

  const parser = new DOMParser();
  const svgDoc = parser.parseFromString(outlinedSVG, 'image/svg+xml');  // ← outlinedSVG
  await (pdf as any).svg(svgDoc.documentElement, { x: 0, y: 0, width: pw, height: ph });
  return pdf.output('blob');
}
```

That is the only change to PlotHandler.ts.

---

## STEP 5 — Handle font load failures gracefully

The font files must be accessible at `/fonts/Arimo-Regular.ttf`. Add a
startup check in your app initialisation (optional but recommended):

```typescript
// In app.ts — after viewer init, before user interaction:
// Pre-load fonts in background so first PLOT is fast

import('/fonts/Arimo-Regular.ttf', { assert: { type: 'url' } })
  // If this import syntax doesn't work, use a fetch check:
fetch('/fonts/Arimo-Regular.ttf', { method: 'HEAD' })
  .then(r => {
    if (!r.ok) console.warn('[WebCAD] Plot font not found at /fonts/Arimo-Regular.ttf');
  })
  .catch(() => console.warn('[WebCAD] Plot font check failed'));
```

---

## STEP 6 — Why not embed font in SVG instead?

The alternative is to embed the TTF as base64 in an SVG `<style>` block:

```xml
<style>
  @font-face {
    font-family: 'Arimo';
    src: url('data:font/ttf;base64,AAAA...very long...');
  }
</style>
```

This does NOT work with svg2pdf because svg2pdf does not parse CSS
`@font-face` rules — it cannot extract and embed the font in the PDF.
svg2pdf only reads inline `font-family` attributes and tries to use
jsPDF's built-in font set (which is limited).

Text-to-paths is the correct solution. It is also what AutoCAD,
Inkscape's "Object → Text to Path" feature, and Illustrator's
"Type → Create Outlines" all do before PDF export.

---

## STEP 7 — SVG output remains unchanged

The SVG download format (`case 'svg'`) still uses the original SVG string
with `<text>` elements. This is intentional:
- SVG files open correctly in browsers and Inkscape (which has font access)
- The text remains selectable and searchable
- File size is smaller than outlined text

Only the PDF path converts text to paths.

---

## STEP 8 — Print path (browser print)

The `printSVG()` method in PlotHandler uses an iframe with the original
SVG — the browser handles font rendering natively, so no change is needed
there. Browser print already works correctly.

---

## STEP 9 — Dimension text special case

The dimension text in PlotSVGRenderer.ts uses inline `<text>` elements
(not separate Text entities) — for example:

```typescript
textSVG = `<text x="..." y="..." font-size="${h}mm" font-family="Arial"
                 fill="black" text-anchor="middle">${text}</text>`;
```

These are also `<text>` elements and will be correctly converted by
`convertTextToPaths()` because it queries ALL `<text>` elements in the
SVG document, regardless of which entity produced them.

No changes needed in PlotSVGRenderer.ts.

---

## ACCEPTANCE CRITERIA

After implementation, verify:

- [ ] `PLOT` → PDF: dimension numbers appear in PDF
- [ ] `PLOT` → PDF: Text entities appear in PDF
- [ ] `PLOT` → PDF: MText entities appear in PDF
- [ ] `PLOT` → PDF: text-anchor middle (centered dim text) is correctly centred
- [ ] `PLOT` → SVG: text still uses `<text>` elements (not changed)
- [ ] `PLOT` → Print: text appears (browser handles natively)
- [ ] `PLOT` → PNG: text appears (SVG rendered by browser canvas)
- [ ] First PLOT after page load: font loads from `/fonts/Arimo-Regular.ttf`
- [ ] Second PLOT: font is served from cache (no network request)
- [ ] If font file missing: error in console, geometry-only PDF produced (no crash)
- [ ] TypeScript: `tsc --noEmit` passes

---

## FILES CHANGED

| File | Change |
|---|---|
| `core/plot/TextToPath.ts` | CREATE — text outlining engine |
| `core/engine/handlers/PlotHandler.ts` | MODIFY — 3 lines (import + await call) |
| `public/fonts/Arimo-Regular.ttf` | ADD — font asset |
| `public/fonts/Arimo-Bold.ttf` | ADD — font asset |

No other files change.

---

## CONSTRAINTS

- Do NOT modify PlotSVGRenderer.ts
- Do NOT modify PlotEngine.ts
- Do NOT change the SVG output format
- Do NOT use canvas-based text rendering (loses vector quality)
- Do NOT use jsPDF's built-in addText() — bypasses the SVG pipeline
  and would require duplicating all coordinate transforms
