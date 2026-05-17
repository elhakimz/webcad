import { OpenCascadeService } from "../core/io/OpenCascadeService";
import { ScadLexer } from "./parser/Lexer";
import { ScadParser } from "./parser/Parser";
import { ScadEvaluator } from "./interpreter/Evaluator";
import { CsgExecutor } from "./bridge/CsgExecutor";

export interface ScadResult {
  success: boolean;
  entities: any[];
  error?: string;
}

export class ScadManager {
  private lexer: ScadLexer;
  private parser: ScadParser;
  private evaluator: ScadEvaluator;
  private executor: CsgExecutor;

  constructor() {
    this.lexer = new ScadLexer();
    this.parser = new ScadParser();
    this.evaluator = new ScadEvaluator();
    this.executor = new CsgExecutor();
  }

  // Executes the SCAD code and returns the resulting 3D entities
  async execute(code: string, overrides?: Record<string, any>): Promise<ScadResult> {
    try {
      console.log("Interpreting SCAD...");
      const tokens = this.lexer.tokenize(code);
      const ast = this.parser.parse(tokens);
      const geometryTree = this.evaluator.evaluate(ast, overrides);
      const geometries = await this.executor.execute(geometryTree);
      
      return {
        success: true,
        entities: geometries
      };
    } catch (e: any) {
      console.error("SCAD Interpretation Error:", e);
      return {
        success: false,
        entities: [],
        error: e.message || String(e)
      };
    }
  }
}
