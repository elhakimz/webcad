# OpenSCAD Interpreter — Part 2
# Covers: ScadEditorPanel, 2D profile primitives for linear_extrude,
#         color metadata flow, include file system, test suite

═══════════════════════════════════════════════════════════════
## STEP 13 — ScadEditorPanel.ts (create)
## File: ui/ScadEditorPanel.ts
##
## Uses CodeMirror 6 for the editor.
## Install: npm install @codemirror/view @codemirror/state
##           @codemirror/language @codemirror/commands
##           @codemirror/search @lezer/highlight
═══════════════════════════════════════════════════════════════

import { EditorState, StateField, StateEffect, Compartment } from '@codemirror/state'
import { EditorView, ViewUpdate, Decoration, DecorationSet,
         ViewPlugin, gutter, GutterMarker, keymap } from '@codemirror/view'
import { defaultKeymap, historyKeymap, history } from '@codemirror/commands'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { ScadInterpreter, ScadStatus } from '../core/engine/scad/ScadInterpreter'
import { ScadParseError } from '../core/engine/scad/ScadTypes'

// ── OpenSCAD syntax highlight theme ──────────────────────────

const scadHighlight = HighlightStyle.define([
  { tag: tags.keyword,        color: '#4d8eff', fontWeight: '500' },
  { tag: tags.number,         color: '#ffb690' },
  { tag: tags.string,         color: '#b7c8e1' },
  { tag: tags.comment,        color: '#8c909f', fontStyle: 'italic' },
  { tag: tags.function(tags.variableName), color: '#adc6ff' },
  { tag: tags.variableName,   color: '#e5e2e1' },
  { tag: tags.bool,           color: '#4d8eff' },
  { tag: tags.operator,       color: '#c2c6d6' },
  { tag: tags.punctuation,    color: '#8c909f' },
])

// ── CodeMirror theme matching CATIA design system ────────────

const catiaTheme = EditorView.theme({
  '&': {
    background: '#0e0e0e',
    color:      '#e5e2e1',
    height:     '100%',
    fontSize:   '12px',
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
  },
  '.cm-content': { padding: '8px 0', caretColor: '#4d8eff' },
  '.cm-line': { padding: '0 8px' },
  '.cm-cursor': { borderLeftColor: '#4d8eff', borderLeftWidth: '2px' },
  '.cm-activeLine': { background: 'rgba(255,255,255,0.03)' },
  '.cm-gutters': {
    background: '#131313',
    borderRight: '1px solid #2e3040',
    color: '#424754',
    minWidth: '36px',
  },
  '.cm-activeLineGutter': { background: 'rgba(77,142,255,0.08)', color: '#8c909f' },
  '.cm-selectionBackground, ::selection': { background: 'rgba(77,142,255,0.25)' },
  '.cm-searchMatch': { background: 'rgba(249,115,22,0.3)', outline: '1px solid #f97316' },
  '.cm-scad-error-line': { background: 'rgba(226,75,74,0.12)' },
  '.cm-scad-error-mark': {
    borderBottom: '2px wavy #e24b4a',
    textDecoration: 'none',
  },
}, { dark: true })

// ── Error gutter marker ───────────────────────────────────────

class ErrorMarker extends GutterMarker {
  constructor(private msg: string) { super() }
  toDOM() {
    const el = document.createElement('div')
    el.className = 'cm-scad-err-marker'
    el.textContent = '⚠'
    el.title = this.msg
    el.style.cssText = 'color:#e24b4a;cursor:help;padding:0 4px'
    return el
  }
}

const setErrorEffect  = StateEffect.define<{ line:number; msg:string }[]>()
const clearErrorEffect = StateEffect.define<null>()

const errorField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(clearErrorEffect)) return Decoration.none
      if (e.is(setErrorEffect)) {
        const marks: any[] = []
        for (const { line, msg } of e.value) {
          try {
            const lineObj = tr.state.doc.line(line)
            marks.push(
              Decoration.mark({ class:'cm-scad-error-mark', attributes:{ title:msg } })
                .range(lineObj.from, lineObj.to)
            )
          } catch {}
        }
        return Decoration.set(marks, true)
      }
    }
    return deco
  },
  provide: f => EditorView.decorations.from(f),
})

// ── Panel class ───────────────────────────────────────────────

export class ScadEditorPanel {
  private container: HTMLElement
  private editorView: EditorView | null = null
  private statusBar: HTMLElement
  private runBtn: HTMLElement
  private errorList: HTMLElement
  private debounceTimer: ReturnType<typeof setTimeout> | null = null
  private lastSource = ''
  readonly DEBOUNCE_MS = 400

  constructor(private interpreter: ScadInterpreter) {
    this.container = this.buildDOM()
    this.setupInterpreter()
  }

  // ── Build the panel DOM ───────────────────────────────────

  private buildDOM(): HTMLElement {
    const panel = document.createElement('div')
    panel.className = 'scad-panel'
    panel.style.cssText = `
      display: flex; flex-direction: column; height: 100%;
      background: #131313; border-left: 1px solid #2e3040;`

    // Header bar
    const header = document.createElement('div')
    header.style.cssText = `
      display:flex; align-items:center; gap:6px;
      padding:0 8px; height:32px; background:#1b1b1c;
      border-bottom:1px solid #2e3040; flex-shrink:0;`

    const title = document.createElement('span')
    title.style.cssText = 'font-size:11px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:#8c909f'
    title.textContent = 'OpenSCAD'

    this.runBtn = document.createElement('button')
    this.runBtn.textContent = '▶ Run'
    this.runBtn.style.cssText = `
      margin-left:auto; height:22px; padding:0 10px;
      background:#4d8eff; border:none; border-radius:2px;
      color:#002e6a; font-size:11px; font-weight:600;
      cursor:pointer; font-family:inherit;`
    this.runBtn.addEventListener('click', () => this.runNow())

    const importBtn = document.createElement('button')
    importBtn.textContent = '↑ .scad'
    importBtn.style.cssText = `
      height:22px; padding:0 8px;
      background:#2a2a2a; border:1px solid #424754; border-radius:2px;
      color:#c2c6d6; font-size:11px; cursor:pointer; font-family:inherit;`
    importBtn.addEventListener('click', () => this.importScad())

    const exportBtn = document.createElement('button')
    exportBtn.textContent = '↓ .scad'
    exportBtn.style.cssText = importBtn.style.cssText
    exportBtn.addEventListener('click', () => this.exportScad())

    header.append(title, importBtn, exportBtn, this.runBtn)

    // CodeMirror editor area
    const editorWrap = document.createElement('div')
    editorWrap.style.cssText = 'flex:1; overflow:hidden; position:relative;'

    // Error list (collapsible)
    this.errorList = document.createElement('div')
    this.errorList.style.cssText = `
      display:none; max-height:80px; overflow-y:auto;
      background:#1b1b1c; border-top:1px solid #2e3040;
      font-family:'JetBrains Mono',monospace; font-size:10px; color:#ffb4ab;`

    // Status bar
    this.statusBar = document.createElement('div')
    this.statusBar.style.cssText = `
      height:22px; padding:0 8px; background:#131313;
      border-top:1px solid #2e3040; display:flex; align-items:center;
      font-family:'JetBrains Mono',monospace; font-size:10px; color:#8c909f;
      flex-shrink:0;`
    this.statusBar.textContent = 'Ready'

    panel.append(header, editorWrap, this.errorList, this.statusBar)

    // Init CodeMirror after DOM is ready
    requestAnimationFrame(() => this.initEditor(editorWrap))

    return panel
  }

  // ── CodeMirror init ───────────────────────────────────────

  private initEditor(container: HTMLElement): void {
    const startDoc = `// OpenSCAD Script
// Press ▶ Run or Ctrl+Enter to execute

difference() {
  cube([20, 20, 20], center=true);
  sphere(r=11, $fn=32);
}
`
    const state = EditorState.create({
      doc: startDoc,
      extensions: [
        history(),
        keymap.of([
          ...defaultKeymap,
          ...historyKeymap,
          { key:'Ctrl-Enter', run:() => { this.runNow(); return true } },
          { key:'Mod-Enter',  run:() => { this.runNow(); return true } },
        ]),
        catiaTheme,
        syntaxHighlighting(scadHighlight),
        errorField,
        EditorView.lineWrapping,
        EditorView.updateListener.of((update: ViewUpdate) => {
          if (update.docChanged) this.onSourceChange()
        }),
      ]
    })

    this.editorView = new EditorView({ state, parent: container })
    this.lastSource = startDoc
  }

  // ── Source change handler (debounced) ─────────────────────

  private onSourceChange(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer)
    this.debounceTimer = setTimeout(() => this.runNow(), this.DEBOUNCE_MS)
    this.setStatus('Editing…', '#8c909f')
  }

  private runNow(): void {
    if (this.debounceTimer) { clearTimeout(this.debounceTimer); this.debounceTimer = null }
    const source = this.editorView?.state.doc.toString() ?? ''
    if (source === this.lastSource && source !== '') return  // no change
    this.lastSource = source
    this.clearErrors()
    this.interpreter.run(source)
  }

  // ── Status handling ───────────────────────────────────────

  private setupInterpreter(): void {
    this.interpreter.onStatus = (status: ScadStatus) => {
      if (status.kind === 'running') {
        this.setStatus('Running…', '#adc6ff')
        this.runBtn.textContent = '⏳'
        this.runBtn.style.background = '#2a2a2a'
      }
      else if (status.kind === 'success') {
        this.setStatus(`✓ Done in ${status.elapsedMs}ms`, '#4ade80')
        this.runBtn.textContent = '▶ Run'
        this.runBtn.style.background = '#4d8eff'
        this.clearErrors()
      }
      else if (status.kind === 'error') {
        const err = status.error
        this.setStatus(`✗ ${err.message}`, '#ffb4ab')
        this.runBtn.textContent = '▶ Run'
        this.runBtn.style.background = '#4d8eff'
        if (err.kind === 'parse') this.showParseError(err)
        else                      this.showErrorMessage(err.message)
      }
    }
  }

  private setStatus(text: string, color: string): void {
    this.statusBar.textContent = text
    this.statusBar.style.color = color
  }

  private clearErrors(): void {
    this.errorList.style.display = 'none'
    this.errorList.innerHTML = ''
    this.editorView?.dispatch({ effects: clearErrorEffect.of(null) })
  }

  private showParseError(err: ScadParseError): void {
    // Mark error line in editor
    this.editorView?.dispatch({
      effects: setErrorEffect.of([{ line:err.line, msg:err.message }])
    })
    // Show in error list
    this.showErrorMessage(`Line ${err.line}, Col ${err.col}: ${err.message}`)
    // Scroll to error line
    try {
      const lineObj = this.editorView?.state.doc.line(err.line)
      if (lineObj) this.editorView?.dispatch({ selection:{ anchor:lineObj.from } })
    } catch {}
  }

  private showErrorMessage(msg: string): void {
    this.errorList.style.display = 'block'
    const row = document.createElement('div')
    row.style.padding = '3px 8px'
    row.textContent = `⚠ ${msg}`
    this.errorList.appendChild(row)
  }

  // ── Import / Export ───────────────────────────────────────

  private importScad(): void {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.scad'
    input.onchange = async () => {
      const file = input.files?.[0]
      if (!file) return
      const text = await file.text()
      this.editorView?.dispatch({
        changes: { from:0, to:this.editorView.state.doc.length, insert:text }
      })
      this.runNow()
    }
    input.click()
  }

  private exportScad(): void {
    const source = this.editorView?.state.doc.toString() ?? ''
    const blob   = new Blob([source], { type:'text/plain' })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement('a')
    a.href = url; a.download = 'script.scad'; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 3000)
  }

  // ── Load source from entity (when user re-opens a SCAD solid) ──

  loadSource(source: string): void {
    this.editorView?.dispatch({
      changes: { from:0, to:this.editorView.state.doc.length, insert:source }
    })
    this.lastSource = source
  }

  // ── Panel lifecycle (for DockingManager) ─────────────────

  getElement(): HTMLElement { return this.container }
  onShow(): void { this.editorView?.focus() }
  onHide(): void { if (this.debounceTimer) clearTimeout(this.debounceTimer) }
}

═══════════════════════════════════════════════════════════════
## STEP 14 — 2D profile primitives for linear_extrude
##
## Problem: `linear_extrude(h=10) circle(r=5)` needs the circle
## as a 2D polygon (list of [x,y] points), not a 3D sphere.
##
## Solution: Add a `profile_2d` CsgNode kind.
## ScadEvaluator detects 2D context inside linear_extrude/rotate_extrude
## and uses 2D-specific built-in handlers.
═══════════════════════════════════════════════════════════════

─── Add to ScadTypes.ts ─────────────────────────────────────

// Add to CsgNode union:
| { kind: 'profile_2d'; points: [number,number][] }   // 2D polygon for extrusion

─── Add to ScadEvaluator.ts — 2D context modules ────────────

// In ScadEvaluator.evalModuleCall — replace linear_extrude case:

case 'linear_extrude': {
  const [h, twist, center, slices] = A(['height','twist','center','slices'], [1, 0, false, 20])

  // Children must be 2D profiles — evaluate in 2D mode
  const profiles = this.evalChildren2D(stmt.children, env, localRes)
  if (profiles.length === 0) return []

  // Merge profiles into one (union of 2D shapes)
  const profile = this.mergeProfiles(profiles)

  return [{ kind:'linear_extrude', profile, h:this.num(h),
            twist:this.num(twist), slices:this.num(slices) }]
}

case 'rotate_extrude': {
  const [angle, fn] = A(['angle','$fn'], [360, localRes.fn])
  const profiles    = this.evalChildren2D(stmt.children, env, localRes)
  if (profiles.length === 0) return []
  const profile     = this.mergeProfiles(profiles)
  const segs        = this.num(fn) > 0 ? this.num(fn) : computeSegments(10, localRes)
  return [{ kind:'rotate_extrude', profile, angle:this.num(angle), fn:segs }]
}

// New method — evaluates children as 2D profiles:
private evalChildren2D(stmts: ScadStmt[], env: Env, res: Resolution): [number,number][][] {
  const profiles: [number,number][][] = []
  for (const stmt of stmts) {
    if (stmt.kind !== 'module_call') continue
    const profile = this.evalModule2D(stmt, env, res)
    if (profile) profiles.push(profile)
  }
  return profiles
}

// 2D built-in evaluation — returns polygon points or null:
private evalModule2D(stmt: any, env: Env, res: Resolution): [number,number][] | null {
  const A = (params: string[], defs: ScadVal[]) =>
    this.resolveArgs(params, defs, stmt.args, env)

  switch (stmt.name) {

    case 'circle': {
      const [r, d] = A(['r','d'], [1, null])
      const radius = d != null ? this.num(d)/2 : this.num(r)
      const segs   = computeSegments(radius, res)
      const pts: [number,number][] = []
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * Math.PI * 2
        pts.push([radius * Math.cos(a), radius * Math.sin(a)])
      }
      return pts
    }

    case 'square': {
      const [size, center] = A(['size','center'], [[1,1], false])
      const [w, h] = this.toV2(size)
      const ox = center ? -w/2 : 0
      const oy = center ? -h/2 : 0
      return [[ox,oy],[ox+w,oy],[ox+w,oy+h],[ox,oy+h]]
    }

    case 'polygon': {
      const [pts, paths] = A(['points','paths'], [[], null])
      const points = (pts as ScadVal[]).map(p => {
        const arr = p as ScadVal[]
        return [this.num(arr[0]), this.num(arr[1])] as [number,number]
      })
      if (paths == null) return points
      // Use first path as the outer boundary
      const path0 = (paths as ScadVal[])[0] as ScadVal[]
      return path0.map(i => points[this.num(i)])
    }

    case 'translate': {
      const [v] = A(['v'], [[0,0,0]])
      const [dx, dy] = this.toV2(v)
      const child = stmt.children[0]
      if (!child) return null
      const inner = this.evalModule2D(child, env, res)
      if (!inner) return null
      return inner.map(([x,y]) => [x+dx, y+dy])
    }

    case 'rotate': {
      const [v] = A(['v','a'], [[0,0,0], null])
      const angleRad = this.num(Array.isArray(v) ? (v[2] ?? 0) : v) * Math.PI / 180
      const cos = Math.cos(angleRad), sin = Math.sin(angleRad)
      const child = stmt.children[0]
      if (!child) return null
      const inner = this.evalModule2D(child, env, res)
      if (!inner) return null
      return inner.map(([x,y]) => [x*cos - y*sin, x*sin + y*cos])
    }

    case 'scale': {
      const [v] = A(['v'], [[1,1,1]])
      const [sx, sy] = this.toV2(v)
      const child = stmt.children[0]
      if (!child) return null
      const inner = this.evalModule2D(child, env, res)
      if (!inner) return null
      return inner.map(([x,y]) => [x*sx, y*sy])
    }

    case 'mirror': {
      const [v] = A(['v'], [[1,0,0]])
      const [nx, ny] = this.toV2(v)
      const len = Math.sqrt(nx*nx + ny*ny)
      const nnx = nx/len, nny = ny/len
      const child = stmt.children[0]
      if (!child) return null
      const inner = this.evalModule2D(child, env, res)
      if (!inner) return null
      // Reflect across line with normal [nnx, nny]
      return inner.map(([x,y]) => {
        const dot = x*nnx + y*nny
        return [x - 2*dot*nnx, y - 2*dot*nny] as [number,number]
      })
    }

    case 'union':
    case 'difference':
    case 'intersection': {
      // For 2D boolean, return first child's profile (simplified MVP)
      // Full 2D boolean requires Clipper.js
      const child = stmt.children[0]
      if (!child) return null
      return this.evalModule2D(child, env, res)
    }

    default:
      // Try user-defined module — resolve body as 2D
      const modDef = this.mods.get(stmt.name)
      if (modDef) {
        const inner: Env = new Map(env)
        const vals = this.resolveArgs(
          modDef.params.map(p => p.name),
          modDef.params.map(p => p.default ? this.evalExpr(p.default, env) : null),
          stmt.args, env
        )
        modDef.params.forEach((p, i) => inner.set(p.name, vals[i]))
        for (const s of modDef.body) {
          if (s.kind === 'module_call') {
            const result = this.evalModule2D(s, inner, res)
            if (result) return result
          }
        }
      }
      return null
  }
}

private mergeProfiles(profiles: [number,number][][]): [number,number][][] {
  return profiles   // return as array of separate contours
}

private toV2(v: ScadVal): [number, number] {
  if (Array.isArray(v)) return [this.num(v[0]??0), this.num(v[1]??0)]
  if (typeof v === 'number') return [v, v]
  return [0, 0]
}

─── Add linear_extrude to ScadExecutor ──────────────────────

// In ScadExecutor.execute — add after the 'rotate' case:

case 'linear_extrude': {
  if (!node.profile || node.profile.length === 0) return null

  // Flatten profile to required format for createExtrude
  // createExtrude expects: profile as flat [x0,y0, x1,y1, ...], height, twist
  const flatProfile = node.profile[0].flat()
  const defl = resolutionToDeflection(node.slices || 20)

  const shapeId = await (this.occ as any).createExtrude(
    flatProfile, node.h, node.twist ?? 0, defl, id
  )
  if (!shapeId) return null
  this.created.push(shapeId)
  return shapeId
}

case 'rotate_extrude': {
  if (!node.profile || node.profile.length === 0) return null

  const flatProfile = node.profile[0].flat()
  const defl = resolutionToDeflection(node.fn || 32)

  const shapeId = await (this.occ as any).createRevolve(
    flatProfile, node.angle, defl, id
  )
  if (!shapeId) return null
  this.created.push(shapeId)
  return shapeId
}

═══════════════════════════════════════════════════════════════
## STEP 15 — Color metadata flow to viewer
═══════════════════════════════════════════════════════════════

// OpenSCAD color() assigns a display color to a solid.
// In the CsgNode tree, color is wrapped around the geometry:
// { kind:'color', rgba:[1,0,0,1], child:{ kind:'box', ... } }
//
// Strategy: store color on the Solid3D entity and apply it
// to the Three.js material when addSolid3D is called.

─── Solid3D.ts — add color field ────────────────────────────

class Solid3D extends Entity {
  // ... existing fields ...
  scadColor?: [number, number, number, number]  // RGBA 0–1 range
}

─── ScadExecutor.ts — propagate color ───────────────────────

// In execute(), 'color' case — pass color hint through execution:

case 'color': {
  const child = await this.execute(node.child)
  if (!child) return null
  // Store color so the interpreter can apply it to the resulting Solid3D
  this.colorMap.set(child, node.rgba)
  return child
}

// In ScadExecutor class field:
readonly colorMap: Map<string, [number,number,number,number]> = new Map()

─── ScadInterpreter.ts — apply color to Solid3D ─────────────

// After execute() returns resultId, before creating the Solid3D:
const color = this.executor?.colorMap.get(resultId ?? '') ?? null
if (color) solid.scadColor = color

─── app.ts — pass color to viewer ───────────────────────────

// In addEntityToViewer() for Solid3D:
if (entity instanceof Solid3D) {
  let color = entity.color ?? layer?.color ?? 7
  let opacity = 1.0

  // Override with SCAD color if present
  if (entity.scadColor) {
    const [r, g, b, a] = entity.scadColor
    // Convert 0–1 RGB to hex integer
    color = ((Math.round(r*255) << 16) | (Math.round(g*255) << 8) | Math.round(b*255))
    opacity = a
  }

  viewer.addSolid3D(entity, layer?.name, color, isVisible)

  // Apply opacity if not fully opaque
  if (opacity < 1.0) {
    viewer.setSolidOpacity(entity.id, opacity)
  }
}

─── Viewer.ts — setSolidOpacity ─────────────────────────────

setSolidOpacity(id: string, opacity: number): void {
  const obj = this.scene.getObjectByName(id)
  if (!obj) return
  obj.traverse(child => {
    if ((child as any).material) {
      const mat = (child as any).material
      mat.transparent = opacity < 1.0
      mat.opacity     = opacity
      mat.needsUpdate = true
    }
  })
  this.scheduleRender()
}

═══════════════════════════════════════════════════════════════
## STEP 16 — include <file> handling
═══════════════════════════════════════════════════════════════

// OpenSCAD's `include <utils.scad>` embeds another file.
// Strategy: maintain a virtual file registry in the interpreter.
// Users can add files via the editor panel ("Add Library" button).
// Files stored in IndexedDB (via existing DatabaseService).

─── ScadInterpreter.ts — virtual file registry ──────────────

class ScadInterpreter {
  private fileRegistry: Map<string, string> = new Map()

  // Register a file so include <name> can find it
  registerFile(name: string, source: string): void {
    this.fileRegistry.set(name, source)
    this.fileRegistry.set(name.replace(/\\/g, '/'), source)
  }

  // Load files from IndexedDB on startup
  async loadSavedLibraries(): Promise<void> {
    try {
      const db = DatabaseService.getInstance()
      const libs = await db.scadLibraries.find().exec()
      for (const lib of libs) {
        this.registerFile(lib.name, lib.source)
      }
    } catch {}
  }

  // Handle include in the AST before evaluation:
  private resolveIncludes(stmts: ScadStmt[], depth = 0): ScadStmt[] {
    if (depth > 10) throw { kind:'runtime', message:'Include depth limit exceeded', callStack:[] }

    const result: ScadStmt[] = []
    for (const stmt of stmts) {
      if (stmt.kind === 'include') {
        const source = this.fileRegistry.get(stmt.path)
        if (!source) {
          console.warn(`[ScadInterpreter] include <${stmt.path}> not found`)
          continue
        }
        const tokens  = new ScadLexer().tokenize(source)
        const subAst  = new ScadParser(tokens).parse()
        result.push(...this.resolveIncludes(subAst, depth + 1))
      } else if (stmt.kind === 'use') {
        // use <file> imports definitions only (no execution)
        const source = this.fileRegistry.get(stmt.path)
        if (!source) { console.warn(`use <${stmt.path}> not found`); continue }
        const tokens = new ScadLexer().tokenize(source)
        const subAst = new ScadParser(tokens).parse()
        // Only add module/function definitions, skip top-level calls
        result.push(...subAst.filter(s => s.kind === 'module_def' || s.kind === 'func_def'))
      } else {
        result.push(stmt)
      }
    }
    return result
  }
}

─── ScadEditorPanel.ts — library manager ────────────────────

// Add "Add Library" button to header:

const libBtn = document.createElement('button')
libBtn.textContent = '+ Library'
libBtn.style.cssText = importBtn.style.cssText
libBtn.addEventListener('click', () => this.addLibrary())

private addLibrary(): void {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.scad'
  input.onchange = async () => {
    const file = input.files?.[0]
    if (!file) return
    const source = await file.text()
    const name   = file.name

    // Register with interpreter
    this.interpreter.registerFile(name, source)

    // Persist to IndexedDB
    try {
      const db = DatabaseService.getInstance()
      await db.scadLibraries.upsert({ id:name, name, source })
      this.showNotification(`Library '${name}' added`)
    } catch {}
  }
  input.click()
}

═══════════════════════════════════════════════════════════════
## STEP 17 — Test suite
## File: core/engine/scad/__tests__/ScadInterpreter.test.ts
═══════════════════════════════════════════════════════════════

import { ScadLexer }     from '../ScadLexer'
import { ScadParser }    from '../ScadParser'
import { ScadEvaluator } from '../ScadEvaluator'

// ── Lexer tests ───────────────────────────────────────────────

describe('ScadLexer', () => {
  test('tokenises number literals', () => {
    const tokens = new ScadLexer().tokenize('1 2.5 1e3')
    expect(tokens.filter(t => t.kind === 'NUM').map(t => t.value))
      .toEqual(['1', '2.5', '1e3'])
  })

  test('tokenises keywords', () => {
    const tokens = new ScadLexer().tokenize('module function for if else')
    const kinds  = tokens.filter(t => t.kind !== 'EOF').map(t => t.kind)
    expect(kinds).toEqual(['MODULE','FUNCTION','FOR','IF','ELSE'])
  })

  test('strips line comments', () => {
    const tokens = new ScadLexer().tokenize('1 // comment\n2')
    expect(tokens.filter(t => t.kind === 'NUM')).toHaveLength(2)
  })

  test('strips block comments', () => {
    const tokens = new ScadLexer().tokenize('1 /* comment */ 2')
    expect(tokens.filter(t => t.kind === 'NUM')).toHaveLength(2)
  })
})

// ── Parser tests ──────────────────────────────────────────────

describe('ScadParser', () => {
  function parse(src: string) {
    return new ScadParser(new ScadLexer().tokenize(src)).parse()
  }

  test('parses assignment', () => {
    const ast = parse('x = 5;')
    expect(ast[0]).toMatchObject({ kind:'assign', name:'x', value:{ kind:'num', value:5 } })
  })

  test('parses module call with named args', () => {
    const ast = parse('cube([1,2,3], center=true);')
    expect(ast[0]).toMatchObject({
      kind:'module_call', name:'cube',
      args:[
        { name:null },
        { name:'center', value:{ kind:'bool', value:true } }
      ]
    })
  })

  test('parses module definition', () => {
    const ast = parse('module foo(a=1, b=2) { cube([a,b,1]); }')
    expect(ast[0]).toMatchObject({ kind:'module_def', name:'foo' })
  })

  test('parses ternary expression', () => {
    const ast = parse('x = a > 0 ? 1 : -1;')
    const val = (ast[0] as any).value
    expect(val.kind).toBe('ternary')
  })

  test('parses range', () => {
    const ast = parse('for(i=[0:2:10]) sphere(i);')
    expect(ast[0]).toMatchObject({ kind:'for', var:'i' })
    expect((ast[0] as any).range).toMatchObject({ kind:'range' })
  })

  test('throws parse error on bad syntax', () => {
    expect(() => parse('cube([')).toThrow()
  })
})

// ── Evaluator tests ───────────────────────────────────────────

describe('ScadEvaluator', () => {
  function evaluate(src: string) {
    const ast = new ScadParser(new ScadLexer().tokenize(src)).parse()
    return new ScadEvaluator().evaluate(ast)
  }

  test('cube produces box CsgNode', () => {
    const csg = evaluate('cube([10,5,3]);')
    expect(csg[0]).toMatchObject({ kind:'box', size:[10,5,3], center:false })
  })

  test('cube with center=true', () => {
    const csg = evaluate('cube(10, center=true);')
    expect(csg[0]).toMatchObject({ kind:'box', center:true })
  })

  test('sphere resolves radius', () => {
    const csg = evaluate('sphere(r=5);')
    expect(csg[0]).toMatchObject({ kind:'sphere', r:5 })
  })

  test('sphere diameter variant', () => {
    const csg = evaluate('sphere(d=10);')
    expect(csg[0]).toMatchObject({ kind:'sphere', r:5 })
  })

  test('union wraps children', () => {
    const csg = evaluate('union() { cube([1,1,1]); sphere(1); }')
    expect(csg[0]).toMatchObject({ kind:'union' })
    expect((csg[0] as any).children).toHaveLength(2)
  })

  test('difference wraps children', () => {
    const csg = evaluate('difference() { cube([10,10,10]); sphere(r=6); }')
    expect(csg[0]).toMatchObject({ kind:'difference' })
  })

  test('translate produces CsgNode', () => {
    const csg = evaluate('translate([1,2,3]) cube([1,1,1]);')
    expect(csg[0]).toMatchObject({ kind:'translate', v:[1,2,3] })
  })

  test('for loop expands to multiple nodes', () => {
    const csg = evaluate('for(i=[0:2]) sphere(r=i+1);')
    // for [0:2] → 3 iterations (0,1,2)
    expect(csg).toHaveLength(3)
  })

  test('module definition and call', () => {
    const csg = evaluate(`
      module mycube(s=5) { cube([s,s,s]); }
      mycube(10);
    `)
    expect(csg[0]).toMatchObject({ kind:'box', size:[10,10,10] })
  })

  test('$fn controls sphere resolution', () => {
    const csg64 = evaluate('sphere(r=5, $fn=64);')
    const csg8  = evaluate('sphere(r=5, $fn=8);')
    expect((csg64[0] as any).fn).toBe(64)
    expect((csg8[0]  as any).fn).toBe(8)
  })

  test('built-in sin/cos', () => {
    const csg = evaluate('x = sin(90); y = cos(0); cube([x, y, 1]);')
    const box = csg[0] as any
    expect(box.size[0]).toBeCloseTo(1.0)   // sin(90°) = 1
    expect(box.size[1]).toBeCloseTo(1.0)   // cos(0°)  = 1
  })

  test('conditional if/else', () => {
    const csg = evaluate('x = 5; if (x > 3) { cube([1,1,1]); } else { sphere(1); }')
    expect(csg[0]).toMatchObject({ kind:'box' })
  })

  test('variable scoping in module', () => {
    const csg = evaluate(`
      r = 10;
      module ring(r=5) { sphere(r=r); }
      ring(3);
    `)
    expect((csg[0] as any).r).toBe(3)  // uses local r=3, not outer r=10
  })

  test('nested difference', () => {
    const csg = evaluate(`
      difference() {
        cube([20,20,20]);
        translate([5,5,0]) cylinder(h=21, r=4, $fn=16);
      }
    `)
    expect(csg[0].kind).toBe('difference')
    const diff = csg[0] as any
    expect(diff.children[1].kind).toBe('translate')
    expect(diff.children[1].child.kind).toBe('cylinder')
  })
})

═══════════════════════════════════════════════════════════════
## STEP 18 — Standard library snippets
##
## Pre-register common MCAD-compatible modules so users
## can use them without importing files.
## Add to ScadInterpreter constructor.
═══════════════════════════════════════════════════════════════

// In ScadInterpreter constructor:
this.registerFile('std.scad', SCAD_STDLIB)

const SCAD_STDLIB = `
// WebCAD built-in OpenSCAD standard library

// Rounded box using minkowski (simplified: just use regular cube)
module rounded_cube(size, r=1, center=false) {
  cube(size, center=center);
}

// Regular polygon (2D)
module regular_polygon(n=6, r=1) {
  circle(r=r, $fn=n);
}

// Hollow cylinder (tube)
module tube(h, r_outer, r_inner, center=false) {
  difference() {
    cylinder(h=h, r=r_outer, center=center);
    cylinder(h=h*1.01, r=r_inner, center=center);
  }
}

// Hex bolt head
module hex_head(d, h) {
  cylinder(h=h, r=d/2, $fn=6);
}

// Grid of copies
module grid(nx=2, ny=2, spacing=10) {
  for (ix=[0:nx-1]) for (iy=[0:ny-1])
    translate([ix*spacing, iy*spacing, 0])
      children();
}

// Mirror-copy (keep original + mirrored)
module mirror_copy(v=[1,0,0]) {
  children();
  mirror(v) children();
}

// Linear copy along axis
module linear_copy(n=2, v=[10,0,0]) {
  for (i=[0:n-1])
    translate([v[0]*i, v[1]*i, v[2]*i])
      children();
}

// Fillet box (chamfered edges — approximated)
module fillet_box(size, r=1) {
  s = size;
  cube([s[0]-r*2, s[1], s[2]], center=true);
  cube([s[0], s[1]-r*2, s[2]], center=true);
  cube([s[0], s[1], s[2]-r*2], center=true);
}
`

═══════════════════════════════════════════════════════════════
## CONSTRAINTS
═══════════════════════════════════════════════════════════════

- Do NOT implement hull() or minkowski() — both require complex
  OCC operations not currently in the Worker. Return empty and warn.

- Do NOT implement surface() — requires heightmap parsing.

- Do NOT implement import() — file import of STL/DXF inside SCAD
  requires separate pipeline. Return empty and warn.

- Do NOT implement text() — requires SHX/TTF outline extraction.
  Log: "[ScadEvaluator] text() not supported in WebCAD SCAD"

- 2D boolean operations inside polygon()/difference() of 2D profiles
  (for linear_extrude with complex holes): implement as "first child wins"
  in MVP. Full 2D CSG requires Clipper.js integration (Phase 2).

- ScadEditorPanel must NOT block the main thread — all ScadInterpreter
  calls are async and the UI must remain responsive during execution.

- TypeScript strict mode: all CsgNode kinds must be exhaustively handled
  in switch statements — add a default case that logs and returns null.