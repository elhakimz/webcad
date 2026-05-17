import * as AST from "../ast/Nodes";
import { Scope } from "./Scope";
import { EvaluatedGeometry } from "./Geometry";

export class ScadEvaluator {
  private modules: Map<string, AST.ModuleDef> = new Map();
  private functions: Map<string, AST.FunctionDef> = new Map();

  evaluate(program: AST.Program, overrides?: Record<string, any>): EvaluatedGeometry[] {
    const scope = new Scope();
    // Default variables
    scope.set("$fn", 32);
    scope.set("$fa", 12);
    scope.set("$fs", 2);

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
        scope.set(node.name, this.evaluateExpression(node.value, scope));
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

    // Check for built-in primitives
    if (["cube", "sphere", "cylinder", "torus", "cone"].includes(node.name)) {
      return [{ type: "Primitive", name: node.name, params: args }];
    }

    // Check for built-in transforms
    if (["translate", "rotate", "scale", "mirror", "color"].includes(node.name)) {
      const children = this.evaluateBody(node.children, scope);
      return [{ type: "Transform", name: node.name, params: args, children }];
    }

    // Check for built-in booleans
    if (["union", "difference", "intersection"].includes(node.name)) {
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
      // TODO: Handle 'children()' in SCAD by passing node.children to evaluateBody
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

    if (Array.isArray(range)) {
      for (const val of range) {
        const newScope = scope.extend();
        newScope.set(node.variables[0], val);
        results.push(...this.evaluateBody(node.body, newScope));
      }
    }

    return results;
  }

  private evaluateExpression(expr: AST.Expression, scope: Scope): any {
    switch (expr.type) {
      case "Literal":
        return expr.value;
      case "Identifier":
        return scope.get(expr.name);
      case "BinaryExpression": {
        const left = this.evaluateExpression(expr.left, scope);
        const right = this.evaluateExpression(expr.right, scope);
        switch (expr.operator) {
          case "+": return left + right;
          case "-": return left - right;
          case "*": return left * right;
          case "/": return left / right;
          case "==": return left == right;
          case "!=": return left != right;
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
          default: return undefined;
        }
      }
      case "TernaryExpression": {
        const condition = this.evaluateExpression(expr.condition, scope);
        return condition ? this.evaluateExpression(expr.trueExpr, scope) : this.evaluateExpression(expr.falseExpr, scope);
      }
      case "ArrayExpression":
        return expr.elements.map(e => this.evaluateExpression(e, scope));
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
        if (expr.name === "sqrt") return Math.sqrt(this.evaluateExpression(expr.arguments[0].value, scope));
        if (expr.name === "atan2") {
          const y = this.evaluateExpression(expr.arguments[0].value, scope);
          const x = this.evaluateExpression(expr.arguments[1].value, scope);
          return (Math.atan2(y, x) * 180) / Math.PI;
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
      default:
        return undefined;
    }
  }

  private evaluateArguments(args: AST.Argument[], scope: Scope): Record<string, any> {
    const result: Record<string, any> = {};
    args.forEach((arg, i) => {
      const val = this.evaluateExpression(arg.value, scope);
      if (arg.name) {
        result[arg.name] = val;
      } else {
        result[i] = val;
      }
    });
    return result;
  }
}
