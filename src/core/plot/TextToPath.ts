// @ts-ignore
import * as opentype from 'opentype.js';

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

  fontLoadPromise = (async () => {
    const response = await fetch('/fonts/osifont.ttf');
    const buffer = await response.arrayBuffer();
    const font = opentype.parse(buffer);
    fontCache = { regular: font, bold: font };
    return fontCache;
  })();

  return fontLoadPromise;
}

// ── SVG text → path conversion ────────────────────────────────

/**
 * Converts all <text> and <tspan> elements in an SVG string to <path>
 * elements. The output SVG is font-independent and renders identically
 * in all PDF converters, Inkscape, and browsers.
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
  // Scaled up by 2.5 to fix "too small" bug
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

function parseMM(value: string): number {
  const trimmed = value.trim();
  if (trimmed.endsWith('mm'))  return parseFloat(trimmed);
  if (trimmed.endsWith('pt'))  return parseFloat(trimmed) * 0.3528;  // 1pt = 0.3528mm
  if (trimmed.endsWith('px'))  return parseFloat(trimmed) * 0.2646;  // 1px = 0.2646mm at 96dpi
  if (trimmed.endsWith('em'))  return parseFloat(trimmed) * 4.2333;  // approx, no context here
  return parseFloat(trimmed);  // unitless — our SVG uses mm throughout
}
