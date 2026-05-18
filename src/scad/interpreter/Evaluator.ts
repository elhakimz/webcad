import * as AST from "../ast/Nodes";
import { Scope } from "./Scope";
import { EvaluatedGeometry } from "./Geometry";

function add(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.min(a.length, b.length);
    const res = [];
    for (let i = 0; i < len; i++) res.push(add(a[i], b[i]));
    return res;
  }
  if (Array.isArray(a)) return a.map(x => add(x, b));
  if (Array.isArray(b)) return b.map(x => add(a, x));
  return a + b;
}

function subtract(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.min(a.length, b.length);
    const res = [];
    for (let i = 0; i < len; i++) res.push(subtract(a[i], b[i]));
    return res;
  }
  if (Array.isArray(a)) return a.map(x => subtract(x, b));
  if (Array.isArray(b)) return b.map(x => subtract(a, x));
  return a - b;
}

function multiply(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length > 0 && Array.isArray(a[0]) && b.length > 0 && Array.isArray(b[0])) {
      const M = a.length;
      const N = a[0].length;
      const P = b[0].length;
      const res: any[][] = [];
      for (let r = 0; r < M; r++) {
        const row = [];
        for (let c = 0; c < P; c++) {
          let sum = 0;
          for (let k = 0; k < N; k++) {
            sum += (a[r][k] || 0) * (b[k][c] || 0);
          }
          row.push(sum);
        }
        res.push(row);
      }
      return res;
    }
    if (a.length > 0 && Array.isArray(a[0]) && b.length > 0 && typeof b[0] === 'number') {
      return a.map(row => {
        let sum = 0;
        const len = Math.min(row.length, b.length);
        for (let i = 0; i < len; i++) {
          sum += row[i] * b[i];
        }
        return sum;
      });
    }
    if (a.length > 0 && typeof a[0] === 'number' && b.length > 0 && Array.isArray(b[0])) {
      const N = a.length;
      const P = b[0].length;
      const res = [];
      for (let c = 0; c < P; c++) {
        let sum = 0;
        for (let k = 0; k < N; k++) {
          sum += a[k] * (b[k][c] || 0);
        }
        res.push(sum);
      }
      return res;
    }
    const len = Math.min(a.length, b.length);
    const res = [];
    for (let i = 0; i < len; i++) res.push(multiply(a[i], b[i]));
    return res;
  }
  if (Array.isArray(a)) return a.map(x => multiply(x, b));
  if (Array.isArray(b)) return b.map(x => multiply(a, x));
  return a * b;
}

function divide(a: any, b: any): any {
  if (Array.isArray(a) && Array.isArray(b)) {
    const len = Math.min(a.length, b.length);
    const res = [];
    for (let i = 0; i < len; i++) res.push(divide(a[i], b[i]));
    return res;
  }
  if (Array.isArray(a)) return a.map(x => divide(x, b));
  if (Array.isArray(b)) return b.map(x => divide(a, x));
  return a / b;
}

function equals(a: any, b: any): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!equals(a[i], b[i])) return false;
    }
    return true;
  }
  return false;
}

export class ScadEvaluator {
  private modules: Map<string, AST.ModuleDef> = new Map();
  private functions: Map<string, AST.FunctionDef> = new Map();
  private logger?: (msg: string) => void;

  evaluate(program: AST.Program, overrides?: Record<string, any>, logger?: (msg: string) => void): EvaluatedGeometry[] {
    this.modules.clear();
    this.functions.clear();
    this.logger = logger;
    const scope = new Scope();
    // Default variables
    scope.set("$fn", 32);
    scope.set("$fa", 12);
    scope.set("$fs", 2);
    scope.set("undef", undefined);
    scope.set("PI", Math.PI);

    if (overrides) {
      for (const [key, val] of Object.entries(overrides)) {
        scope.set(key, val);
      }
    }

    return this.evaluateBody(program.body, scope, overrides);
  }

  private evaluateBody(nodes: AST.Node[], scope: Scope, overrides?: Record<string, any>): EvaluatedGeometry[] {
    const geometry: EvaluatedGeometry[] = [];

    // First pass: register modules and functions
    for (const node of nodes) {
      if (node.type === "ModuleDef") {
        this.modules.set(node.name, node);
      } else if (node.type === "FunctionDef") {
        this.functions.set(node.name, node);
      }
    }

    // Second pass: evaluate statements
    for (const node of nodes) {
      if (node.type === "Assignment") {
        if (overrides && overrides[node.name] !== undefined) {
          // Keep the override value already set in scope at evaluate() start
        } else {
          scope.set(node.name, this.evaluateExpression(node.value, scope));
        }
      } else if (node.type === "ModuleInstantiation") {
        geometry.push(...this.evaluateModuleInstantiation(node, scope));
      } else if (node.type === "IfStatement") {
        geometry.push(...this.evaluateIfStatement(node, scope));
      } else if (node.type === "ForStatement") {
        geometry.push(...this.evaluateForStatement(node, scope));
      }
    }

    return geometry;
  }

  private evaluateModuleInstantiation(node: AST.ModuleInstantiation, scope: Scope): EvaluatedGeometry[] {
    const args = this.evaluateArguments(node.arguments, scope);

    // Handle assert() call
    if (node.name === "assert") {
      const cond = node.arguments[0] ? this.evaluateExpression(node.arguments[0].value, scope) : true;
      if (!cond) {
        const msgVal = node.arguments[1] ? this.evaluateExpression(node.arguments[1].value, scope) : undefined;
        const msg = msgVal !== undefined ? String(msgVal) : "Assertion failed";
        throw new Error(`Assertion failed: ${msg}`);
      }
      return [];
    }

    // Handle echo() call
    if (node.name === "echo") {
      const parts = node.arguments.map(arg => {
        const val = this.evaluateExpression(arg.value, scope);
        if (Array.isArray(val)) {
          return JSON.stringify(val);
        }
        return val !== undefined ? String(val) : "undef";
      });
      const msg = "ECHO: " + parts.join(", ");
      console.log(msg);
      if (this.logger) {
        this.logger(msg);
      }
      return [];
    }

    // Handle children() call
    if (node.name === "children") {
      const parentChildren = scope.get("$children_nodes") || scope.get("$children");
      const parentScope = scope.get("$children_scope");
      if (!parentChildren || !Array.isArray(parentChildren) || parentChildren.length === 0) {
        return [];
      }

      let selectedChildren: AST.Node[] = parentChildren;
      const indexArg = args[0] !== undefined ? args[0] : args["index"];
      if (indexArg !== undefined) {
        if (typeof indexArg === "number") {
          const idx = Math.floor(indexArg);
          if (idx >= 0 && idx < parentChildren.length) {
            selectedChildren = [parentChildren[idx]];
          } else {
            selectedChildren = [];
          }
        } else if (Array.isArray(indexArg)) {
          selectedChildren = [];
          for (const val of indexArg) {
            if (typeof val === "number") {
              const idx = Math.floor(val);
              if (idx >= 0 && idx < parentChildren.length) {
                selectedChildren.push(parentChildren[idx]);
              }
            }
          }
        }
      }

      return this.evaluateBody(selectedChildren, parentScope || scope);
    }

    // Check for built-in primitives
    if (["cube", "sphere", "cylinder", "torus", "cone", "polyhedron", "square", "circle", "polygon",
         "line", "circle2d", "arc2d", "polyline2d", "mtext2d", "text2d", "hatch2d", "dimension2d",
         "2d.line", "2d.circle", "2d.arc", "2d.polyline", "2d.mtext", "2d.text", "2d.hatch",
         "dim.linear", "dim.aligned", "dim.angular", "dim.radial", "dim.diameter", "dim.dimension"].includes(node.name)) {
      const params = { ...args };
      if (params.$fn === undefined) params.$fn = scope.get("$fn");
      if (params.$fa === undefined) params.$fa = scope.get("$fa");
      if (params.$fs === undefined) params.$fs = scope.get("$fs");
      return [{ type: "Primitive", name: node.name, params }];
    }

    // Check for built-in transforms
    if (["translate", "rotate", "scale", "mirror", "multmatrix", "color", "linear_extrude", "rotate_extrude"].includes(node.name)) {
      const children = this.evaluateBody(node.children, scope);
      const params = { ...args };
      if (params.$fn === undefined) params.$fn = scope.get("$fn");
      if (params.$fa === undefined) params.$fa = scope.get("$fa");
      if (params.$fs === undefined) params.$fs = scope.get("$fs");
      return [{ type: "Transform", name: node.name, params, children }];
    }

    // Check for built-in booleans
    if (["union", "difference", "intersection", "hull"].includes(node.name)) {
      const children = this.evaluateBody(node.children, scope);
      return [{ type: "Boolean", name: node.name, children }];
    }

    // User-defined module
    const moduleDef = this.modules.get(node.name);
    if (moduleDef) {
      const newScope = scope.extend();
      // Bind parameters
      moduleDef.parameters.forEach((param, i) => {
        let val = args[param.name] ?? args[i]; // Try named first, then positional
        if (val === undefined && param.defaultValue) {
          val = this.evaluateExpression(param.defaultValue, scope);
        }
        newScope.set(param.name, val);
      });
      
      newScope.set("$children", node.children.length);
      newScope.set("$children_nodes", node.children);
      newScope.set("$children_scope", scope);

      return this.evaluateBody(moduleDef.body, newScope);
    }

    console.warn(`Unknown module or primitive: ${node.name}`);
    return [];
  }

  private evaluateIfStatement(node: AST.IfStatement, scope: Scope): EvaluatedGeometry[] {
    const condition = this.evaluateExpression(node.condition, scope);
    if (condition) {
      return this.evaluateBody(node.thenBranch, scope);
    } else if (node.elseBranch) {
      return this.evaluateBody(node.elseBranch, scope);
    }
    return [];
  }

  private evaluateForStatement(node: AST.ForStatement, scope: Scope): EvaluatedGeometry[] {
    const range = this.evaluateExpression(node.range, scope);
    const results: EvaluatedGeometry[] = [];

    const list = Array.isArray(range) ? range : [range];
    for (const val of list) {
      const newScope = scope.extend();
      newScope.set(node.variables[0], val);
      results.push(...this.evaluateBody(node.body, newScope));
    }

    return results;
  }

  private evaluateExpression(expr: AST.Expression, scope: Scope): any {
    switch (expr.type) {
      case "Literal":
        return expr.value;
      case "Identifier": {
        const val = scope.get(expr.name);
        if (val !== undefined) return val;
        const BUILTIN_CONSTANTS: Record<string, any> = {
          "PI": Math.PI,
          "ORIENT_Z": [0, 0, 1],
          "ORIENT_X": [1, 0, 0],
          "ORIENT_Y": [0, 1, 0],
          "V_UP": [0, 0, 1],
          "V_DOWN": [0, 0, -1],
          "V_LEFT": [-1, 0, 0],
          "V_RIGHT": [1, 0, 0],
          "V_FORWARD": [0, 1, 0],
          "V_BACK": [0, -1, 0],
          "V_CENTER": [0, 0, 0]
        };
        if (expr.name in BUILTIN_CONSTANTS) {
          return BUILTIN_CONSTANTS[expr.name];
        }
        return undefined;
      }
      case "BinaryExpression": {
        const left = this.evaluateExpression(expr.left, scope);
        const right = this.evaluateExpression(expr.right, scope);
        switch (expr.operator) {
          case "+": return add(left, right);
          case "-": return subtract(left, right);
          case "*": return multiply(left, right);
          case "/": return divide(left, right);
          case "%": return left % right;
          case "^": return Math.pow(left, right);
          case "==": return equals(left, right);
          case "!=": return !equals(left, right);
          case "<": return left < right;
          case ">": return left > right;
          case "<=": return left <= right;
          case ">=": return left >= right;
          case "&&": return left && right;
          case "||": return left || right;
          default: return undefined;
        }
      }
      case "UnaryExpression": {
        const arg = this.evaluateExpression(expr.argument, scope);
        switch (expr.operator) {
          case "!": return !arg;
          case "-": return -arg;
          case "+": return +arg;
          default: return undefined;
        }
      }
      case "TernaryExpression": {
        const condition = this.evaluateExpression(expr.condition, scope);
        return condition ? this.evaluateExpression(expr.trueExpr, scope) : this.evaluateExpression(expr.falseExpr, scope);
      }
      case "ArrayExpression": {
        const result: any[] = [];
        for (const element of expr.elements) {
          const val = this.evaluateExpression(element, scope);
          if (val !== undefined) {
            if (Array.isArray(val) && this.shouldSpread(element)) {
              result.push(...val);
            } else {
              result.push(val);
            }
          }
        }
        return result;
      }
      case "RangeExpression": {
        const start = this.evaluateExpression(expr.start, scope);
        const end = this.evaluateExpression(expr.end, scope);
        const step = expr.step ? this.evaluateExpression(expr.step, scope) : 1;
        const arr: number[] = [];
        if (step > 0) {
          for (let v = start; v <= end; v += step) {
            arr.push(v);
          }
        } else if (step < 0) {
          for (let v = start; v >= end; v += step) {
            arr.push(v);
          }
        }
        return arr;
      }
      case "FunctionCall": {
        // Handle built-ins like sin, cos, sqrt, atan2
        if (expr.name === "sin") return Math.sin((this.evaluateExpression(expr.arguments[0].value, scope) * Math.PI) / 180);
        if (expr.name === "cos") return Math.cos((this.evaluateExpression(expr.arguments[0].value, scope) * Math.PI) / 180);
        if (expr.name === "tan") return Math.tan((this.evaluateExpression(expr.arguments[0].value, scope) * Math.PI) / 180);
        if (expr.name === "asin") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          const clamped = Math.max(-1, Math.min(1, typeof val === "number" && !isNaN(val) ? val : 0));
          return (Math.asin(clamped) * 180) / Math.PI;
        }
        if (expr.name === "acos") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          const clamped = Math.max(-1, Math.min(1, typeof val === "number" && !isNaN(val) ? val : 0));
          return (Math.acos(clamped) * 180) / Math.PI;
        }
        if (expr.name === "atan") return (Math.atan(this.evaluateExpression(expr.arguments[0].value, scope)) * 180) / Math.PI;
        if (expr.name === "sqrt") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          const clamped = Math.max(0, typeof val === "number" && !isNaN(val) ? val : 0);
          return Math.sqrt(clamped);
        }
        if (expr.name === "atan2") {
          const y = this.evaluateExpression(expr.arguments[0].value, scope);
          const x = this.evaluateExpression(expr.arguments[1].value, scope);
          return (Math.atan2(y, x) * 180) / Math.PI;
        }
        if (expr.name === "min") {
          const vals = expr.arguments.map(arg => this.evaluateExpression(arg.value, scope));
          if (vals.length === 1 && Array.isArray(vals[0])) {
            return Math.min(...vals[0].flat(Infinity).filter(x => typeof x === "number"));
          }
          return Math.min(...vals.filter(x => typeof x === "number"));
        }
        if (expr.name === "max") {
          const vals = expr.arguments.map(arg => this.evaluateExpression(arg.value, scope));
          if (vals.length === 1 && Array.isArray(vals[0])) {
            return Math.max(...vals[0].flat(Infinity).filter(x => typeof x === "number"));
          }
          return Math.max(...vals.filter(x => typeof x === "number"));
        }
        if (expr.name === "abs") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return typeof val === "number" ? Math.abs(val) : 0;
        }
        if (expr.name === "ceil") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return typeof val === "number" ? Math.ceil(val) : 0;
        }
        if (expr.name === "floor") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return typeof val === "number" ? Math.floor(val) : 0;
        }
        if (expr.name === "round") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return typeof val === "number" ? Math.round(val) : 0;
        }
        if (expr.name === "pow") {
          const x = this.evaluateExpression(expr.arguments[0].value, scope);
          const y = this.evaluateExpression(expr.arguments[1].value, scope);
          return Math.pow(x, y);
        }
        if (expr.name === "sign") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return typeof val === "number" ? Math.sign(val) : 0;
        }
        if (expr.name === "ln") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return Math.log(val);
        }
        if (expr.name === "log") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return Math.log10(val);
        }
        if (expr.name === "exp") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return Math.exp(val);
        }
        if (expr.name === "assert") {
          const cond = this.evaluateExpression(expr.arguments[0].value, scope);
          if (!cond) {
            const msgVal = expr.arguments[1] ? this.evaluateExpression(expr.arguments[1].value, scope) : undefined;
            const msg = msgVal !== undefined ? String(msgVal) : "Assertion failed";
            throw new Error(`SCAD Assertion Failed: ${msg}`);
          }
          return 0;
        }
        if (expr.name === "norm") {
          const v = this.evaluateExpression(expr.arguments[0].value, scope);
          if (Array.isArray(v)) {
            return Math.sqrt(v.reduce((sum: number, x: any) => sum + (Number(x) || 0) * (Number(x) || 0), 0));
          }
          return 0;
        }
        if (expr.name === "cross") {
          const a = this.evaluateExpression(expr.arguments[0].value, scope);
          const b = this.evaluateExpression(expr.arguments[1].value, scope);
          if (Array.isArray(a) && Array.isArray(b)) {
            const ax = Number(a[0]) || 0;
            const ay = Number(a[1]) || 0;
            const az = Number(a[2]) || 0;
            const bx = Number(b[0]) || 0;
            const by = Number(b[1]) || 0;
            const bz = Number(b[2]) || 0;
            return [
              ay * bz - az * by,
              az * bx - ax * bz,
              ax * by - ay * bx
            ];
          }
          return [0, 0, 0];
        }
        if (expr.name === "lookup") {
          const key = Number(this.evaluateExpression(expr.arguments[0].value, scope)) || 0;
          const table = this.evaluateExpression(expr.arguments[1].value, scope) as number[][];

          if (!Array.isArray(table) || table.length === 0) return key;

          // Clamp to table bounds
          if (key <= table[0][0])                  return table[0][1];
          if (key >= table[table.length - 1][0])   return table[table.length - 1][1];

          // Find surrounding entries and interpolate
          for (let i = 0; i < table.length - 1; i++) {
            const [k0, v0] = table[i];
            const [k1, v1] = table[i + 1];
            if (key >= k0 && key <= k1) {
              if (k0 === k1) return v0;
              const t = (key - k0) / (k1 - k0);
              return v0 + t * (v1 - v0);
            }
          }
          return table[table.length - 1][1];
        }
        if (expr.name === "chr") {
          const n = this.evaluateExpression(expr.arguments[0].value, scope);
          if (Array.isArray(n)) {
            return n.map(x => String.fromCharCode(Number(x) || 0)).join("");
          }
          return String.fromCharCode(Number(n) || 0);
        }
        if (expr.name === "ord") {
          const s = this.evaluateExpression(expr.arguments[0].value, scope);
          if (typeof s === "string" && s.length > 0) {
            return s.charCodeAt(0);
          }
          return undefined;
        }
        if (expr.name === "is_function") {
          return false;
        }
        if (expr.name === "rands") {
          const min = Number(this.evaluateExpression(expr.arguments[0].value, scope)) || 0;
          const max = Number(this.evaluateExpression(expr.arguments[1].value, scope)) || 1;
          const n = Math.floor(Number(this.evaluateExpression(expr.arguments[2].value, scope)) || 0);
          const result = [];
          for (let i = 0; i < n; i++) {
            result.push(min + Math.random() * (max - min));
          }
          return result;
        }
        if (expr.name === "len") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          if (Array.isArray(val)) return val.length;
          if (typeof val === "string") return val.length;
          return 0;
        }
        if (expr.name === "str") {
          return expr.arguments.map(arg => {
            const val = this.evaluateExpression(arg.value, scope);
            return val !== undefined ? String(val) : "";
          }).join("");
        }
        if (expr.name === "concat") {
          const arrays = expr.arguments.map(arg => this.evaluateExpression(arg.value, scope));
          const result: any[] = [];
          for (const arr of arrays) {
            if (Array.isArray(arr)) {
              result.push(...arr);
            } else {
              result.push(arr);
            }
          }
          return result;
        }
        if (expr.name === "version_num") return 20210100;
        if (expr.name === "version") return [2021, 1];
        if (expr.name === "is_undef") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return val === undefined;
        }
        if (expr.name === "is_bool") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return typeof val === "boolean";
        }
        if (expr.name === "is_num") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return typeof val === "number";
        }
        if (expr.name === "is_string") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return typeof val === "string";
        }
        if (expr.name === "is_list") {
          const val = this.evaluateExpression(expr.arguments[0].value, scope);
          return Array.isArray(val);
        }
        if (expr.name === "echo") {
          const msg = expr.arguments.map(arg => {
            const val = this.evaluateExpression(arg.value, scope);
            return val !== undefined ? String(val) : "";
          }).join(" ");
          console.log("ECHO:", msg);
          if (this.logger) {
            this.logger("ECHO: " + msg);
          }
          return 0;
        }
        if (expr.name === "search") {
          const keys = this.evaluateExpression(expr.arguments[0].value, scope);
          const dataset = this.evaluateExpression(expr.arguments[1].value, scope);
          const args = this.evaluateArguments(expr.arguments, scope);
          const indexColNum = args.index_col_num ?? args[3] ?? 0;
          
          if (!Array.isArray(dataset)) return [[]];
          
          const result: any[] = [];
          const keysArray = Array.isArray(keys) ? keys : [keys];
          
          for (const key of keysArray) {
            let foundIdx: number | null = null;
            for (let i = 0; i < dataset.length; i++) {
              const item = dataset[i];
              if (indexColNum !== undefined && Array.isArray(item)) {
                if (item[indexColNum] === key) {
                  foundIdx = i;
                  break;
                }
              } else {
                if (item === key) {
                  foundIdx = i;
                  break;
                }
              }
            }
            if (foundIdx !== null) {
              result.push(foundIdx);
            } else {
              result.push([]);
            }
          }
          return Array.isArray(keys) ? result : (result[0] !== undefined && !Array.isArray(result[0]) ? result[0] : [[]]);
        }
        
        const funcDef = this.functions.get(expr.name);
        if (funcDef) {
          const newScope = scope.extend();
          const args = this.evaluateArguments(expr.arguments, scope);
          funcDef.parameters.forEach((param, i) => {
            let val = args[param.name] ?? args[i];
            if (val === undefined && param.defaultValue) {
              val = this.evaluateExpression(param.defaultValue, scope);
            }
            newScope.set(param.name, val);
          });
          return this.evaluateExpression(funcDef.expr, newScope);
        }
        return undefined;
      }
      case "IndexExpression": {
        const target = this.evaluateExpression(expr.expr, scope);
        const idx = this.evaluateExpression(expr.index, scope);
        if (Array.isArray(target) && typeof idx === "number") {
          return target[Math.floor(idx)];
        }
        return undefined;
      }
      case "DotExpression": {
        const target = this.evaluateExpression(expr.expr, scope);
        if (Array.isArray(target)) {
          const prop = expr.property;
          if (prop === "x") return target[0];
          if (prop === "y") return target[1];
          if (prop === "z") return target[2];
        }
        return undefined;
      }
      
      case "LetExpression": {
        const newScope = scope.extend();
        for (const assign of expr.assignments) {
          const val = this.evaluateExpression(assign.value, newScope);
          newScope.set(assign.name, val);
        }
        return this.evaluateExpression(expr.expr, newScope);
      }
      case "ListComprehension": {
        const rangeVal = this.evaluateExpression(expr.range, scope);
        const result: any[] = [];
        const list = Array.isArray(rangeVal) ? rangeVal : [rangeVal];
        for (const item of list) {
          const newScope = scope.extend();
          newScope.set(expr.variable, item);
          
          if (expr.condition) {
            const cond = this.evaluateExpression(expr.condition, newScope);
            if (!cond) continue;
          }
          
          const val = this.evaluateExpression(expr.expr, newScope);
          if (val !== undefined) {
            if (Array.isArray(val) && this.shouldSpread(expr.expr)) {
              result.push(...val);
            } else {
              result.push(val);
            }
          }
        }
        return result;
      }
      case "EachExpression": {
        return this.evaluateExpression(expr.expr, scope);
      }
      default:
        return undefined;
    }
  }

  private evaluateArguments(args: AST.Argument[], scope: Scope): Record<string, any> {
    const result: Record<string, any> = {};
    let positionalIndex = 0;
    args.forEach((arg) => {
      const val = this.evaluateExpression(arg.value, scope);
      if (arg.name) {
        result[arg.name] = val;
      } else {
        result[positionalIndex] = val;
        positionalIndex++;
      }
    });
    return result;
  }

  private shouldSpread(expr: AST.Expression): boolean {
    if (!expr) return false;
    if (expr.type === "ListComprehension" || expr.type === "EachExpression") {
      return true;
    }
    if (expr.type === "LetExpression") {
      return this.shouldSpread((expr as any).expr);
    }
    if (expr.type === "TernaryExpression") {
      return this.shouldSpread((expr as any).trueExpr) || this.shouldSpread((expr as any).falseExpr);
    }
    return false;
  }
}
