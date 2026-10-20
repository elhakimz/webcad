# OpenSCAD `.scad` File Parser — Pseudocode

## Overview

```
Parser
├── Lexer          tokenises raw source text
├── Preprocessor   resolves `include` / `use` directives
├── Parser         builds an AST from the token stream
├── Resolver       binds identifiers; resolves modules / functions / variables
└── Evaluator      walks the AST → emits OCC geometry calls
```

---

## 1. File Loading & Preprocessor

```
FUNCTION loadFile(path, context):
    IF path in context.loadedFiles:
        RETURN ""                          // break circular includes

    source = readFile(path)                // fetch from virtual FS / HTTP
    IF source is null:
        THROW FileNotFoundError(path)

    context.loadedFiles.add(path)
    RETURN source


FUNCTION preprocess(source, filePath, context):
    lines = splitLines(source)
    output = []

    FOR EACH line IN lines:

        // ── include <file> ────────────────────────────────────────────────
        // Pastes the entire file contents inline — variables, modules,
        // function definitions all become part of the current scope.
        IF line matches `include <(.+)>` or `include "(.+)"`:
            includePath = resolvePath(filePath, capturedGroup)
            includedSrc = loadFile(includePath, context)
            expanded    = preprocess(includedSrc, includePath, context)
            output.append(expanded)

        // ── use <file> ────────────────────────────────────────────────────
        // Imports ONLY module and function definitions — NOT top-level
        // variable assignments or geometry calls.
        ELSE IF line matches `use <(.+)>` or `use "(.+)"`:
            usePath  = resolvePath(filePath, capturedGroup)
            usedSrc  = loadFile(usePath, context)
            // Parse the used file independently, extract only definitions
            usedAST  = parse(usedSrc, usePath, context)
            FOR EACH node IN usedAST.children:
                IF node.type IN [MODULE_DEF, FUNCTION_DEF]:
                    context.useScope.define(node.name, node)
            // Do NOT paste geometry or variable assignments

        ELSE:
            output.append(line)

    RETURN joinLines(output)


FUNCTION resolvePath(basePath, relativePath):
    IF relativePath is absolute:
        RETURN relativePath
    RETURN dirname(basePath) + "/" + relativePath
```

---

## 2. Lexer (Tokeniser)

```
TOKENS:
    NUMBER       →  -?[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?
    STRING       →  "..." (with escape sequences)
    BOOL         →  true | false
    UNDEF        →  undef
    IDENT        →  [a-zA-Z_$][a-zA-Z0-9_$]*
    OP           →  + - * / % ^ ! && || == != < > <= >= ? :
    PUNCT        →  ; , . { } ( ) [ ]
    COMMENT_LINE →  // ... \n
    COMMENT_BLOCK → /* ... */
    SPECIAL      →  $fa $fs $fn $t $vpr $vpt $vpd $children


FUNCTION tokenise(source):
    tokens = []
    pos    = 0

    WHILE pos < length(source):
        skip whitespace and comments

        MATCH longest token at pos:
            NUMBER  → push Token(NUMBER, value, pos)
            STRING  → push Token(STRING, value, pos)
            BOOL    → push Token(BOOL,   value, pos)
            UNDEF   → push Token(UNDEF,  null,  pos)
            SPECIAL → push Token(SPECIAL, name, pos)
            IDENT   → push Token(IDENT,  name,  pos)
            OP      → push Token(OP,     symbol,pos)
            PUNCT   → push Token(PUNCT,  char,  pos)
            ELSE    → THROW LexError("unexpected character", pos)

        advance pos

    push Token(EOF)
    RETURN tokens
```

---

## 3. AST Node Types

```
Node types:
    PROGRAM           children: [Statement]
    MODULE_DEF        name, params: [Param], body: Block
    FUNCTION_DEF      name, params: [Param], expr: Expr
    VARIABLE_ASSIGN   name, expr: Expr          // a = expr;
    MODULE_CALL       name, args: [Arg], children: [Statement]
    IF_STMT           condition, thenBlock, elseBlock?
    FOR_STMT          assignments: [(var, rangeOrList)], body: Block
    LET_STMT          assignments: [(var, expr)], body: Expr
    BLOCK             children: [Statement]
    EXPR_*            (see expression nodes below)

Expression nodes:
    LITERAL           value (number | string | bool | undef)
    VECTOR            elements: [Expr]
    RANGE             start, step?, end
    IDENT_REF         name
    INDEX             expr, index
    MEMBER            expr, field            // e.g. v.x
    UNARY             op, expr
    BINARY            op, left, right
    TERNARY           condition, then, else
    FUNCTION_CALL     name, args: [Arg]
    LET_EXPR          assignments, expr
    ECHO_EXPR         args

Param:   name, defaultExpr?
Arg:     name?, expr            // positional or named
```

---

## 4. Parser (Recursive Descent)

```
FUNCTION parse(tokens):
    cursor = 0
    RETURN parseProgram()


FUNCTION parseProgram():
    stmts = []
    WHILE NOT atEnd():
        stmts.append(parseStatement())
    RETURN Node(PROGRAM, children=stmts)


FUNCTION parseStatement():
    tok = peek()

    IF tok is IDENT "module":
        RETURN parseModuleDef()

    IF tok is IDENT "function":
        RETURN parseFunctionDef()

    IF tok is IDENT "if":
        RETURN parseIfStmt()

    IF tok is IDENT "for":
        RETURN parseForStmt()

    IF tok is IDENT "let":
        RETURN parseLetStmt()

    IF tok is IDENT AND next is "=":
        RETURN parseVariableAssign()

    IF tok is IDENT AND (next is "(" OR next is "{" OR next is ";"):
        RETURN parseModuleCall()

    IF tok is "!":   // root modifier — ignore children
        consume("!")
        RETURN Node(MODULE_CALL, modifier="root", child=parseStatement())

    IF tok is "#":   // highlight modifier
        consume("#")
        RETURN Node(MODULE_CALL, modifier="highlight", child=parseStatement())

    IF tok is "%":   // background modifier
        consume("%")
        RETURN Node(MODULE_CALL, modifier="background", child=parseStatement())

    IF tok is "*":   // disable modifier
        consume("*")
        RETURN Node(MODULE_CALL, modifier="disable", child=parseStatement())

    IF tok is ";":
        consume(";")
        RETURN Node(EMPTY_STMT)

    THROW ParseError("unexpected token", tok)


FUNCTION parseModuleDef():
    consume("module")
    name   = consume(IDENT)
    params = parseParamList()
    body   = parseBlock()
    RETURN Node(MODULE_DEF, name, params, body)


FUNCTION parseFunctionDef():
    consume("function")
    name   = consume(IDENT)
    params = parseParamList()
    consume("=")
    expr   = parseExpr()
    consume(";")
    RETURN Node(FUNCTION_DEF, name, params, expr)


FUNCTION parseModuleCall():
    name     = consume(IDENT)
    args     = parseArgList()          // (...)
    children = parseChildrenOrSemi()   // { stmts } | stmt | ;
    RETURN Node(MODULE_CALL, name, args, children)


FUNCTION parseChildrenOrSemi():
    IF peek() is ";":
        consume(";")
        RETURN []
    IF peek() is "{":
        RETURN parseBlock()
    RETURN [parseStatement()]          // single child statement


FUNCTION parseIfStmt():
    consume("if")
    consume("(")
    cond = parseExpr()
    consume(")")
    thenBlock = parseBlock()
    elseBlock = null
    IF peek() is "else":
        consume("else")
        IF peek() is "if":
            elseBlock = parseIfStmt()
        ELSE:
            elseBlock = parseBlock()
    RETURN Node(IF_STMT, cond, thenBlock, elseBlock)


FUNCTION parseForStmt():
    consume("for")
    consume("(")
    assignments = []
    REPEAT:
        varName = consume(IDENT)
        consume("=")
        rangeOrList = parseExpr()      // range [s:e] or [s:step:e] or vector
        assignments.append((varName, rangeOrList))
    UNTIL NOT peek(",")
    consume(")")
    body = parseChildrenOrSemi()
    RETURN Node(FOR_STMT, assignments, body)


FUNCTION parseVariableAssign():
    name = consume(IDENT)
    consume("=")
    expr = parseExpr()
    consume(";")
    RETURN Node(VARIABLE_ASSIGN, name, expr)


FUNCTION parseParamList():
    consume("(")
    params = []
    WHILE peek() != ")":
        name = consume(IDENT)
        default = null
        IF peek() is "=":
            consume("=")
            default = parseExpr()
        params.append(Param(name, default))
        IF peek() is ",": consume(",")
    consume(")")
    RETURN params


FUNCTION parseArgList():
    consume("(")
    args = []
    WHILE peek() != ")":
        // Named arg?  ident = expr
        IF peek() is IDENT AND peekNext() is "=":
            name = consume(IDENT)
            consume("=")
            expr = parseExpr()
            args.append(Arg(name, expr))
        ELSE:
            expr = parseExpr()
            args.append(Arg(null, expr))
        IF peek() is ",": consume(",")
    consume(")")
    RETURN args


FUNCTION parseBlock():
    consume("{")
    stmts = []
    WHILE peek() != "}":
        stmts.append(parseStatement())
    consume("}")
    RETURN Node(BLOCK, stmts)
```

### Expression Parsing (Pratt / precedence climbing)

```
Precedence table (low → high):
    1   ? :          (ternary)
    2   ||
    3   &&
    4   == !=
    5   < > <= >=
    6   + -
    7   * / %
    8   unary: ! -
    9   ^              (exponentiation, right-assoc)
    10  postfix: [] .

FUNCTION parseExpr(minPrec = 0):
    left = parsePrimary()

    WHILE peek() is binary-op WITH precedence > minPrec:
        op    = consume()
        right = parseExpr(op.precedence + (leftAssoc ? 1 : 0))
        left  = Node(BINARY, op, left, right)

    IF peek() is "?" AND minPrec == 0:
        consume("?")
        thenExpr = parseExpr()
        consume(":")
        elseExpr = parseExpr()
        left = Node(TERNARY, left, thenExpr, elseExpr)

    RETURN left


FUNCTION parsePrimary():
    tok = consume()

    NUMBER  → RETURN Node(LITERAL, tok.value)
    STRING  → RETURN Node(LITERAL, tok.value)
    BOOL    → RETURN Node(LITERAL, tok.value)
    UNDEF   → RETURN Node(LITERAL, undef)

    "["     → RETURN parseVectorOrRange()

    "("     →
        expr = parseExpr()
        consume(")")
        RETURN expr

    "-"     → RETURN Node(UNARY, "-", parsePrimary())
    "!"     → RETURN Node(UNARY, "!", parsePrimary())

    IDENT   →
        name = tok.value

        IF peek() is "(":          // function call
            args = parseArgList()
            RETURN Node(FUNCTION_CALL, name, args)

        RETURN Node(IDENT_REF, name)

    ELSE → THROW ParseError("expected expression", tok)


FUNCTION parseVectorOrRange():
    // Already consumed "["
    IF peek() is "]":
        consume("]")
        RETURN Node(VECTOR, [])

    first = parseExpr()

    IF peek() is ":":              // range  [start : end]  or  [start : step : end]
        consume(":")
        second = parseExpr()
        IF peek() is ":":
            consume(":")
            third = parseExpr()
            consume("]")
            RETURN Node(RANGE, start=first, step=second, end=third)
        consume("]")
        RETURN Node(RANGE, start=first, step=null, end=second)

    elements = [first]
    WHILE peek() is ",":
        consume(",")
        elements.append(parseExpr())
    consume("]")
    RETURN Node(VECTOR, elements)
```

---

## 5. Resolver (Scope & Symbol Binding)

```
SCAD scoping rules:
  - Dynamic scoping for variables (last assignment wins at global level)
  - Static / lexical scoping for module and function definitions
  - `use` files contribute only module/function definitions (no variables)
  - `include` files contribute everything
  - $special variables ($fn, $fa, $fs) inherit from call site


CLASS Scope:
    parent:   Scope | null
    vars:     Map<name, Expr>
    modules:  Map<name, ModuleDef>
    functions:Map<name, FunctionDef>

    FUNCTION lookup(name):
        IF name in vars:     RETURN vars[name]
        IF parent:           RETURN parent.lookup(name)
        RETURN undef

    FUNCTION lookupModule(name):
        IF name in modules:  RETURN modules[name]
        IF parent:           RETURN parent.lookupModule(name)
        RETURN null

    FUNCTION lookupFunction(name):
        IF name in functions: RETURN functions[name]
        IF parent:            RETURN parent.lookupFunction(name)
        RETURN null

    FUNCTION define(name, value):
        vars[name] = value

    FUNCTION defineModule(name, node):
        modules[name] = node

    FUNCTION defineFunction(name, node):
        functions[name] = node


FUNCTION resolve(ast, context):
    globalScope = new Scope(parent=context.useScope)

    // First pass — collect all global module/function defs
    // (OpenSCAD allows forward references)
    FOR EACH node IN ast.children:
        IF node.type == MODULE_DEF:
            globalScope.defineModule(node.name, node)
        IF node.type == FUNCTION_DEF:
            globalScope.defineFunction(node.name, node)

    // Second pass — collect variables (last-write wins)
    FOR EACH node IN ast.children:
        IF node.type == VARIABLE_ASSIGN:
            globalScope.define(node.name, node.expr)   // not yet evaluated

    RETURN globalScope
```

---

## 6. Evaluator (AST → OCC Geometry)

```
FUNCTION evaluate(ast, scope, occContext):
    FOR EACH stmt IN ast.children:
        evaluateStatement(stmt, scope, occContext)

    RETURN occContext.collectResults()


FUNCTION evaluateStatement(node, scope, ctx):
    SWITCH node.type:

        VARIABLE_ASSIGN:
            val = evaluateExpr(node.expr, scope)
            scope.define(node.name, val)

        MODULE_CALL:
            evaluateModuleCall(node, scope, ctx)

        IF_STMT:
            cond = evaluateExpr(node.condition, scope)
            IF isTruthy(cond):
                evaluateStatement(node.thenBlock, scope, ctx)
            ELSE IF node.elseBlock:
                evaluateStatement(node.elseBlock, scope, ctx)

        FOR_STMT:
            FOR EACH (varName, rangeOrList) IN node.assignments:
                items = expandRangeOrList(rangeOrList, scope)
                FOR EACH item IN items:
                    childScope = new Scope(parent=scope)
                    childScope.define(varName, item)
                    evaluateStatement(node.body, childScope, ctx)

        BLOCK:
            childScope = new Scope(parent=scope)
            FOR EACH child IN node.children:
                evaluateStatement(child, childScope, ctx)


FUNCTION evaluateModuleCall(node, scope, ctx):
    args     = bindArgs(node.args, scope)
    modifier = node.modifier   // root | highlight | background | disable | null

    IF modifier == "disable":
        RETURN                 // * modifier — skip entirely

    // ── Built-in solid primitives ─────────────────────────────────────────
    SWITCH node.name:
        "cube":
            size = args.size ?? args[0] ?? [1,1,1]
            center = args.center ?? false
            shape = OCC.makeBox(size, center)
            ctx.addShape(shape, modifier)

        "sphere":
            r  = args.r ?? args.d/2 ?? args[0] ?? 1
            fn = resolveSpecial("$fn", scope, args)
            shape = OCC.makeSphere(r, fn)
            ctx.addShape(shape, modifier)

        "cylinder":
            h  = args.h ?? args[0] ?? 1
            r1 = args.r1 ?? args.r ?? args.d1/2 ?? args.d/2 ?? 1
            r2 = args.r2 ?? args.r ?? args.d2/2 ?? args.d/2 ?? r1
            center = args.center ?? false
            fn = resolveSpecial("$fn", scope, args)
            shape = OCC.makeCylinder(r1, r2, h, center, fn)
            ctx.addShape(shape, modifier)

        "polyhedron":
            shape = OCC.makePolyhedron(args.points, args.faces ?? args.triangles)
            ctx.addShape(shape, modifier)

        // ── 2-D primitives (extruded later) ──────────────────────────────
        "square":
            size   = args.size ?? args[0] ?? [1,1]
            center = args.center ?? false
            ctx.addProfile(OCC.makeRectangle(size, center), modifier)

        "circle":
            r  = args.r ?? args.d/2 ?? args[0] ?? 1
            fn = resolveSpecial("$fn", scope, args)
            ctx.addProfile(OCC.makeCircle(r, fn), modifier)

        "polygon":
            ctx.addProfile(OCC.makePolygon(args.points, args.paths), modifier)

        // ── Transforms ────────────────────────────────────────────────────
        "translate":
            v = asVector3(args.v ?? args[0], 0)
            childShapes = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.translate(childShapes, v), modifier)

        "rotate":
            a = args.a ?? args[0]
            v = asVector3(args.v ?? [0,0,1])
            childShapes = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.rotate(childShapes, a, v), modifier)

        "scale":
            v = asVector3(args.v ?? args[0], 1)
            childShapes = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.scale(childShapes, v), modifier)

        "mirror":
            v = asVector3(args.v ?? args[0])
            childShapes = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.mirror(childShapes, v), modifier)

        "multmatrix":
            m = args.m ?? args[0]    // 4×4 matrix
            childShapes = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.applyMatrix(childShapes, m), modifier)

        "color":
            // pass-through — tag shape for rendering, no OCC effect
            childShapes = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.tag(childShapes, "color", args), modifier)

        // ── Boolean CSG ───────────────────────────────────────────────────
        "union":
            childShapes = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.union(childShapes), modifier)

        "difference":
            childShapes = evaluateChildren(node.children, scope, ctx)
            base  = childShapes[0]
            tools = childShapes[1:]
            ctx.addShape(OCC.cut(base, tools), modifier)

        "intersection":
            childShapes = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.intersect(childShapes), modifier)

        // ── Extrusion ─────────────────────────────────────────────────────
        "linear_extrude":
            height  = args.height ?? args.h ?? args[0] ?? 1
            twist   = args.twist   ?? 0
            scale   = args.scale   ?? 1
            center  = args.center  ?? false
            fn      = resolveSpecial("$fn", scope, args)
            profile = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.linearExtrude(profile, height, twist, scale, center, fn), modifier)

        "rotate_extrude":
            angle = args.angle ?? 360
            fn    = resolveSpecial("$fn", scope, args)
            profile = evaluateChildren(node.children, scope, ctx)
            ctx.addShape(OCC.rotateExtrude(profile, angle, fn), modifier)

        // ── Import ────────────────────────────────────────────────────────
        "import":
            file = args.file ?? args[0]
            ext  = fileExtension(file).toLowerCase()
            SWITCH ext:
                "stl"  → shape = OCC.importSTL(loadFile(file, ctx))
                "step" | "stp" → shape = OCC.importSTEP(loadFile(file, ctx))
                "dxf"  → shape = OCC.importDXF(loadFile(file, ctx))
                ELSE   → THROW Error("unsupported import format: " + ext)
            ctx.addShape(shape, modifier)

        // ── Surface ───────────────────────────────────────────────────────
        "surface":
            file   = args.file ?? args[0]
            center = args.center ?? false
            invert = args.invert ?? false
            data   = loadFile(file, ctx)
            ctx.addShape(OCC.makeSurface(data, center, invert), modifier)

        // ── children() / echo / assert ────────────────────────────────────
        "children":
            idx = args[0]
            IF idx is null:
                RETURN scope.lookup("$children_list")
            RETURN scope.lookup("$children_list")[idx]

        "echo":
            vals = [evaluateExpr(a.expr, scope) for a in node.args]
            ctx.log("ECHO: " + vals.join(", "))

        "assert":
            cond = evaluateExpr(node.args[0].expr, scope)
            IF NOT isTruthy(cond):
                msg = node.args[1] ?? "assertion failed"
                THROW AssertionError(evaluateExpr(msg, scope))

        // ── User-defined module ───────────────────────────────────────────
        DEFAULT:
            moduleDef = scope.lookupModule(node.name)
            IF moduleDef is null:
                ctx.warn("unknown module: " + node.name)
                RETURN

            // Bind parameters into a new scope
            callScope = new Scope(parent=moduleDef.definitionScope)
            bindParams(moduleDef.params, args, callScope)

            // Expose $children and $children_list for children() calls
            childShapes = evaluateChildren(node.children, scope, ctx)
            callScope.define("$children",      length(childShapes))
            callScope.define("$children_list", childShapes)

            evaluateStatement(moduleDef.body, callScope, ctx)


FUNCTION evaluateChildren(childStmts, scope, ctx):
    childCtx = new OccContext()
    FOR EACH stmt IN childStmts:
        evaluateStatement(stmt, scope, childCtx)
    RETURN childCtx.collectShapes()


FUNCTION evaluateExpr(node, scope):
    SWITCH node.type:
        LITERAL     → RETURN node.value
        IDENT_REF   → RETURN scope.lookup(node.name)
        VECTOR      → RETURN [evaluateExpr(e, scope) for e in node.elements]
        RANGE       →
            start = evaluateExpr(node.start, scope)
            end   = evaluateExpr(node.end,   scope)
            step  = node.step ? evaluateExpr(node.step, scope)
                              : (end >= start ? 1 : -1)
            RETURN expandRange(start, step, end)

        UNARY       →
            val = evaluateExpr(node.expr, scope)
            SWITCH node.op:
                "-" → RETURN negate(val)
                "!" → RETURN NOT isTruthy(val)

        BINARY      →
            left  = evaluateExpr(node.left,  scope)
            right = evaluateExpr(node.right, scope)
            RETURN applyBinaryOp(node.op, left, right)

        TERNARY     →
            cond = evaluateExpr(node.condition, scope)
            IF isTruthy(cond):
                RETURN evaluateExpr(node.then, scope)
            RETURN evaluateExpr(node.else, scope)

        INDEX       →
            obj = evaluateExpr(node.expr,  scope)
            idx = evaluateExpr(node.index, scope)
            IF isVector(obj):  RETURN obj[idx]
            IF isString(obj):  RETURN obj[idx]
            RETURN undef

        MEMBER      →
            obj = evaluateExpr(node.expr, scope)
            SWITCH node.field:
                "x" → RETURN obj[0]
                "y" → RETURN obj[1]
                "z" → RETURN obj[2]
            RETURN undef

        FUNCTION_CALL →
            fnDef = scope.lookupFunction(node.name)
            IF fnDef:
                callScope = new Scope(parent=fnDef.definitionScope)
                bindParams(fnDef.params, bindArgs(node.args, scope), callScope)
                RETURN evaluateExpr(fnDef.expr, callScope)
            // Built-in functions
            RETURN evaluateBuiltinFunction(node.name, node.args, scope)

        LET_EXPR    →
            letScope = new Scope(parent=scope)
            FOR EACH (name, expr) IN node.assignments:
                letScope.define(name, evaluateExpr(expr, letScope))
            RETURN evaluateExpr(node.expr, letScope)


FUNCTION evaluateBuiltinFunction(name, args, scope):
    vals = [evaluateExpr(a.expr, scope) for a in args]
    SWITCH name:
        // Math
        "abs"   → RETURN abs(vals[0])
        "sign"  → RETURN sign(vals[0])
        "floor" → RETURN floor(vals[0])
        "ceil"  → RETURN ceil(vals[0])
        "round" → RETURN round(vals[0])
        "sqrt"  → RETURN sqrt(vals[0])
        "pow"   → RETURN pow(vals[0], vals[1])
        "exp"   → RETURN exp(vals[0])
        "log"   → RETURN log(vals[0])
        "ln"    → RETURN ln(vals[0])
        "sin"   → RETURN sin(toRadians(vals[0]))
        "cos"   → RETURN cos(toRadians(vals[0]))
        "tan"   → RETURN tan(toRadians(vals[0]))
        "asin"  → RETURN toDegrees(asin(vals[0]))
        "acos"  → RETURN toDegrees(acos(vals[0]))
        "atan"  → RETURN toDegrees(atan(vals[0]))
        "atan2" → RETURN toDegrees(atan2(vals[0], vals[1]))
        "min"   → RETURN min(...vals)
        "max"   → RETURN max(...vals)
        "norm"  → RETURN vectorNorm(vals[0])
        // Vector
        "cross" → RETURN cross(vals[0], vals[1])
        "concat"→ RETURN concat(...vals)
        "len"   → RETURN length(vals[0])
        // String
        "str"   → RETURN vals.map(toString).join("")
        "chr"   → RETURN charFromCode(vals[0])
        "ord"   → RETURN codeFromChar(vals[0])
        "split" → RETURN split(vals[0], vals[1])
        // Type checks
        "is_num"  → RETURN isNumber(vals[0])
        "is_bool" → RETURN isBool(vals[0])
        "is_list" → RETURN isVector(vals[0])
        "is_string"→ RETURN isString(vals[0])
        "is_undef"→ RETURN vals[0] is undef
        // Lookup / search
        "lookup"  → RETURN tableLookup(vals[0], vals[1])   // linear interp
        "search"  → RETURN search(vals[0], vals[1], vals[2] ?? 1)
        "version" → RETURN [2019, 5, 0]
        "version_num" → RETURN 20190500
        ELSE → THROW Error("unknown function: " + name)
```

---

## 7. Special Variables Resolution

```
FUNCTION resolveSpecial(name, scope, callArgs):
    // Call-site args override inherited scope values
    IF name in callArgs:
        RETURN callArgs[name]
    val = scope.lookup(name)
    IF val is not undef:
        RETURN val
    // Defaults
    SWITCH name:
        "$fn" → RETURN 0       // 0 = auto (use $fa/$fs)
        "$fa" → RETURN 12      // min angle per fragment (degrees)
        "$fs" → RETURN 2       // min size per fragment (mm)
        "$t"  → RETURN 0       // animation time
    RETURN undef


FUNCTION fragmentCount(r, scope, callArgs):
    fn = resolveSpecial("$fn", scope, callArgs)
    IF fn > 0: RETURN max(3, fn)
    fa = resolveSpecial("$fa", scope, callArgs)
    fs = resolveSpecial("$fs", scope, callArgs)
    // OpenSCAD formula
    RETURN max(5, ceil(max(
        360 / fa,
        (2 * PI * r) / fs
    )))
```

---

## 8. Top-Level Entry Point

```
FUNCTION parseSCAD(entryFilePath, fileLoader):
    context = {
        loadedFiles: Set(),
        useScope:    new Scope(parent=null),
        fileLoader:  fileLoader          // (path) → string | null
    }

    source      = loadFile(entryFilePath, context)
    preprocessed = preprocess(source, entryFilePath, context)
    tokens      = tokenise(preprocessed)
    ast         = parse(tokens)
    globalScope = resolve(ast, context)
    occContext  = new OccContext()

    evaluate(ast, globalScope, occContext)

    RETURN occContext.collectResults()   // list of OCC TopoDS_Shape
```

---

## 9. Error Handling Strategy

```
Error types:
    FileNotFoundError  path
    LexError           message, position
    ParseError         message, token
    AssertionError     message
    EvalError          message, nodeLocation

Each error carries:
    file     string    source file path
    line     number    1-based line number
    column   number    1-based column number
    message  string    human-readable description

FUNCTION formatError(err):
    RETURN `${err.file}:${err.line}:${err.column}: ${err.type}: ${err.message}`

// Evaluator runs in try/catch per top-level statement so one bad
// object does not abort the entire scene — mirrors OpenSCAD behaviour.
FOR EACH stmt IN ast.children:
    TRY:
        evaluateStatement(stmt, scope, ctx)
    CATCH EvalError as e:
        ctx.warn(formatError(e))
        CONTINUE
```