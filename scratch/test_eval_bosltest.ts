import { ScadLexer } from '../src/scad/parser/Lexer';
import { ScadParser } from '../src/scad/parser/Parser';
import { ScadEvaluator } from '../src/scad/interpreter/Evaluator';
import * as AST from '../src/scad/ast/Nodes';
import { Scope } from '../src/scad/interpreter/Scope';
import fs from 'fs';
import path from 'path';

const projectDir = 'c:/Dev/webcad/files/scad/projects/myproject';
const lexer = new ScadLexer();
const parser = new ScadParser();
const evaluator = new ScadEvaluator();

function resolvePath(currentDir: string, importPath: string): string {
  const cleanImport = importPath.replace(/\\/g, '/');
  let combined = cleanImport;
  if (currentDir) {
    combined = `${currentDir}/${cleanImport}`;
  }
  
  const parts = combined.split('/');
  const resolvedParts: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') continue;
    if (part === '..') {
      resolvedParts.pop();
    } else {
      resolvedParts.push(part);
    }
  }
  return resolvedParts.join('/');
}

function getDir(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/');
  parts.pop();
  return parts.join('/');
}

function resolveImports(
  code: string,
  currentDir: string = "",
  loadedFiles: Set<string> = new Set()
): AST.Node[] {
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
      const tokens = lexer.tokenize(segment);
      const segmentAST = parser.parse(tokens);
      bodyNodes.push(...segmentAST.body);
    }
    lastIndex = imp.matchIndex + imp.length;
    
    let resolvedPath = resolvePath(currentDir, imp.relativePath);
    let fileKey = `${imp.type}:${resolvedPath}`;
    
    if (loadedFiles.has(fileKey)) {
      continue;
    }
    
    try {
      let filePath = path.join(projectDir, resolvedPath);
      if (!fs.existsSync(filePath)) {
        // Try fallback
        const fallbackPath = resolvePath("", imp.relativePath);
        const fallbackKey = `${imp.type}:${fallbackPath}`;
        if (loadedFiles.has(fallbackKey)) {
          continue;
        }
        const fbPath = path.join(projectDir, fallbackPath);
        if (fs.existsSync(fbPath)) {
          filePath = fbPath;
          resolvedPath = fallbackPath;
          fileKey = fallbackKey;
        }
      }
      
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      
      loadedFiles.add(fileKey);
      const importedContent = fs.readFileSync(filePath, 'utf-8');
      const nextDir = getDir(resolvedPath);
      const importedNodes = resolveImports(importedContent, nextDir, loadedFiles);
      
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
      throw err;
    }
  }
  
  const remainingSegment = code.slice(lastIndex);
  if (remainingSegment.trim()) {
    const tokens = lexer.tokenize(remainingSegment);
    const segmentAST = parser.parse(tokens);
    bodyNodes.push(...segmentAST.body);
  }
  
  return bodyNodes;
}

async function run() {
  console.log("Loading and running bosltest.scad...");
  const code = fs.readFileSync(path.join(projectDir, 'bosltest.scad'), 'utf-8');
  
  const astNodes = resolveImports(code);
  const ast: AST.Program = {
    type: "Program",
    body: astNodes
  };
  
  console.log("AST built successfully. Beginning evaluation...");
  const start = Date.now();
  try {
    const geom = evaluator.evaluate(ast);
    const duration = Date.now() - start;
    console.log(`\n🎉 Success! bosltest.scad evaluated successfully in ${duration}ms!`);
    
    // Evaluate a dummy CR_edge in the evaluator's context
    // We can evaluate AST nodes, or let's find the function in the evaluator's functions map
    const edgeFunc = (evaluator as any).functions.get("CR_edge");
    if (edgeFunc) {
      console.log("CR_edge function definition exists!");
      // Let's call the function with sample arguments
      const result = (evaluator as any).evaluateExpression({
        type: "FunctionCall",
        name: "CR_edge",
        arguments: [
          { name: "size", value: { type: "ArrayExpression", elements: [{ type: "Literal", value: 10 }, { type: "Literal", value: 10 }, { type: "Literal", value: 10 }] } }
        ]
      }, new Scope());
      console.log("CR_edge result:", JSON.stringify(result, null, 2));
    } else {
      console.log("CR_edge function definition NOT found!");
    }
    console.log(`Generated ${geom.length} shapes.`);
    for (let i = 0; i < geom.length; i++) {
      const g = geom[i] as any;
      console.log(`Shape ${i}: type=${g.type}, name=${g.name}`);
      if (g.name === "polyhedron") {
        const params = (g as any).params;
        const points = params.points || params[0];
        const faces = params.faces || params.triangles || params[1];
        console.log(`  Points count: ${points?.length}`);
        console.log(`  Faces count: ${faces?.length}`);
        if (points && points.length > 0) {
          console.log(`  Sample Point 0: ${JSON.stringify(points[0])} (Type: ${typeof points[0]}, isArray: ${Array.isArray(points[0])})`);
        }
        if (faces && faces.length > 0) {
          console.log(`  Sample Face 0: ${JSON.stringify(faces[0])} (Type: ${typeof faces[0]}, isArray: ${Array.isArray(faces[0])})`);
          console.log(`  First element of Face 0 type: ${typeof faces[0][0]}, constructor: ${faces[0][0]?.constructor?.name}, value: ${JSON.stringify(faces[0][0])}`);
          
           // Let's analyze if any face has undefined indices or float indices
           let hasNonInteger = false;
           let hasUndef = false;
           let hasNonNumber = false;
           let minIndex = Infinity;
           let maxIndex = -Infinity;
           let nonNumberElements: any[] = [];
           
           for (let fIdx = 0; fIdx < faces.length; fIdx++) {
             const face = faces[fIdx];
             if (!Array.isArray(face)) {
               hasNonNumber = true;
               nonNumberElements.push({ face: fIdx, error: "not_an_array", value: face });
               continue;
             }
             for (let eIdx = 0; eIdx < face.length; eIdx++) {
               const idx = face[eIdx];
               if (idx === undefined || idx === null) {
                 hasUndef = true;
               } else if (typeof idx !== "number") {
                 hasNonNumber = true;
                 nonNumberElements.push({ face: fIdx, element: eIdx, value: idx, type: typeof idx });
               } else {
                 if (!Number.isInteger(idx)) {
                   hasNonInteger = true;
                 }
                 if (idx < minIndex) minIndex = idx;
                 if (idx > maxIndex) maxIndex = idx;
               }
             }
           }
           console.log(`  Faces analysis:`);
           console.log(`    hasNonInteger indices: ${hasNonInteger}`);
           console.log(`    hasUndef/null indices: ${hasUndef}`);
           console.log(`    hasNonNumber elements: ${hasNonNumber}`);
           console.log(`    Non-number elements sample: ${JSON.stringify(nonNumberElements.slice(0, 5))}`);
           console.log(`    Min index: ${minIndex}, Max index: ${maxIndex}`);
           console.log(`    Points array size: ${points?.length}`);
        }
      }
    }
  } catch (e: any) {
    console.error("Evaluation failed with error:", e);
    process.exit(1);
  }
}

run();
