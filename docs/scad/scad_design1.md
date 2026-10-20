# Agent Task: Implement OpenSCAD Interpreter for WebCAD
# Model: Gemini | Framework: Antigravity
# Scope: Full interpreter pipeline — Lexer → Parser → Evaluator → Executor → UI

# Read these files BEFORE writing any code:
#   core/commands/types.ts          ← Command, CommandAction types
#   core/commands/BooleanCommand.ts ← Pattern for async OCC commands
#   core/io/OCCWorker.ts            ← Existing createBox/createBoolean structure
#   core/io/OCCWorkerClient.ts      ← Promise-based Worker message pattern
#   core/model/Solid3D.ts           ← Solid3D entity structure
#   core/engine/handlers/transform/BooleanHandler.ts ← Pattern for solid result handling
#   ui/DockingManager.ts            ← Panel registration pattern
#   app.ts                          ← ResultDispatcher + addEntity pattern

═══════════════════════════════════════════════════════════════
## STEP 1 — ScadTypes.ts (create)
## File: core/engine/scad/ScadTypes.ts
═══════════════════════════════════════════════════════════════

export type TokenKind =
  | 'NUM' | 'STR' | 'IDENT' | 'TRUE' | 'FALSE' | 'UNDEF'
  | 'MODULE' | 'FUNCTION' | 'FOR' | 'LET' | 'IF' | 'ELSE'
  | 'INCLUDE' | 'USE'
  | 'PLUS' | 'MINUS' | 'STAR' | 'SLASH' | 'PERCENT' | 'CARET'
  | 'BANG' | 'AMP2' | 'PIPE2' | 'EQ2' | 'NEQ'
  | 'LT' | 'GT' | 'LEQ' | 'GEQ' | 'EQ'
  | 'LPAREN' | 'RPAREN' | 'LBRACE' | 'RBRACE'
  | 'LSQUARE' | 'RSQUARE'
  | 'SEMI' | 'COMMA' | 'QUESTION' | 'COLON' | 'DOT' | 'EOF'

export interface Token {
  kind:  TokenKind
  value: string
  line:  number
  col:   number
}

// ── AST nodes ──────────────────────────────────────────────────

export type ScadExpr =
  | { kind: 'num';    value: number }
  | { kind: 'str';    value: string }
  | { kind: 'bool';   value: boolean }
  | { kind: 'undef' }
  | { kind: 'ident';  name: string }
  | { kind: 'vec';    items: ScadExpr[] }
  | { kind: 'range';  start: ScadExpr; step: ScadExpr | null; end: ScadExpr }
  | { kind: 'index';  obj: ScadExpr; idx: ScadExpr }
  | { kind: 'dot';    obj: ScadExpr; field: string }
  | { kind: 'unary';  op: '-' | '!'; operand: ScadExpr }
  | { kind: 'binary'; op: string; left: ScadExpr; right: ScadExpr }
  | { kind: 'ternary'; cond: ScadExpr; then: ScadExpr; else: ScadExpr }
  | { kind: 'call';   name: string; args: ScadArg[] }
  | { kind: 'let';    bindings: { name: string; value: ScadExpr }[]; body: ScadExpr }

export interface ScadArg {
  name:  string | null   // null = positional
  value: ScadExpr
}

export type ScadStmt =
  | { kind: 'assign';     name: string; value: ScadExpr }
  | { kind: 'module_def'; name: string; params: ScadParam[]; body: ScadStmt[] }
  | { kind: 'func_def';   name: string; params: ScadParam[]; expr: ScadExpr }
  | { kind: 'module_call'; name: string; args: ScadArg[]; children: ScadStmt[]; line: number }
  | { kind: 'for';        var: string; range: ScadExpr; body: ScadStmt[] }
  | { kind: 'if';         cond: ScadExpr; then: ScadStmt[]; else_: ScadStmt[] }
  | { kind: 'include';    path: string }
  | { kind: 'use';        path: string }

export interface ScadParam {
  name:    string
  default: ScadExpr | null
}

// ── Fully-evaluated CSG tree (ready for OCC) ───────────────────

type V3 = [number, number, number]
type V2 = [number, number]

export type CsgNode =
  | { kind: 'box';       pos: V3; size: V3; center: boolean }
  | { kind: 'sphere';    pos: V3; r: number; fn: number }
  | { kind: 'cylinder';  pos: V3; h: number; r1: number; r2: number; center: boolean; fn: number }
  | { kind: 'torus';     pos: V3; r1: number; r2: number }
  | { kind: 'polyhedron'; points: V3[]; faces: number[][] }
  | { kind: 'union';        children: CsgNode[] }
  | { kind: 'difference';   children: CsgNode[] }
  | { kind: 'intersection'; children: CsgNode[] }
  | { kind: 'translate'; v: V3;   child: CsgNode }
  | { kind: 'rotate';    v: V3;   child: CsgNode }
  | { kind: 'scale';     v: V3;   child: CsgNode }
  | { kind: 'mirror';    v: V3;   child: CsgNode }
  | { kind: 'color';     rgba: [number,number,number,number]; child: CsgNode }
  | { kind: 'linear_extrude'; profile: V3[][]; h: number; twist: number; slices: number }
  | { kind: 'rotate_extrude'; profile: V3[][]; angle: number; fn: number }
  | { kind: 'import_stl'; data: ArrayBuffer }
  | { kind: 'empty' }

// ── Error types ────────────────────────────────────────────────

export interface ScadParseError   { kind:'parse';   message:string; line:number; col:number }
export interface ScadRuntimeError { kind:'runtime'; message:string; callStack:string[] }
export interface ScadOccError     { kind:'occ';     message:string; nodeDesc:string }
export type ScadError = ScadParseError | ScadRuntimeError | ScadOccError

// ── Resolution context ($fn/$fa/$fs) ──────────────────────────

export interface Resolution { fn:number; fa:number; fs:number }
export const DEFAULT_RESOLUTION: Resolution = { fn:0, fa:12, fs:2 }

export function computeSegments(r: number, res: Resolution): number {
  if (res.fn > 0) return Math.max(3, Math.floor(res.fn))
  const byAngle = Math.ceil(360 / res.fa)
  const bySize  = r > 0 ? Math.ceil((2 * Math.PI * r) / res.fs) : 3
  return Math.max(byAngle, bySize, 3)
}

export function resolutionToDeflection(segs: number): number {
  return Math.max(0.01, 5.0 / segs)
}

═══════════════════════════════════════════════════════════════
## STEP 2 — ScadLexer.ts (create)
## File: core/engine/scad/ScadLexer.ts
═══════════════════════════════════════════════════════════════

import { Token, TokenKind } from './ScadTypes'

export class ScadLexer {
  private pos  = 0
  private line = 1
  private col  = 1
  private src  = ''

  tokenize(src: string): Token[] {
    this.src = src; this.pos = 0; this.line = 1; this.col = 1
    const tokens: Token[] = []

    while (this.pos < this.src.length) {
      this.skipWhitespaceAndComments()
      if (this.pos >= this.src.length) break

      const tok = this.nextToken()
      if (tok) tokens.push(tok)
    }

    tokens.push({ kind:'EOF', value:'', line:this.line, col:this.col })
    return tokens
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos]

      // Whitespace
      if (/\s/.test(ch)) {
        if (ch === '\n') { this.line++; this.col = 1 } else { this.col++ }
        this.pos++; continue
      }

      // Line comment
      if (this.src.startsWith('//', this.pos)) {
        while (this.pos < this.src.length && this.src[this.pos] !== '\n') this.pos++
        continue
      }

      // Block comment
      if (this.src.startsWith('/*', this.pos)) {
        this.pos += 2
        while (this.pos < this.src.length && !this.src.startsWith('*/', this.pos)) {
          if (this.src[this.pos] === '\n') { this.line++; this.col = 1 } else { this.col++ }
          this.pos++
        }
        this.pos += 2; continue
      }

      break
    }
  }

  private nextToken(): Token | null {
    const startLine = this.line, startCol = this.col
    const ch = this.src[this.pos]
    const mk = (kind: TokenKind, value: string): Token => ({ kind, value, line:startLine, col:startCol })

    // Numbers (including negative handled by parser as unary -)
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(this.src[this.pos+1] || ''))) {
      return mk('NUM', this.readNumber())
    }

    // Strings
    if (ch === '"') return mk('STR', this.readString())

    // Identifiers and keywords
    if (/[a-zA-Z_$]/.test(ch)) {
      const ident = this.readIdent()
      const kwMap: Record<string, TokenKind> = {
        'true':'TRUE','false':'FALSE','undef':'UNDEF',
        'module':'MODULE','function':'FUNCTION',
        'for':'FOR','let':'LET','if':'IF','else':'ELSE',
        'include':'INCLUDE','use':'USE',
      }
      return mk(kwMap[ident] ?? 'IDENT', ident)
    }

    // Two-char operators (check before single-char)
    const two = this.src.slice(this.pos, this.pos+2)
    const twoMap: Record<string, TokenKind> = {
      '&&':'AMP2','||':'PIPE2','==':'EQ2','!=':'NEQ',
      '<=':'LEQ','>=':'GEQ',
    }
    if (twoMap[two]) { this.pos += 2; this.col += 2; return mk(twoMap[two], two) }

    // Single-char operators
    const oneMap: Record<string, TokenKind> = {
      '+':'PLUS','-':'MINUS','*':'STAR','/':'SLASH','%':'PERCENT','^':'CARET',
      '!':'BANG','<':'LT','>':'GT','=':'EQ',
      '(':'LPAREN',')':'RPAREN','{':'LBRACE','}':'RBRACE',
      '[':'LSQUARE',']':'RSQUARE',
      ';':'SEMI',',':'COMMA','?':'QUESTION',':':'COLON','.':'DOT',
    }
    if (oneMap[ch]) { this.pos++; this.col++; return mk(oneMap[ch], ch) }

    // Unknown — skip with warning
    console.warn(`[ScadLexer] Unknown character '${ch}' at line ${this.line}`)
    this.pos++; this.col++
    return null
  }

  private readNumber(): string {
    const start = this.pos
    while (this.pos < this.src.length && /[0-9._eE+\-]/.test(this.src[this.pos])) {
      this.pos++; this.col++
    }
    return this.src.slice(start, this.pos)
  }

  private readString(): string {
    this.pos++; this.col++ // skip opening "
    let s = ''
    while (this.pos < this.src.length && this.src[this.pos] !== '"') {
      if (this.src[this.pos] === '\\') {
        this.pos++; this.col++
        const esc: Record<string,string> = { n:'\n', t:'\t', r:'\r', '"':'"', '\\':'\\' }
        s += esc[this.src[this.pos]] ?? this.src[this.pos]
      } else {
        s += this.src[this.pos]
      }
      this.pos++; this.col++
    }
    this.pos++; this.col++ // skip closing "
    return s
  }

  private readIdent(): string {
    const start = this.pos
    while (this.pos < this.src.length && /[a-zA-Z0-9_$]/.test(this.src[this.pos])) {
      this.pos++; this.col++
    }
    return this.src.slice(start, this.pos)
  }
}

═══════════════════════════════════════════════════════════════
## STEP 3 — ScadParser.ts (create)
## File: core/engine/scad/ScadParser.ts
═══════════════════════════════════════════════════════════════

import { Token, ScadExpr, ScadStmt, ScadArg, ScadParam, ScadParseError } from './ScadTypes'

export class ScadParser {
  private pos = 0
  constructor(private tokens: Token[]) {}

  parse(): ScadStmt[] {
    const stmts: ScadStmt[] = []
    while (!this.at('EOF')) stmts.push(this.parseStmt())
    return stmts
  }

  // ── Statements ────────────────────────────────────────────

  private parseStmt(): ScadStmt {
    const tok = this.peek()

    if (tok.kind === 'MODULE') return this.parseModuleDef()
    if (tok.kind === 'FUNCTION') return this.parseFuncDef()
    if (tok.kind === 'FOR') return this.parseFor()
    if (tok.kind === 'IF') return this.parseIf()
    if (tok.kind === 'INCLUDE') return this.parseInclude()
    if (tok.kind === 'USE') return this.parseUse()
    if (tok.kind === 'SEMI') { this.advance(); return { kind:'module_call', name:'union', args:[], children:[], line:tok.line } }

    // Assignment: ident = expr ;
    if (tok.kind === 'IDENT' && this.peek(1).kind === 'EQ') {
      const name = this.advance().value
      this.expect('EQ')
      const value = this.parseExpr()
      this.expect('SEMI')
      return { kind:'assign', name, value }
    }

    // Module call: ident(args) children | ;
    if (tok.kind === 'IDENT') {
      return this.parseModuleCall()
    }

    this.error(`Unexpected token: ${tok.value}`)
  }

  private parseModuleDef(): ScadStmt {
    this.expect('MODULE')
    const name   = this.expect('IDENT').value
    const params = this.parseParamList()
    const body   = this.parseBlock()
    return { kind:'module_def', name, params, body }
  }

  private parseFuncDef(): ScadStmt {
    this.expect('FUNCTION')
    const name   = this.expect('IDENT').value
    const params = this.parseParamList()
    this.expect('EQ')
    const expr = this.parseExpr()
    this.expect('SEMI')
    return { kind:'func_def', name, params, expr }
  }

  private parseFor(): ScadStmt {
    const line = this.peek().line
    this.expect('FOR')
    this.expect('LPAREN')
    const varName = this.expect('IDENT').value
    this.expect('EQ')
    const range = this.parseExpr()
    this.expect('RPAREN')
    const body = this.at('LBRACE') ? this.parseBlock() : [this.parseStmt()]
    return { kind:'for', var:varName, range, body }
  }

  private parseIf(): ScadStmt {
    this.expect('IF')
    this.expect('LPAREN')
    const cond = this.parseExpr()
    this.expect('RPAREN')
    const then_ = this.at('LBRACE') ? this.parseBlock() : [this.parseStmt()]
    let else_: ScadStmt[] = []
    if (this.at('ELSE')) {
      this.advance()
      else_ = this.at('IF') ? [this.parseIf()] :
              this.at('LBRACE') ? this.parseBlock() : [this.parseStmt()]
    }
    return { kind:'if', cond, then:then_, else_}
  }

  private parseModuleCall(): ScadStmt {
    const line = this.peek().line
    const name = this.advance().value   // IDENT
    const args = this.parseArgList()
    // Children: { ... } or single stmt or ;
    let children: ScadStmt[] = []
    if (this.at('LBRACE')) {
      children = this.parseBlock()
    } else if (!this.at('SEMI')) {
      children = [this.parseStmt()]
    } else {
      this.advance() // consume ;
    }
    return { kind:'module_call', name, args, children, line }
  }

  private parseInclude(): ScadStmt {
    this.expect('INCLUDE')
    this.expect('LT')
    let path = ''
    while (!this.at('GT') && !this.at('EOF')) path += this.advance().value
    this.expect('GT')
    return { kind:'include', path }
  }

  private parseUse(): ScadStmt {
    this.expect('USE')
    this.expect('LT')
    let path = ''
    while (!this.at('GT') && !this.at('EOF')) path += this.advance().value
    this.expect('GT')
    return { kind:'use', path }
  }

  private parseBlock(): ScadStmt[] {
    this.expect('LBRACE')
    const stmts: ScadStmt[] = []
    while (!this.at('RBRACE') && !this.at('EOF')) stmts.push(this.parseStmt())
    this.expect('RBRACE')
    return stmts
  }

  // ── Expressions (Pratt parser) ────────────────────────────

  private parseExpr(minPrec = 0): ScadExpr {
    let left = this.parseUnary()

    while (true) {
      const op = this.peek().kind
      const prec = this.infixPrec(op)
      if (prec < minPrec) break

      if (op === 'QUESTION') {
        this.advance()
        const then = this.parseExpr(0)
        this.expect('COLON')
        const else_ = this.parseExpr(0)
        left = { kind:'ternary', cond:left, then, else:else_ }
        continue
      }

      this.advance()
      const right = this.parseExpr(prec + 1)
      const opStr = this.tokenOpStr(op)
      left = { kind:'binary', op:opStr, left, right }
    }

    return left
  }

  private parseUnary(): ScadExpr {
    if (this.at('MINUS')) { this.advance(); return { kind:'unary', op:'-', operand:this.parsePostfix() } }
    if (this.at('BANG'))  { this.advance(); return { kind:'unary', op:'!', operand:this.parsePostfix() } }
    return this.parsePostfix()
  }

  private parsePostfix(): ScadExpr {
    let expr = this.parsePrimary()
    while (true) {
      if (this.at('LSQUARE')) {
        this.advance()
        const idx = this.parseExpr()
        this.expect('RSQUARE')
        expr = { kind:'index', obj:expr, idx }
      } else if (this.at('DOT') && this.peek(1).kind === 'IDENT') {
        this.advance()
        const field = this.advance().value
        expr = { kind:'dot', obj:expr, field }
      } else break
    }
    return expr
  }

  private parsePrimary(): ScadExpr {
    const tok = this.peek()

    if (tok.kind === 'NUM')   { this.advance(); return { kind:'num',  value:parseFloat(tok.value) } }
    if (tok.kind === 'STR')   { this.advance(); return { kind:'str',  value:tok.value } }
    if (tok.kind === 'TRUE')  { this.advance(); return { kind:'bool', value:true } }
    if (tok.kind === 'FALSE') { this.advance(); return { kind:'bool', value:false } }
    if (tok.kind === 'UNDEF') { this.advance(); return { kind:'undef' } }

    if (tok.kind === 'IDENT') {
      const name = this.advance().value
      if (this.at('LPAREN')) {
        const args = this.parseArgList()
        return { kind:'call', name, args }
      }
      return { kind:'ident', name }
    }

    if (tok.kind === 'LPAREN') {
      this.advance()
      const e = this.parseExpr()
      this.expect('RPAREN')
      return e
    }

    if (tok.kind === 'LSQUARE') return this.parseVecOrRange()

    if (tok.kind === 'LET') {
      this.advance()
      this.expect('LPAREN')
      const bindings: { name:string; value:ScadExpr }[] = []
      while (!this.at('RPAREN')) {
        const name = this.expect('IDENT').value
        this.expect('EQ')
        const value = this.parseExpr()
        bindings.push({ name, value })
        if (this.at('COMMA')) this.advance()
      }
      this.expect('RPAREN')
      const body = this.parseExpr()
      return { kind:'let', bindings, body }
    }

    this.error(`Unexpected token in expression: '${tok.value}' (${tok.kind}) at line ${tok.line}`)
  }

  private parseVecOrRange(): ScadExpr {
    this.expect('LSQUARE')
    if (this.at('RSQUARE')) { this.advance(); return { kind:'vec', items:[] } }

    const first = this.parseExpr()

    // Range: [start:end] or [start:step:end]
    if (this.at('COLON')) {
      this.advance()
      const second = this.parseExpr()
      if (this.at('COLON')) {
        this.advance()
        const third = this.parseExpr()
        this.expect('RSQUARE')
        return { kind:'range', start:first, step:second, end:third }
      }
      this.expect('RSQUARE')
      return { kind:'range', start:first, step:null, end:second }
    }

    // Vector
    const items: ScadExpr[] = [first]
    while (this.at('COMMA')) {
      this.advance()
      if (this.at('RSQUARE')) break
      items.push(this.parseExpr())
    }
    this.expect('RSQUARE')
    return { kind:'vec', items }
  }

  // ── Helpers ───────────────────────────────────────────────

  private parseParamList(): ScadParam[] {
    this.expect('LPAREN')
    const params: ScadParam[] = []
    while (!this.at('RPAREN') && !this.at('EOF')) {
      const name = this.advance().value  // IDENT (may start with $)
      let def: ScadExpr | null = null
      if (this.at('EQ')) { this.advance(); def = this.parseExpr() }
      params.push({ name, default:def })
      if (this.at('COMMA')) this.advance()
    }
    this.expect('RPAREN')
    return params
  }

  private parseArgList(): ScadArg[] {
    this.expect('LPAREN')
    const args: ScadArg[] = []
    while (!this.at('RPAREN') && !this.at('EOF')) {
      // Named arg: name = expr
      if (this.peek().kind === 'IDENT' && this.peek(1).kind === 'EQ') {
        const name  = this.advance().value
        this.advance()  // consume =
        const value = this.parseExpr()
        args.push({ name, value })
      } else {
        args.push({ name:null, value:this.parseExpr() })
      }
      if (this.at('COMMA')) this.advance()
    }
    this.expect('RPAREN')
    return args
  }

  private infixPrec(kind: string): number {
    const p: Record<string,number> = {
      'PIPE2':1,'AMP2':2,'EQ2':3,'NEQ':3,'LT':3,'GT':3,'LEQ':3,'GEQ':3,
      'PLUS':4,'MINUS':4,'STAR':5,'SLASH':5,'PERCENT':5,'CARET':6,
      'QUESTION':0
    }
    return p[kind] ?? -1
  }

  private tokenOpStr(kind: string): string {
    const m: Record<string,string> = {
      'PLUS':'+','MINUS':'-','STAR':'*','SLASH':'/','PERCENT':'%','CARET':'^',
      'EQ2':'==','NEQ':'!=','LT':'<','GT':'>','LEQ':'<=','GEQ':'>=',
      'AMP2':'&&','PIPE2':'||'
    }
    return m[kind] ?? kind
  }

  private peek(offset = 0): Token { return this.tokens[Math.min(this.pos+offset, this.tokens.length-1)] }
  private at(kind: TokenKind): boolean { return this.peek().kind === kind }
  private advance(): Token { return this.tokens[this.pos++] ?? this.tokens[this.tokens.length-1] }
  private expect(kind: TokenKind): Token {
    if (!this.at(kind)) this.error(`Expected ${kind}, got '${this.peek().value}' (${this.peek().kind}) at line ${this.peek().line}`)
    return this.advance()
  }
  private error(msg: string): never {
    const tok = this.peek()
    throw { kind:'parse', message:msg, line:tok.line, col:tok.col } as any
  }
}

═══════════════════════════════════════════════════════════════
## STEP 4 — ScadEvaluator.ts (create)
## File: core/engine/scad/ScadEvaluator.ts
═══════════════════════════════════════════════════════════════

import { ScadStmt, ScadExpr, ScadArg, CsgNode, Resolution,
         DEFAULT_RESOLUTION, computeSegments, ScadRuntimeError } from './ScadTypes'

type ScadVal = number | string | boolean | null | ScadVal[] | { start:number; step:number; end:number }
type Env     = Map<string, ScadVal>
type ModDef  = { params: any[]; body: ScadStmt[] }
type FnDef   = { params: any[]; expr: ScadExpr }

export class ScadEvaluator {
  private mods:   Map<string, ModDef>  = new Map()
  private fns:    Map<string, FnDef>   = new Map()
  private childStack: CsgNode[][] = []

  evaluate(stmts: ScadStmt[]): CsgNode[] {
    // First pass: register all module and function definitions
    const env: Env = new Map()
    for (const stmt of stmts) {
      if (stmt.kind === 'module_def') this.mods.set(stmt.name, { params:stmt.params, body:stmt.body })
      if (stmt.kind === 'func_def')   this.fns.set(stmt.name,  { params:stmt.params, expr:stmt.expr })
      if (stmt.kind === 'assign')     env.set(stmt.name, this.evalExpr(stmt.value, env))
    }
    // Second pass: execute geometry statements
    return stmts.flatMap(s => this.evalStmt(s, env, DEFAULT_RESOLUTION))
  }

  // ── Statement evaluation ──────────────────────────────────

  private evalStmt(stmt: ScadStmt, env: Env, res: Resolution): CsgNode[] {
    if (stmt.kind === 'assign')     { env.set(stmt.name, this.evalExpr(stmt.value, env)); return [] }
    if (stmt.kind === 'module_def') { this.mods.set(stmt.name, { params:stmt.params, body:stmt.body }); return [] }
    if (stmt.kind === 'func_def')   { this.fns.set(stmt.name, { params:stmt.params, expr:stmt.expr }); return [] }
    if (stmt.kind === 'include')    { return [] /* handled by interpreter */ }
    if (stmt.kind === 'use')        { return [] }

    if (stmt.kind === 'for') {
      const range = this.evalExpr(stmt.range, env) as { start:number; step:number; end:number }
      const out: CsgNode[] = []
      const step = range.step ?? 1
      for (let i = range.start; i <= range.end + 1e-10; i += step) {
        const inner: Env = new Map(env)
        inner.set(stmt.var, i)
        out.push(...stmt.body.flatMap(s => this.evalStmt(s, inner, res)))
      }
      return out
    }

    if (stmt.kind === 'if') {
      const cond = this.evalExpr(stmt.cond, env)
      if (this.isTruthy(cond)) return stmt.then.flatMap(s => this.evalStmt(s, env, res))
      return stmt.else_.flatMap(s => this.evalStmt(s, env, res))
    }

    if (stmt.kind === 'module_call') return this.evalModuleCall(stmt, env, res)

    return []
  }

  // ── Module call dispatch ──────────────────────────────────

  private evalModuleCall(stmt: any, env: Env, res: Resolution): CsgNode[] {
    // Extract $fn/$fa/$fs overrides from this call's args
    const localRes = { ...res }
    for (const arg of stmt.args as ScadArg[]) {
      if (arg.name === '$fn') localRes.fn = this.num(this.evalExpr(arg.value, env))
      if (arg.name === '$fa') localRes.fa = this.num(this.evalExpr(arg.value, env))
      if (arg.name === '$fs') localRes.fs = this.num(this.evalExpr(arg.value, env))
    }

    // Evaluate children before entering the module
    const children = stmt.children.flatMap((s: ScadStmt) => this.evalStmt(s, env, localRes))

    // Dispatch built-in modules
    const A = (params: string[], defs: ScadVal[]) =>
      this.resolveArgs(params, defs, stmt.args, env)

    switch (stmt.name) {
      // ── Primitives ──────────────────────────────────────
      case 'cube': {
        const [size, center] = A(['size','center'], [[1,1,1], false])
        const s = this.toV3(size, 1)
        return [{ kind:'box', pos:[0,0,0], size:s, center:center as boolean }]
      }
      case 'sphere': {
        const [r, d] = A(['r','d'], [1, null])
        const radius = d != null ? this.num(d)/2 : this.num(r)
        const segs   = computeSegments(radius, localRes)
        return [{ kind:'sphere', pos:[0,0,0], r:radius, fn:segs }]
      }
      case 'cylinder': {
        const [h,r,r1,r2,center] = A(['h','r','r1','r2','center'], [1,1,null,null,false])
        const rr1 = r1 != null ? this.num(r1) : this.num(r)
        const rr2 = r2 != null ? this.num(r2) : this.num(r)
        const segs = computeSegments(Math.max(rr1,rr2), localRes)
        return [{ kind:'cylinder', pos:[0,0,0], h:this.num(h), r1:rr1, r2:rr2,
                  center:center as boolean, fn:segs }]
      }
      case 'polyhedron': {
        const [pts, faces] = A(['points','faces'], [[], []])
        const points = (pts as ScadVal[]).map(p => this.toV3(p, 0))
        const faceIdxs = (faces as ScadVal[]).map(f => (f as ScadVal[]).map(i => this.num(i)))
        return [{ kind:'polyhedron', points, faces:faceIdxs }]
      }

      // ── Boolean / CSG ────────────────────────────────────
      case 'union':        return children.length === 0 ? [] : [{ kind:'union',        children }]
      case 'difference':   return children.length === 0 ? [] : [{ kind:'difference',   children }]
      case 'intersection': return children.length === 0 ? [] : [{ kind:'intersection', children }]

      // ── Transforms ───────────────────────────────────────
      case 'translate': {
        const [v] = A(['v'], [[0,0,0]])
        const vec = this.toV3(v, 0)
        return children.map(c => ({ kind:'translate' as const, v:vec, child:c }))
      }
      case 'rotate': {
        const [v, a] = A(['v','a'], [[0,0,0], null])
        // rotate(a, v) rotates a degrees around axis v
        // rotate([x,y,z]) rotates Euler angles
        let vec: [number,number,number]
        if (a != null) {
          // Axis-angle form: rotate(angle, [ax,ay,az])
          const axis = this.toV3(v, 0)
          const deg  = this.num(a)
          // We encode as [deg*ax, deg*ay, deg*az] — executor handles axis-angle
          vec = [deg * axis[0], deg * axis[1], deg * axis[2]]
        } else {
          vec = this.toV3(v, 0)
        }
        return children.map(c => ({ kind:'rotate' as const, v:vec, child:c }))
      }
      case 'scale': {
        const [v] = A(['v'], [[1,1,1]])
        const vec = this.toV3(v, 1)
        return children.map(c => ({ kind:'scale' as const, v:vec, child:c }))
      }
      case 'mirror': {
        const [v] = A(['v'], [[1,0,0]])
        const vec = this.toV3(v, 0)
        return children.map(c => ({ kind:'mirror' as const, v:vec, child:c }))
      }
      case 'color': {
        const [c, alpha] = A(['c','alpha'], ['gray', 1.0])
        const rgba = this.parseColor(c, this.num(alpha))
        return children.map(ch => ({ kind:'color' as const, rgba, child:ch }))
      }
      case 'resize': {
        // resize() maps to scale with computed factors
        const [newsize] = A(['newsize'], [[0,0,0]])
        // Implementation: compute per-axis scale from newsize vs bounding box
        // Skip in MVP — treat as identity
        return children
      }
      case 'multmatrix': {
        // 4×4 transform matrix — map to translate+rotate+scale combination
        // Skip in MVP — complex decomposition
        return children
      }

      // ── Modifiers ───────────────────────────────────────
      case 'linear_extrude': {
        const [h, twist, scale_, slices, center] =
          A(['height','twist','scale','slices','center'], [1, 0, [1,1], 20, false])
        // children should be 2D profiles — collect polygon points from them
        // For MVP: encode as linear_extrude node, executor handles it
        const profileNodes = children  // should be polygon/circle CsgNodes
        return [{ kind:'linear_extrude', profile:[], h:this.num(h),
                  twist:this.num(twist), slices:this.num(slices) }]
      }
      case 'rotate_extrude': {
        const [angle] = A(['angle'], [360])
        const segs = computeSegments(10, localRes) // estimate
        return [{ kind:'rotate_extrude', profile:[], angle:this.num(angle), fn:segs }]
      }

      // ── User-defined module ───────────────────────────
      default: {
        const modDef = this.mods.get(stmt.name)
        if (!modDef) {
          console.warn(`[ScadEvaluator] Unknown module '${stmt.name}' at line ${stmt.line}`)
          return []
        }
        // Bind parameters
        const innerEnv: Env = new Map(env)
        const vals = this.resolveArgs(
          modDef.params.map(p => p.name),
          modDef.params.map(p => p.default ? this.evalExpr(p.default, env) : null),
          stmt.args, env
        )
        modDef.params.forEach((p, i) => innerEnv.set(p.name, vals[i]))
        innerEnv.set('$children', children.length)

        // Push children context
        this.childStack.push(children)
        const result = modDef.body.flatMap(s => this.evalStmt(s, innerEnv, localRes))
        this.childStack.pop()
        return result
      }
    }
  }

  // ── Expression evaluation ─────────────────────────────────

  private evalExpr(expr: ScadExpr, env: Env): ScadVal {
    switch (expr.kind) {
      case 'num':    return expr.value
      case 'str':    return expr.value
      case 'bool':   return expr.value
      case 'undef':  return null
      case 'ident': {
        if (env.has(expr.name))    return env.get(expr.name)!
        if (expr.name === 'PI')    return Math.PI
        if (expr.name === '$fn')   return 0
        if (expr.name === '$fa')   return 12
        if (expr.name === '$fs')   return 2
        return null   // undef in OpenSCAD
      }
      case 'vec':    return expr.items.map(i => this.evalExpr(i, env))
      case 'range': {
        const start = this.num(this.evalExpr(expr.start, env))
        const end   = this.num(this.evalExpr(expr.end,   env))
        const step  = expr.step ? this.num(this.evalExpr(expr.step, env)) : 1
        return { start, step, end }
      }
      case 'index': {
        const obj = this.evalExpr(expr.obj, env)
        const idx = this.num(this.evalExpr(expr.idx, env))
        if (Array.isArray(obj)) return obj[Math.floor(idx)] ?? null
        if (typeof obj === 'string') return obj[Math.floor(idx)] ?? null
        return null
      }
      case 'dot': {
        const obj = this.evalExpr(expr.obj, env)
        if (Array.isArray(obj)) {
          const m: Record<string,number> = { x:0, y:1, z:2, r:0, g:1, b:2, a:3 }
          return m[expr.field] !== undefined ? (obj[m[expr.field]] ?? null) : null
        }
        return null
      }
      case 'unary': {
        const v = this.evalExpr(expr.operand, env)
        if (expr.op === '-') return typeof v === 'number' ? -v : (Array.isArray(v) ? v.map(x => -this.num(x)) : null)
        if (expr.op === '!') return !this.isTruthy(v)
        return null
      }
      case 'binary': return this.evalBinary(expr.op, this.evalExpr(expr.left, env), this.evalExpr(expr.right, env))
      case 'ternary': return this.isTruthy(this.evalExpr(expr.cond, env)) ? this.evalExpr(expr.then, env) : this.evalExpr(expr.else, env)
      case 'let': {
        const inner: Env = new Map(env)
        for (const b of expr.bindings) inner.set(b.name, this.evalExpr(b.value, inner))
        return this.evalExpr(expr.body, inner)
      }
      case 'call': return this.evalFunctionCall(expr.name, expr.args, env)
    }
    return null
  }

  private evalBinary(op: string, a: ScadVal, b: ScadVal): ScadVal {
    if (op === '+') {
      if (typeof a === 'number' && typeof b === 'number') return a + b
      if (typeof a === 'string' || typeof b === 'string') return String(a ?? '') + String(b ?? '')
      if (Array.isArray(a) && Array.isArray(b)) return a.map((v,i) => this.num(v) + this.num(b[i] ?? 0))
    }
    if (op === '-' && typeof a === 'number' && typeof b === 'number') return a - b
    if (op === '-' && Array.isArray(a) && Array.isArray(b)) return a.map((v,i) => this.num(v) - this.num(b[i] ?? 0))
    if (op === '*') {
      if (typeof a === 'number' && typeof b === 'number') return a * b
      if (typeof a === 'number' && Array.isArray(b)) return b.map(v => a * this.num(v))
      if (Array.isArray(a) && typeof b === 'number') return a.map(v => this.num(v) * b)
    }
    if (op === '/') return typeof a === 'number' && typeof b === 'number' ? a / b : null
    if (op === '%') return typeof a === 'number' && typeof b === 'number' ? a % b : null
    if (op === '^') return typeof a === 'number' && typeof b === 'number' ? Math.pow(a,b) : null
    if (op === '==') return a === b || JSON.stringify(a) === JSON.stringify(b)
    if (op === '!=') return !(a === b || JSON.stringify(a) === JSON.stringify(b))
    if (op === '<')  return this.num(a) <  this.num(b)
    if (op === '>')  return this.num(a) >  this.num(b)
    if (op === '<=') return this.num(a) <= this.num(b)
    if (op === '>=') return this.num(a) >= this.num(b)
    if (op === '&&') return this.isTruthy(a) && this.isTruthy(b)
    if (op === '||') return this.isTruthy(a) || this.isTruthy(b)
    return null
  }

  private evalFunctionCall(name: string, args: ScadArg[], env: Env): ScadVal {
    const vals = args.map(a => this.evalExpr(a.value, env))

    // Built-ins
    const builtins: Record<string, (...a: ScadVal[]) => ScadVal> = {
      abs:    a => Math.abs(this.num(a)),
      sign:   a => Math.sign(this.num(a)),
      sin:    a => Math.sin(this.num(a) * Math.PI / 180),
      cos:    a => Math.cos(this.num(a) * Math.PI / 180),
      tan:    a => Math.tan(this.num(a) * Math.PI / 180),
      asin:   a => Math.asin(this.num(a)) * 180 / Math.PI,
      acos:   a => Math.acos(this.num(a)) * 180 / Math.PI,
      atan:   a => Math.atan(this.num(a)) * 180 / Math.PI,
      atan2:  (y,x) => Math.atan2(this.num(y), this.num(x)) * 180 / Math.PI,
      sqrt:   a => Math.sqrt(this.num(a)),
      pow:    (a,b) => Math.pow(this.num(a), this.num(b)),
      exp:    a => Math.exp(this.num(a)),
      ln:     a => Math.log(this.num(a)),
      log:    a => Math.log10(this.num(a)),
      floor:  a => Math.floor(this.num(a)),
      ceil:   a => Math.ceil(this.num(a)),
      round:  a => Math.round(this.num(a)),
      min:    (...a) => Math.min(...a.flat(Infinity).map(v => this.num(v))),
      max:    (...a) => Math.max(...a.flat(Infinity).map(v => this.num(v))),
      len:    a => Array.isArray(a) ? a.length : typeof a === 'string' ? a.length : null,
      str:    (...a) => a.map(v => v == null ? 'undef' : String(v)).join(''),
      chr:    a => String.fromCharCode(this.num(a)),
      ord:    a => typeof a === 'string' ? a.charCodeAt(0) : null,
      concat: (...a) => ([] as ScadVal[]).concat(...a.map(v => Array.isArray(v) ? v : [v])),
      norm:   a => Array.isArray(a) ? Math.sqrt((a as any[]).reduce((s,v) => s + this.num(v)**2, 0)) : null,
      cross:  (a,b) => {
        if (!Array.isArray(a) || !Array.isArray(b)) return null
        return [
          this.num(a[1])*this.num(b[2]) - this.num(a[2])*this.num(b[1]),
          this.num(a[2])*this.num(b[0]) - this.num(a[0])*this.num(b[2]),
          this.num(a[0])*this.num(b[1]) - this.num(a[1])*this.num(b[0]),
        ]
      },
      is_undef:  a => a == null,
      is_bool:   a => typeof a === 'boolean',
      is_num:    a => typeof a === 'number',
      is_string: a => typeof a === 'string',
      is_list:   a => Array.isArray(a),
      echo:      (...a) => { console.log('[SCAD echo]', ...a); return null },
    }

    // children() built-in — used inside user modules
    if (name === 'children') {
      const frame = this.childStack[this.childStack.length - 1] ?? []
      if (vals.length === 0) return frame.length
      const idx = this.num(vals[0])
      return frame[idx] ?? null
    }

    if (builtins[name]) return builtins[name](...vals)

    // User-defined function
    const fnDef = this.fns.get(name)
    if (fnDef) {
      const inner: Env = new Map(env)
      const bound = this.resolveArgs(
        fnDef.params.map(p => p.name),
        fnDef.params.map(p => p.default ? this.evalExpr(p.default, env) : null),
        args, env
      )
      fnDef.params.forEach((p, i) => inner.set(p.name, bound[i]))
      return this.evalExpr(fnDef.expr, inner)
    }

    console.warn(`[ScadEvaluator] Unknown function '${name}'`)
    return null
  }

  // ── Arg resolution ────────────────────────────────────────

  private resolveArgs(params: string[], defaults: ScadVal[], given: ScadArg[], env: Env): ScadVal[] {
    const out = [...defaults]
    let posIdx = 0
    for (const arg of given) {
      // Skip $special vars in positional indexing
      while (params[posIdx]?.startsWith('$')) posIdx++
      const val = this.evalExpr(arg.value, env)
      if (arg.name) {
        const i = params.indexOf(arg.name)
        if (i >= 0) out[i] = val
      } else {
        if (posIdx < out.length) out[posIdx++] = val
      }
    }
    return out
  }

  // ── Value helpers ─────────────────────────────────────────

  private num(v: ScadVal): number {
    if (typeof v === 'number') return v
    if (typeof v === 'boolean') return v ? 1 : 0
    return 0
  }

  private isTruthy(v: ScadVal): boolean {
    if (v == null) return false
    if (typeof v === 'boolean') return v
    if (typeof v === 'number') return v !== 0
    if (Array.isArray(v)) return v.length > 0
    return true
  }

  private toV3(v: ScadVal, dflt: number): [number,number,number] {
    if (Array.isArray(v)) return [this.num(v[0]??dflt), this.num(v[1]??dflt), this.num(v[2]??dflt)]
    if (typeof v === 'number') return [v, v, v]
    return [dflt, dflt, dflt]
  }

  private parseColor(c: ScadVal, alpha: number): [number,number,number,number] {
    if (Array.isArray(c) && c.length >= 3) {
      return [this.num(c[0]), this.num(c[1]), this.num(c[2]), c[3] != null ? this.num(c[3]) : alpha]
    }
    // CSS color name fallback
    const namedColors: Record<string,[number,number,number]> = {
      red:[1,0,0], green:[0,1,0], blue:[0,0,1], white:[1,1,1],
      black:[0,0,0], gray:[0.5,0.5,0.5], yellow:[1,1,0], cyan:[0,1,1],
      magenta:[1,0,1], orange:[1,0.65,0], silver:[0.75,0.75,0.75],
    }
    const n = typeof c === 'string' ? c.toLowerCase().replace(/#.*/,'') : 'gray'
    const rgb = namedColors[n] ?? [0.5,0.5,0.5]
    return [rgb[0], rgb[1], rgb[2], alpha]
  }
}

═══════════════════════════════════════════════════════════════
## STEP 5 — ScadExecutor.ts (create)
## File: core/engine/scad/ScadExecutor.ts
═══════════════════════════════════════════════════════════════

import { CsgNode, resolutionToDeflection } from './ScadTypes'
import { OpenCascadeService } from '../../io/OpenCascadeService'

export class ScadExecutor {
  private counter   = 0
  private created:  string[] = []   // all shape IDs created this run
  private occ       = OpenCascadeService.getInstance()
  private cancelled = false

  constructor(
    private readonly runPrefix: string,  // unique per run, e.g. "scad_1747839821"
    private readonly onCancel: () => boolean  // returns true if this run is stale
  ) {}

  cancel() { this.cancelled = true }

  async execute(node: CsgNode): Promise<string | null> {
    if (this.cancelled || this.onCancel()) return null

    const id = `${this.runPrefix}_${this.counter++}`

    switch (node.kind) {

      // ── Primitives ──────────────────────────────────────

      case 'box': {
        const [sx, sy, sz] = node.size
        const [ox, oy, oz] = node.center
          ? [-sx/2, -sy/2, -sz/2]
          : [node.pos[0], node.pos[1], node.pos[2]]
        const defl = resolutionToDeflection(12)
        const shapeId = await (this.occ as any).createBox(ox, oy, oz, sx, sy, sz, defl, id)
        this.created.push(shapeId)
        return shapeId
      }

      case 'sphere': {
        const defl = resolutionToDeflection(node.fn)
        const shapeId = await (this.occ as any).createSphere(
          node.pos[0], node.pos[1], node.pos[2], node.r, defl, id)
        this.created.push(shapeId)
        return shapeId
      }

      case 'cylinder': {
        const py = node.center ? -node.h/2 : node.pos[1]
        const defl = resolutionToDeflection(node.fn)
        const shapeId = await (this.occ as any).createCylinder(
          node.pos[0], py, node.pos[2], node.r1, node.r2, node.h, defl, id)
        this.created.push(shapeId)
        return shapeId
      }

      case 'polyhedron': {
        const defl = resolutionToDeflection(12)
        const flat = node.points.flat()
        const shapeId = await (this.occ as any).createPolyhedron(flat, node.faces, defl, id)
        this.created.push(shapeId)
        return shapeId
      }

      // ── Booleans ────────────────────────────────────────

      case 'union':
      case 'difference':
      case 'intersection': {
        const op = node.kind === 'union' ? 'fuse' : node.kind === 'difference' ? 'cut' : 'common'
        if (node.children.length === 0) return null
        if (node.children.length === 1) return this.execute(node.children[0])

        // Execute first child
        let acc = await this.execute(node.children[0])
        if (!acc || this.cancelled) return null

        // For difference/intersection: execute remaining children in parallel first
        const rest = node.kind === 'difference' || node.kind === 'intersection'
          ? await Promise.all(node.children.slice(1).map(c => this.execute(c)))
          : null

        if (node.kind !== 'union' && rest) {
          // Fold sequentially for difference/intersection
          for (const childId of rest) {
            if (!childId || this.cancelled) return null
            const boolId = `${id}_b${this.counter++}`
            acc = await (this.occ as any).createBoolean(op, acc, childId, boolId, 0.1)
            this.created.push(acc)
          }
          return acc
        }

        // Union: execute and fold one at a time
        for (const child of node.children.slice(1)) {
          if (this.cancelled) return null
          const childId = await this.execute(child)
          if (!childId) continue
          const boolId = `${id}_b${this.counter++}`
          acc = await (this.occ as any).createBoolean('fuse', acc, childId, boolId, 0.1)
          this.created.push(acc)
        }
        return acc
      }

      // ── Transforms ───────────────────────────────────────

      case 'translate': {
        const child = await this.execute(node.child)
        if (!child || this.cancelled) return null
        await (this.occ as any).transformShape(child, node.v[0], node.v[1], node.v[2])
        return child   // transformShape modifies in place in your Worker
      }

      case 'rotate': {
        const child = await this.execute(node.child)
        if (!child || this.cancelled) return null
        await (this.occ as any).rotateShape(child, node.v[0], node.v[1], node.v[2])
        return child
      }

      case 'scale': {
        const child = await this.execute(node.child)
        if (!child || this.cancelled) return null
        const scaleId = `${id}_s`
        const result = await (this.occ as any).scaleShape(child, scaleId, node.v[0], node.v[1], node.v[2])
        this.created.push(scaleId)
        return result
      }

      case 'mirror': {
        const child = await this.execute(node.child)
        if (!child || this.cancelled) return null
        const mirrorId = `${id}_m`
        const result = await (this.occ as any).mirrorShape(child, mirrorId, node.v[0], node.v[1], node.v[2])
        this.created.push(mirrorId)
        return result
      }

      case 'color':
        // Color is display-only — just execute the child, store color as metadata
        return this.execute(node.child)

      case 'empty':
        return null

      default:
        console.warn(`[ScadExecutor] Unhandled CSG node kind: ${(node as any).kind}`)
        return null
    }
  }

  // After execution: release ALL intermediate shapes except the final result
  async cleanup(keepId: string | null): Promise<void> {
    const toRelease = this.created.filter(id => id !== keepId)
    if (toRelease.length > 0) {
      await (this.occ as any).releaseShapes(toRelease)
    }
    this.created = []
  }
}

═══════════════════════════════════════════════════════════════
## STEP 6 — ScadInterpreter.ts (create)
## File: core/engine/scad/ScadInterpreter.ts
═══════════════════════════════════════════════════════════════

import { ScadLexer }     from './ScadLexer'
import { ScadParser }    from './ScadParser'
import { ScadEvaluator } from './ScadEvaluator'
import { ScadExecutor }  from './ScadExecutor'
import { CsgNode, ScadError } from './ScadTypes'
import { Solid3D }        from '../../model/Solid3D'
import { OpenCascadeService } from '../../io/OpenCascadeService'

export type ScadStatus =
  | { kind: 'idle' }
  | { kind: 'running'; startMs: number }
  | { kind: 'success'; elapsedMs: number; entityId: string }
  | { kind: 'error'; error: ScadError }

export class ScadInterpreter {
  private runId    = 0
  private executor: ScadExecutor | null = null
  onStatus?: (status: ScadStatus) => void
  onResult?: (solid: Solid3D, source: string) => void

  async run(source: string): Promise<void> {
    const thisRun = ++this.runId
    const startMs = Date.now()

    // Cancel any in-flight execution
    this.executor?.cancel()

    this.onStatus?.({ kind:'running', startMs })

    try {
      // 1. Lex
      const tokens = new ScadLexer().tokenize(source)

      // 2. Parse
      const ast = new ScadParser(tokens).parse()
      if (thisRun !== this.runId) return   // superseded

      // 3. Evaluate — pure, synchronous
      const csgTree = new ScadEvaluator().evaluate(ast)
      if (csgTree.length === 0) {
        this.onStatus?.({ kind:'error', error:{ kind:'runtime', message:'Script produced no geometry.', callStack:[] } })
        return
      }
      if (thisRun !== this.runId) return

      // 4. Execute — async OCC operations
      const runPrefix = `scad_${thisRun}_${Date.now()}`
      this.executor = new ScadExecutor(runPrefix, () => thisRun !== this.runId)

      // Wrap multiple root nodes in an implicit union
      const root: CsgNode = csgTree.length === 1
        ? csgTree[0]
        : { kind:'union', children:csgTree }

      const resultId = await this.executor.execute(root)
      if (thisRun !== this.runId) {
        await this.executor.cleanup(null)  // discard stale result
        return
      }

      if (!resultId) {
        this.onStatus?.({ kind:'error', error:{ kind:'occ', message:'Execution produced no shape.', nodeDesc:'root' } })
        await this.executor.cleanup(null)
        return
      }

      // 5. Get tessellation from Worker (already computed by execute)
      //    The final shape is in the Worker cache as resultId
      //    We need to fetch its geometry data
      const geomData = await (OpenCascadeService.getInstance() as any).getTessellation(resultId)

      await this.executor.cleanup(resultId)

      if (thisRun !== this.runId) return

      // 6. Create Solid3D entity
      const entityId = `scad_${Date.now()}`
      const solid = new Solid3D(
        entityId,
        Array.from(geomData.positions),
        Array.from(geomData.indices),
        geomData.faceMapping,
        geomData.edgeLines
      )
      solid.scadSource   = source
      if (geomData.brepSnapshot) solid.brepSnapshot = geomData.brepSnapshot

      const elapsed = Date.now() - startMs
      this.onStatus?.({ kind:'success', elapsedMs:elapsed, entityId })
      this.onResult?.(solid, source)

    } catch (err: any) {
      if (thisRun !== this.runId) return
      const scadErr: ScadError = err?.kind
        ? err
        : { kind:'runtime', message:err.message ?? String(err), callStack:[] }
      this.onStatus?.({ kind:'error', error:scadErr })
    }
  }
}

═══════════════════════════════════════════════════════════════
## STEP 7 — OCCWorkerClient additions (modify)
## File: core/io/OCCWorkerClient.ts  — add these methods
═══════════════════════════════════════════════════════════════

// Add to OCCWorkerClient class:

async scaleShape(solidId: string, resultId: string, sx: number, sy: number, sz: number): Promise<any> {
  return this.sendMessage({ type: 'scaleShape', solidId, resultId, sx, sy, sz })
}

async mirrorShape(solidId: string, resultId: string, nx: number, ny: number, nz: number): Promise<any> {
  return this.sendMessage({ type: 'mirrorShape', solidId, resultId, nx, ny, nz })
}

async createPolyhedron(points: number[], faces: number[][], deflection: number, resultId: string): Promise<any> {
  return this.sendMessage({ type: 'createPolyhedron', points, faces, deflection, resultId })
}

// getTessellation — retrieves geometry for a shape already in cache
async getTessellation(shapeId: string, deflection = 0.1): Promise<any> {
  return this.sendMessage({ type: 'getTessellation', shapeId, deflection })
}

═══════════════════════════════════════════════════════════════
## STEP 8 — OCCWorker.ts additions (modify)
## File: core/io/OCCWorker.ts  — add these message handlers
═══════════════════════════════════════════════════════════════

// Add AFTER the createBoolean handler:

} else if (type === 'getTessellation') {
  // Retrieve geometry data for a shape already cached — used by ScadExecutor
  const { shapeId, deflection = 0.1 } = data
  if (!shapeCache.has(shapeId)) {
    postMessage({ type:'getTessellation', success:false, error:`Shape not cached: ${shapeId}`, id })
    return
  }
  try {
    const shape = shapeCache.get(shapeId)
    const geom  = shapeToBufferGeometryData(shape, oc, deflection)
    postMessage({ type:'getTessellation', success:true, payload:geom, id },
                [geom.positions.buffer, geom.indices.buffer, geom.normals.buffer])
  } catch(e: any) {
    postMessage({ type:'getTessellation', success:false, error:e.message, id })
  }

// scaleShape and mirrorShape implementations are in STEP 3 (OCCWorker OCC additions)

═══════════════════════════════════════════════════════════════
## STEP 9 — ScadCommand.ts (create)
## File: core/commands/ScadCommand.ts
═══════════════════════════════════════════════════════════════

import { Command, CommandAction, CommandResponse } from './types'
import { UnitsConfig } from '../model/Document'

export class ScadCommand implements Command {
  step = 0

  getPrompt(): string { return 'SCAD [Enter=open editor | type single-line script]:' }

  onInput(text: string, id: string, _units: UnitsConfig): CommandResponse | undefined {
    const val = text.trim()
    if (val === '' || val.toUpperCase() === 'EDITOR') {
      return { action: 'open_scad_editor' } as CommandAction
    }
    // Inline script execution
    return { action: 'scad_run', source: val } as CommandAction
  }

  onPoint(_x: number, _y: number): CommandResponse {
    return { action: 'open_scad_editor' } as CommandAction
  }
}

// ── Register in CommandManager ──────────────────────────────
// commandRegistry.set('SCAD',     () => new ScadCommand())
// commandRegistry.set('OPENSCAD', () => new ScadCommand())

═══════════════════════════════════════════════════════════════
## STEP 10 — CommandAction extensions (modify)
## File: core/commands/types.ts
═══════════════════════════════════════════════════════════════

// Add to CommandAction.action union:
'open_scad_editor' | 'scad_run' | 'scad_result'

// Add to CommandAction fields:
source?:    string    // SCAD script source text
scadSolid?: any       // Solid3D result from interpreter

═══════════════════════════════════════════════════════════════
## STEP 11 — Solid3D model extension (modify)
## File: core/model/Solid3D.ts
═══════════════════════════════════════════════════════════════

// Add field to Solid3D class:
scadSource?: string   // The OpenSCAD script that generated this solid
                      // Preserved for re-run, export as .scad, and editor roundtrip

═══════════════════════════════════════════════════════════════
## STEP 12 — app.ts handler (modify)
═══════════════════════════════════════════════════════════════

// Add as class field:
private scadInterpreter: ScadInterpreter | null = null
private scadPanel:       ScadEditorPanel | null = null

// Add to getScadInterpreter():
private getScadInterpreter(): ScadInterpreter {
  if (!this.scadInterpreter) {
    this.scadInterpreter = new ScadInterpreter()
    this.scadInterpreter.onResult = (solid, source) => {
      this.handleResult({ action:'scad_result', scadSolid:solid, source } as any)
    }
    this.scadInterpreter.onStatus = (status) => {
      if (status.kind === 'running') this.commandLine.showMessage('SCAD: running…')
      if (status.kind === 'success') this.commandLine.showMessage(`SCAD: done in ${status.elapsedMs}ms`)
      if (status.kind === 'error')   this.commandLine.showError(`SCAD error: ${status.error.message}`)
    }
  }
  return this.scadInterpreter
}

// Add to ResultDispatcher / handleAction:

case 'open_scad_editor':
  if (!this.scadPanel) {
    this.scadPanel = new ScadEditorPanel(this.getScadInterpreter())
    this.dockingManager.registerPanel('SCAD Editor', this.scadPanel)
  }
  this.dockingManager.showPanel('SCAD Editor')
  return ''

case 'scad_run':
  this.getScadInterpreter().run(action.source!)
  return ''

case 'scad_result': {
  const solid = action.scadSolid as Solid3D
  this.addEntity(solid, true, false)
  await this.extractAndCacheSnapPoints(solid.id)
  context.syncFromDocument()
  return `SCAD: solid ${solid.id} added (${Math.floor(solid.positions.length/3)} vertices)`
}

═══════════════════════════════════════════════════════════════
## ACCEPTANCE CRITERIA
═══════════════════════════════════════════════════════════════

Test each of these scripts in the SCAD editor after implementation:

// Test 1: Basic primitive
cube([10, 10, 10]);

// Test 2: Boolean
difference() {
  cube([20, 20, 20], center=true);
  sphere(r=11, $fn=32);
}

// Test 3: For loop
for (i=[0:3]) {
  translate([i*15, 0, 0])
    cylinder(h=10, r=3, $fn=16);
}

// Test 4: Module definition
module bolt(d=6, len=20) {
  cylinder(h=len, r=d/2, $fn=32);
  translate([0, 0, len])
    cylinder(h=d*0.6, r=d, $fn=6);
}
bolt(d=8, len=30);

// Test 5: Nested booleans
union() {
  difference() {
    cube([30, 30, 10]);
    translate([5, 5, -1]) cube([20, 20, 12]);
  }
  translate([0, 0, 10]) cube([30, 5, 5]);
}

// Test 6: $fn resolution
sphere(r=10, $fn=64);

Verifications:
- [ ] Each test produces a visible solid in the viewport
- [ ] Solid can be selected (Selection3DEngine)
- [ ] Solid can be filleted after creation (SFILLET command)
- [ ] Solid can be used in a boolean (UNION/SUBTRACT with another solid)
- [ ] UNDO removes the solid
- [ ] Parse error in script shows gutter marker in editor, does not crash
- [ ] Editing script re-runs with 400ms debounce
- [ ] tsc --noEmit passes with no TypeScript errors