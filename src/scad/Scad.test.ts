import { describe, it, expect } from "vitest";
import { ScadLexer } from "./parser/Lexer";
import { ScadParser } from "./parser/Parser";
import { ScadEvaluator } from "./interpreter/Evaluator";

describe("SCAD Parser & Interpreter Ranges and Math", () => {
  it("should successfully lex, parse, and evaluate range loops with step", () => {
    const code = `
      for (i = [0:60:300]) {
        cube(i);
      }
    `;
    const lexer = new ScadLexer();
    const tokens = lexer.tokenize(code);
    const parser = new ScadParser();
    const ast = parser.parse(tokens);
    const evaluator = new ScadEvaluator();
    const geom = evaluator.evaluate(ast);

    expect(geom.length).toBe(6); // 0, 60, 120, 180, 240, 300
    
    const g0 = geom[0] as { type: "Primitive"; name: string; params: Record<string, any> };
    expect(g0.name).toBe("cube");
    expect(g0.params[0]).toBe(0);

    const g5 = geom[5] as { type: "Primitive"; name: string; params: Record<string, any> };
    expect(g5.params[0]).toBe(300);
  });

  it("should successfully evaluate built-in math functions", () => {
    const code = `
      s = sin(90);
      c = cos(0);
      sq = sqrt(16);
      at = atan2(1, 1);
      cube([s, c, sq]);
    `;
    const lexer = new ScadLexer();
    const tokens = lexer.tokenize(code);
    const parser = new ScadParser();
    const ast = parser.parse(tokens);
    const evaluator = new ScadEvaluator();
    const geom = evaluator.evaluate(ast);

    expect(geom.length).toBe(1);
    
    const g0 = geom[0] as { type: "Primitive"; name: string; params: Record<string, any> };
    expect(g0.name).toBe("cube");
    expect(g0.params[0]).toEqual([1, 1, 4]); // sin(90) = 1, cos(0) = 1, sqrt(16) = 4
  });
});
