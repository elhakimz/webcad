import { describe, it, expect } from "vitest";
import { ScadManager } from "./ScadManager";
import * as fs from "fs";
import * as path from "path";

describe("Phillips Drive Showcase Test", () => {
  it("should successfully parse and evaluate the phillips drive showcase", async () => {
    const rootDir = path.join(__dirname, "../../files/scad/projects/myproject");
    const code = fs.readFileSync(path.join(rootDir, "phillips_drive_showcase.scad"), "utf-8");

    // Mock fetch for relative imports
    global.fetch = (async (input: RequestInfo | URL) => {
      const urlStr = typeof input === "string" ? input : (input as any).url || String(input);
      const cleanUrl = decodeURIComponent(urlStr);
      
      const prefix = "/api/files/scad/projects/myproject/";
      if (cleanUrl.includes(prefix)) {
        const relPath = cleanUrl.substring(cleanUrl.indexOf(prefix) + prefix.length);
        const fullPath = path.join(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          return {
            ok: true,
            status: 200,
            text: async () => content,
            statusText: "OK"
          } as Response;
        }
      }
      return { ok: false, status: 404, statusText: "Not Found" } as unknown as Response;
    }) as typeof fetch;

    const manager = new ScadManager();
    const astNodes = await (manager as any).resolveImports(code, "myproject");
    const ast = {
      type: "Program",
      body: astNodes
    };
    
    const geometryTree = (manager as any).evaluator.evaluate(ast);
    expect(geometryTree).toBeDefined();
    expect(Array.isArray(geometryTree)).toBe(true);
    expect(geometryTree.length).toBeGreaterThan(0);
    
    console.log("Successfully evaluated phillips drive showcase. Geometry nodes: ", geometryTree.length);
  });
});
