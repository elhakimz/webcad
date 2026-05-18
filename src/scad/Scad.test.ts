import { describe, it, expect } from "vitest";
import { ScadLexer } from "./parser/Lexer";
import { ScadParser } from "./parser/Parser";
import { ScadEvaluator } from "./interpreter/Evaluator";
import { ParameterExtractor } from "./parser/ParameterExtractor";

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

  it("should successfully lex, parse, and evaluate cone, polyhedron, and hull primitives/operations", () => {
    const code = `
      cone(r=5, h=10);
      polyhedron(points=[[0,0,0], [10,0,0], [10,10,0], [0,10,10]], faces=[[0,1,2], [0,2,3]]);
      hull() {
        sphere(5);
        translate([10,0,0]) sphere(5);
      }
    `;
    const lexer = new ScadLexer();
    const tokens = lexer.tokenize(code);
    const parser = new ScadParser();
    const ast = parser.parse(tokens);
    const evaluator = new ScadEvaluator();
    const geom = evaluator.evaluate(ast);

    expect(geom.length).toBe(3);

    const g0 = geom[0] as { type: "Primitive"; name: string; params: Record<string, any> };
    expect(g0.name).toBe("cone");
    expect(g0.params.r).toBe(5);
    expect(g0.params.h).toBe(10);

    const g1 = geom[1] as { type: "Primitive"; name: string; params: Record<string, any> };
    expect(g1.name).toBe("polyhedron");
    expect(g1.params.points).toEqual([[0,0,0], [10,0,0], [10,10,0], [0,10,10]]);

    const g2 = geom[2] as { type: "Boolean"; name: string; children: any[] };
    expect(g2.type).toBe("Boolean");
    expect(g2.name).toBe("hull");
    expect(g2.children.length).toBe(2);
  });

  it("should successfully lex, parse, and evaluate namespaced 2d. and dim. primitives", () => {
    const code = `
      2d.line([0,0], [10,10]);
      2d.circle(r=5);
      2d.arc(center=[0,0], r=5, start=0, end=90);
      2d.polyline(points=[[0,0], [10,0], [10,10]]);
      2d.mtext("Hello", center=[0,0]);
      2d.text("World", center=[0,0]);
      2d.hatch(pattern="ANSI31", points=[[0,0], [10,0], [10,10]]);
      dim.linear([0,0], [10,0], offset=5);
      dim.aligned(p1=[0,0], p2=[10,10], offset=10);
    `;
    const lexer = new ScadLexer();
    const tokens = lexer.tokenize(code);
    const parser = new ScadParser();
    const ast = parser.parse(tokens);
    const evaluator = new ScadEvaluator();
    const geom = evaluator.evaluate(ast);

    expect(geom.length).toBe(9);

    expect((geom[0] as any).name).toBe("2d.line");
    expect((geom[1] as any).name).toBe("2d.circle");
    expect((geom[2] as any).name).toBe("2d.arc");
    expect((geom[3] as any).name).toBe("2d.polyline");
    expect((geom[4] as any).name).toBe("2d.mtext");
    expect((geom[5] as any).name).toBe("2d.text");
    expect((geom[6] as any).name).toBe("2d.hatch");
    expect((geom[7] as any).name).toBe("dim.linear");
    expect((geom[8] as any).name).toBe("dim.aligned");
  });

  it("should successfully lex, parse, and evaluate drafting_bolt_2d.scad", () => {
    const fs = require("fs");
    const path = require("path");
    const filePath = path.join(__dirname, "../../Documents/scad/drafting_bolt_2d.scad");
    const code = fs.readFileSync(filePath, "utf-8");
    const lexer = new ScadLexer();
    const tokens = lexer.tokenize(code);
    const parser = new ScadParser();
    const ast = parser.parse(tokens);
    const evaluator = new ScadEvaluator();
    const geom = evaluator.evaluate(ast);

    expect(geom.length).toBeGreaterThan(0);
  });

  it("should not bleed module definitions between separate evaluations on the same evaluator instance", () => {
    const evaluator = new ScadEvaluator();

    // First script defines module 'foo'
    const code1 = `
      module foo() { cube(1); }
      foo();
    `;
    const lexer = new ScadLexer();
    const tokens1 = lexer.tokenize(code1);
    const parser = new ScadParser();
    const ast1 = parser.parse(tokens1);
    const geom1 = evaluator.evaluate(ast1);
    expect(geom1.length).toBe(1);

    // Second script calls 'foo()' but does not define it
    const code2 = `
      foo();
    `;
    const tokens2 = lexer.tokenize(code2);
    const ast2 = parser.parse(tokens2);
    const geom2 = evaluator.evaluate(ast2);
    // Since 'foo' is cleared, it shouldn't evaluate to anything
    expect(geom2.length).toBe(0);
  });

  it("should successfully evaluate children() inside user-defined modules", () => {
    const code = `
      module wrapper() {
        translate([10, 0, 0]) children();
      }
      wrapper() {
        cube(1);
        sphere(2);
      }
    `;
    const lexer = new ScadLexer();
    const tokens = lexer.tokenize(code);
    const parser = new ScadParser();
    const ast = parser.parse(tokens);
    const evaluator = new ScadEvaluator();
    const geom = evaluator.evaluate(ast);

    expect(geom.length).toBe(1);
    const t = geom[0] as { type: "Transform"; name: string; params: Record<string, any>; children: any[] };
    expect(t.type).toBe("Transform");
    expect(t.name).toBe("translate");
    expect(t.params[0]).toEqual([10, 0, 0]);
    expect(t.children.length).toBe(2);
    expect(t.children[0].name).toBe("cube");
    expect(t.children[1].name).toBe("sphere");
  });

  it("should successfully select specific children using children(index)", () => {
    const code = `
      module first() {
        children(0);
      }
      module second() {
        children(1);
      }
      first() {
        cube(1);
        sphere(2);
      }
      second() {
        cube(1);
        sphere(2);
      }
    `;
    const lexer = new ScadLexer();
    const tokens = lexer.tokenize(code);
    const parser = new ScadParser();
    const ast = parser.parse(tokens);
    const evaluator = new ScadEvaluator();
    const geom = evaluator.evaluate(ast);

    expect(geom.length).toBe(2);
    expect((geom[0] as any).name).toBe("cube");
    expect((geom[1] as any).name).toBe("sphere");
  });

  it("should successfully select multiple children using children(array/range)", () => {
    const code = `
      module select_subset() {
        children([0:2:4]);
      }
      select_subset() {
        cube(0);
        sphere(1);
        cylinder(2);
        cone(3);
      }
    `;
    const lexer = new ScadLexer();
    const tokens = lexer.tokenize(code);
    const parser = new ScadParser();
    const ast = parser.parse(tokens);
    const evaluator = new ScadEvaluator();
    const geom = evaluator.evaluate(ast);

    expect(geom.length).toBe(2);
    expect((geom[0] as any).name).toBe("cube");
    expect((geom[1] as any).name).toBe("cylinder");
  });

  describe("ParameterExtractor Grouping and Inline Comments", () => {
    it("should parse inline right-hand comments as descriptions and standalone comments as group headers", () => {
      const code = `
        // Core Dimensions
        shaft_radius = 4.5;    // M9 Thread equivalent
        shaft_length = 35;     // Shaft length
        head_flats = 16;       // Width across flats of hex head
        head_thickness = 7;    // Bolt head height
      `;
      const extractor = new ParameterExtractor();
      const params = extractor.extract(code);

      expect(params.length).toBe(4);

      // Verify groups (dynamic grouping heuristic)
      expect(params[0].group).toBe("Core Dimensions");
      expect(params[1].group).toBe("Core Dimensions");
      expect(params[2].group).toBe("Core Dimensions");
      expect(params[3].group).toBe("Core Dimensions");

      // Verify inline right-hand comments parsed as descriptions/help text
      expect(params[0].name).toBe("shaft_radius");
      expect(params[0].value).toBe(4.5);
      expect(params[0].description).toBe("M9 Thread equivalent");

      expect(params[1].name).toBe("shaft_length");
      expect(params[1].value).toBe(35);
      expect(params[1].description).toBe("Shaft length");

      expect(params[2].name).toBe("head_flats");
      expect(params[2].value).toBe(16);
      expect(params[2].description).toBe("Width across flats of hex head");

      expect(params[3].name).toBe("head_thickness");
      expect(params[3].value).toBe(7);
      expect(params[3].description).toBe("Bolt head height");
    });
  });

  describe("OpenSCAD Advanced Vector/Matrix Math and List Comprehension Unpacking", () => {
    it("should perform recursive element-wise array operations and scalar-array operations", () => {
      const code = `
        v1 = [1, 2, 3];
        v2 = [4, 5, 6];
        v3 = v1 + v2;
        v4 = v1 * 2;
        v5 = 10 - v1;
        v6 = [2, 4] / 2;
        cube(v3);
        sphere(v4[0]);
        cylinder(v5[0]);
        cone(v6[1]);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(4);
      expect((geom[0] as any).params[0]).toEqual([5, 7, 9]); // [1+4, 2+5, 3+6]
      expect((geom[1] as any).params[0]).toEqual(2); // [1*2, 2*2, 3*2][0]
      expect((geom[2] as any).params[0]).toEqual(9); // [10-1, 10-2, 10-3][0]
      expect((geom[3] as any).params[0]).toEqual(2); // [2/2, 4/2][1]
    });

    it("should perform matrix-matrix and matrix-vector multiplication correctly", () => {
      const code = `
        m1 = [[1, 2], [3, 4]];
        m2 = [[5, 6], [7, 8]];
        vec = [2, 3];
        
        m_res = m1 * m2;
        vec_res = m1 * vec;
        
        cube(m_res[0]);
        cube(m_res[1]);
        sphere(vec_res[0]);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(3);
      // m1 * m2 = [[1*5 + 2*7, 1*6 + 2*8], [3*5 + 4*7, 3*6 + 4*8]] = [[19, 22], [43, 50]]
      expect((geom[0] as any).params[0]).toEqual([19, 22]);
      expect((geom[1] as any).params[0]).toEqual([43, 50]);
      // m1 * vec = [1*2 + 2*3, 3*2 + 4*3] = [8, 18]
      expect((geom[2] as any).params[0]).toEqual(8);
    });

    it("should compare arrays using deep equality", () => {
      const code = `
        eq1 = [1, 2] == [1, 2];
        eq2 = [1, 2] != [1, 3];
        cube(eq1 ? 1 : 0);
        cube(eq2 ? 1 : 0);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(2);
      expect((geom[0] as any).params[0]).toBe(1);
      expect((geom[1] as any).params[0]).toBe(1);
    });

    it("should parse and evaluate 'each' expression splicing inside array literals and list comprehensions", () => {
      const code = `
        arr = [1, each [2, 3], 4];
        comp = [for (i = [1:3]) each [i, i*2]];
        cube(arr);
        cube(comp);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(2);
      expect((geom[0] as any).params[0]).toEqual([1, 2, 3, 4]);
      expect((geom[1] as any).params[0]).toEqual([1, 2, 2, 4, 3, 6]);
    });
  });

  describe("WebCAD SCAD Core Engine Updates", () => {
    it("should successfully evaluate binary modulo and exponentiation operators", () => {
      const code = `
        mod = 5 % 3;
        exp1 = 2 ^ 3;
        exp2 = 2 ^ 3 ^ 2; // Right-associativity: 2 ^ 9 = 512
        cube([mod, exp1, exp2]);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(1);
      const params = (geom[0] as any).params[0];
      expect(params).toEqual([2, 8, 512]);
    });

    it("should successfully evaluate math built-ins norm, cross, lookup, chr, ord, is_function, and rands", () => {
      const code = `
        n = norm([3, 4]);
        cr = cross([1, 0, 0], [0, 1, 0]);
        lk = lookup(2.5, [[1,10],[2,20],[3,30]]);
        ch = chr([72, 69, 76, 76, 79]);
        o = ord("A");
        isf = is_function(1);
        r = rands(0, 10, 3);
        
        cube([n, cr[2], lk]);
        sphere(o);
        cylinder(isf ? 1 : 0);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(3);
      expect((geom[0] as any).params[0]).toEqual([5, 1, 25]);
      expect((geom[1] as any).params[0]).toBe(65);
      expect((geom[2] as any).params[0]).toBe(0);
    });

    it("should successfully evaluate assert statement and pass valid conditions", () => {
      const code = `
        assert(2 + 2 == 4, "Math is broken");
        cube(1);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(1);
    });

    it("should throw error when assert statement condition is violated", () => {
      const code = `
        assert(2 + 2 == 5, "Alternative math");
        cube(1);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();

      expect(() => evaluator.evaluate(ast)).toThrow("Assertion failed: Alternative math");
    });

    it("should successfully evaluate single-element ranges in loop and list comprehensions", () => {
      const code = `
        for (i = 42) {
          cube(i);
        }
        res = [ for (x = 99) x ];
        sphere(res[0]);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(2);
      expect((geom[0] as any).params[0]).toBe(42);
      expect((geom[1] as any).params[0]).toBe(99);
    });

    it("should desugar modifiers *, %, !, and # cleanly", () => {
      const code = `
        *cube(1);
        %sphere(2);
        #cylinder(3);
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      // *cube(1) is discarded
      // %sphere(2) is wrapped in transparent gray color
      // #cylinder(3) is wrapped in transparent debug color
      expect(geom.length).toBe(2);
      expect((geom[0] as any).name).toBe("color");
      expect((geom[1] as any).name).toBe("color");
    });

    it("should parse and evaluate multmatrix transform cleanly", () => {
      const code = `
        multmatrix([
          [1, 0, 0, 10],
          [0, 1, 0, 20],
          [0, 0, 1, 30],
          [0, 0, 0, 1]
        ]) {
          cube(5);
        }
      `;
      const lexer = new ScadLexer();
      const tokens = lexer.tokenize(code);
      const parser = new ScadParser();
      const ast = parser.parse(tokens);
      const evaluator = new ScadEvaluator();
      const geom = evaluator.evaluate(ast);

      expect(geom.length).toBe(1);
      expect((geom[0] as any).name).toBe("multmatrix");
      expect((geom[0] as any).params[0]).toEqual([
        [1, 0, 0, 10],
        [0, 1, 0, 20],
        [0, 0, 1, 30],
        [0, 0, 0, 1]
      ]);
    });
  });
});
