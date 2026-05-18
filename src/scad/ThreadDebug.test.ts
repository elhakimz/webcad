import { describe, it } from "vitest";
import { ScadManager } from "./ScadManager";
import * as fs from "fs";
import * as path from "path";

describe("Thread Debug Test", () => {
  it("should evaluate threaded rod geometry and log details", async () => {
    const code = `
      include <BOSL/constants.scad>
      use <BOSL/threading.scad>

      trapezoidal_threaded_nut(od=16, id=8, h=8, pitch=2, slop=0.2, align=V_UP);
    `;

    const rootDir = path.join(__dirname, "../../files/scad/projects/myproject");

    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === "string" ? input : (input as any).url || String(input);
      const prefix = "/api/files/scad/projects/myproject/";
      const cleanUrl = decodeURIComponent(urlStr);
      if (cleanUrl.includes("BOSL/constants.scad")) {
        return { ok: true, status: 200, text: async () => `PI = 3.14159; V_UP = [0,0,1];`, statusText: "OK" } as Response;
      }
      if (cleanUrl.includes("BOSL/threading.scad")) {
        return {
          ok: true,
          status: 200,
          text: async () => `module trapezoidal_threaded_nut(od=16, id=8, h=8, pitch=2, slop=0.2, align=[0,0,1]) { polyhedron(points=[[0,0,0],[1,0,0],[0,1,0],[0,0,1]], faces=[[0,1,2],[0,2,3],[0,3,1],[1,3,2]]); }`,
          statusText: "OK"
        } as Response;
      }
      if (cleanUrl.startsWith(prefix)) {
        const relPath = cleanUrl.substring(prefix.length);
        const fullPath = path.join(rootDir, relPath);
        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          return {
            ok: true,
            status: 200,
            text: async () => content,
            statusText: "OK",
            json: async () => JSON.parse(content)
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
    console.log("GEOMETRY TREE:", JSON.stringify(geometryTree, null, 2));
    // const results = await (manager as any).executor.execute(geometryTree);
    // console.log("Executed results count:", results.length);
    // results.forEach((res: any, idx: number) => {
    //   console.log(`Result #${idx}:`, res.constructor.name, "userData:", JSON.stringify(res.userData));
    // });

    let polyhedronNode: any = null;
    function findPolyhedron(node: any) {
      if (node.type === "Primitive" && node.name === "polyhedron") {
        polyhedronNode = node;
        return;
      }
      if (node.children) {
        for (const child of node.children) {
          findPolyhedron(child);
        }
      }
    }
    findPolyhedron(geometryTree[0]);

    if (!polyhedronNode) {
      console.log("No polyhedron found!");
      return;
    }

    const points = polyhedronNode.params.points;
    const faces = polyhedronNode.params.faces;
    console.log("Polyhedron points count:", points.length);
    console.log("Polyhedron faces count:", faces.length);

    let oobCount = 0;
    let nanCount = 0;
    let nullCount = 0;
    let notArrayCount = 0;

    for (let f = 0; f < faces.length; f++) {
      const face = faces[f];
      if (!Array.isArray(face)) {
        notArrayCount++;
        continue;
      }
      for (const idx of face) {
        if (idx === null || idx === undefined) {
          nullCount++;
        } else if (isNaN(idx)) {
          nanCount++;
        } else if (idx < 0 || idx >= points.length) {
          oobCount++;
        }
      }
    }

    console.log("Not array count:", notArrayCount);
    console.log("Out of bounds indices count:", oobCount);
    console.log("NaN indices count:", nanCount);
    console.log("Null/Undefined indices count:", nullCount);
    console.log("Sample faces (first 5):", JSON.stringify(faces.slice(0, 5), null, 2));
  });
});
