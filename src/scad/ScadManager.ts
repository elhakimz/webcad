import { OpenCascadeService } from "../core/io/OpenCascadeService";
import { ScadLexer } from "./parser/Lexer";
import { ScadParser } from "./parser/Parser";
import { ScadEvaluator } from "./interpreter/Evaluator";
import { CsgExecutor } from "./bridge/CsgExecutor";
import * as AST from "./ast/Nodes";

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

  private resolvePath(currentDir: string, importPath: string): string {
    const cleanImport = importPath.replace(/\\/g, '/');
    let combined = cleanImport;
    if (currentDir) {
      combined = `${currentDir}/${cleanImport}`;
    }
    
    // Normalize path (resolve . and .. segments)
    const parts = combined.split('/');
    const resolvedParts: string[] = [];
    for (const part of parts) {
      if (part === '.' || part === '') {
        continue;
      }
      if (part === '..') {
        resolvedParts.pop();
      } else {
        resolvedParts.push(part);
      }
    }
    return resolvedParts.join('/');
  }

  private getDir(filePath: string): string {
    const parts = filePath.replace(/\\/g, '/').split('/');
    parts.pop(); // remove file name
    return parts.join('/');
  }

  private async resolveImports(
    code: string,
    currentProject: string,
    currentDir: string = "",
    loadedFiles: Set<string> = new Set(),
    visiting: Set<string> = new Set()
  ): Promise<AST.Node[]> {
    const importRegex = /^[ \t]*(include|use)[ \t]*[<"]([^>"]+)[>"][ \t]*;?/gm;
    const imports: { type: string; relativePath: string; matchIndex: number; length: number }[] = [];
    let match;
    const regex = new RegExp(importRegex);
    while ((match = regex.exec(code)) !== null) {
      imports.push({
        type: match[1],
        relativePath: match[2],
        matchIndex: match.index,
        length: match[0].length
      });
    }

    const bodyNodes: AST.Node[] = [];
    let lastIndex = 0;
    
    for (const imp of imports) {
      const segment = code.slice(lastIndex, imp.matchIndex);
      if (segment.trim()) {
        const tokens = this.lexer.tokenize(segment);
        const segmentAST = this.parser.parse(tokens);
        bodyNodes.push(...segmentAST.body);
      }
      lastIndex = imp.matchIndex + imp.length;
      
      const resolvedPath = this.resolvePath(currentDir, imp.relativePath);
      let fileKey = `${imp.type}:${resolvedPath}`;
      
      if (visiting.has(resolvedPath)) {
        console.warn(`Circular import detected: ${resolvedPath}`);
        continue;
      }
      if (loadedFiles.has(fileKey)) {
        continue;
      }
      
      try {
        let response = await fetch(`/api/files/scad/projects/${currentProject}/${resolvedPath}`);
        let actualPath = resolvedPath;
        
        const fallbackPath = this.resolvePath("", imp.relativePath);
        if (!response.ok && resolvedPath !== fallbackPath) {
          const fallbackKey = `${imp.type}:${fallbackPath}`;
          if (visiting.has(fallbackPath)) {
            console.warn(`Circular import detected: ${fallbackPath}`);
            continue;
          }
          if (loadedFiles.has(fallbackKey)) {
            continue;
          }
          const fallbackUrl = `/api/files/scad/projects/${currentProject}/${fallbackPath}`;
          const fallbackResponse = await fetch(fallbackUrl);
          if (fallbackResponse.ok) {
            response = fallbackResponse;
            actualPath = fallbackPath;
            fileKey = fallbackKey;
          }
        }

        // Active project ("myproject") workspace library fallback (e.g. for BOSL/GEOL)
        if (!response.ok) {
          const projectUrl = `/api/files/scad/projects/myproject/${resolvedPath}`;
          const projectResponse = await fetch(projectUrl);
          if (projectResponse.ok) {
            response = projectResponse;
          }
        }

        if (!response.ok && fallbackPath !== resolvedPath) {
          const projectUrl = `/api/files/scad/projects/myproject/${fallbackPath}`;
          const projectResponse = await fetch(projectUrl);
          if (projectResponse.ok) {
            response = projectResponse;
          }
        }
        
        if (!response.ok) {
          throw new Error(`Failed to load ${resolvedPath} (and fallback ${fallbackPath}): ${response.statusText}`);
        }
        
        loadedFiles.add(fileKey);
        const importedContent = await response.text();
        
        const nextDir = this.getDir(actualPath);
        const nextVisiting = new Set(visiting);
        nextVisiting.add(actualPath);
        const importedNodes = await this.resolveImports(importedContent, currentProject, nextDir, loadedFiles, nextVisiting);
        
        if (imp.type === "use") {
          const filtered = importedNodes.filter(node =>
            node.type === "ModuleDef" ||
            node.type === "FunctionDef" ||
            node.type === "Assignment"
          );
          bodyNodes.push(...filtered);
        } else {
          bodyNodes.push(...importedNodes);
        }
      } catch (err: any) {
        console.error(`Error resolving SCAD import ${resolvedPath}:`, err);
        throw new Error(`SCAD Import Error: ${err.message || String(err)}`);
      }
    }
    
    const remainingSegment = code.slice(lastIndex);
    if (remainingSegment.trim()) {
      const tokens = this.lexer.tokenize(remainingSegment);
      const segmentAST = this.parser.parse(tokens);
      bodyNodes.push(...segmentAST.body);
    }
    
    return bodyNodes;
  }

  async execute(
    code: string,
    overrides?: Record<string, any>,
    logger?: (msg: string) => void,
    currentProject: string = "myproject",
    currentDir: string = "",
    absoluteDir: string = ""
  ): Promise<ScadResult> {
    try {
      const displayDir = absoluteDir || currentDir || "/";
      console.log(`Interpreting SCAD with project: ${currentProject} dir: ${displayDir}`);
      const astNodes = await this.resolveImports(code, currentProject, currentDir);
      const ast: AST.Program = {
        type: "Program",
        body: astNodes
      };
      
      const geometryTree = this.evaluator.evaluate(ast, overrides, logger);
      console.log("SCAD GEOMETRY TREE:", JSON.stringify(geometryTree, (key, value) => {
        if (key === "points" || key === "faces") return `[Array: ${value.length}]`;
        return value;
      }, 2));
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

  async clearCache(): Promise<{ success: boolean }> {
    return OpenCascadeService.getInstance().clearCache();
  }
}
