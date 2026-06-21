import { Command, CommandResponse, PreviewObject } from "./types";
import { UnitsConfig, IDocument } from "../model/Document";
import { FormatUtils } from "../engine/FormatUtils";
import { Solid3D } from "../model/Solid3D";
import { OpenCascadeService } from "../io/OpenCascadeService";
import { Line } from "../model/Line";
import { Point } from "../model/Point";
import { Entity } from "../model/Entity";
import * as THREE from "three";

export class PolyhedronCommand implements Command {
  step = 0; // 0: drafting faces
  vertices: { x: number; y: number; z: number }[] = [];
  faces: number[][] = [];
  currentFace: number[] = [];

  occService: OpenCascadeService;

  constructor() {
    this.occService = OpenCascadeService.getInstance();
  }

  private calculateNakedEdges(): { idx1: number; idx2: number }[] {
    const edgeCounts = new Map<string, { count: number; idx1: number; idx2: number }>();
    for (const face of this.faces) {
      for (let i = 0; i < face.length; i++) {
        const v1 = face[i];
        const v2 = face[(i + 1) % face.length];
        const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
        const existing = edgeCounts.get(key);
        if (existing) {
          existing.count++;
        } else {
          edgeCounts.set(key, { count: 1, idx1: v1, idx2: v2 });
        }
      }
    }
    const naked: { idx1: number; idx2: number }[] = [];
    for (const edge of edgeCounts.values()) {
      if (edge.count === 1) {
        naked.push(edge);
      }
    }
    return naked;
  }

  onPoint(x: number, y: number, id: string, units: UnitsConfig, doc?: IDocument, z?: number): CommandResponse | Promise<CommandResponse> {
    const currentZ = z !== undefined ? z : 0;

    // Snapping to existing vertices within tolerance
    let snappedIndex = -1;
    let minDistance = Infinity;
    const snapTolerance = 0.5; // tolerance in drawing units
    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];
      const dx = x - v.x;
      const dy = y - v.y;
      const dz = currentZ - v.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < minDistance) {
        minDistance = dist;
        snappedIndex = i;
      }
    }

    let idx: number;
    if (minDistance < snapTolerance && snappedIndex !== -1) {
      idx = snappedIndex;
    } else {
      this.vertices.push({ x, y, z: currentZ });
      idx = this.vertices.length - 1;
    }

    // Check if clicked the start vertex of the current face to close it
    if (this.currentFace.length >= 3 && idx === this.currentFace[0]) {
      // Close face!
      this.faces.push([...this.currentFace]);
      const faceCount = this.faces.length;
      this.currentFace = [];
      
      const naked = this.calculateNakedEdges();
      if (faceCount >= 4 && naked.length === 0) {
        // Watertight closure auto-bake!
        return this.executeCreate(id, doc);
      }

      return `Face ${faceCount} defined. Start next face or type BAKE to finish. Naked boundaries: ${naked.length}`;
    }

    // Check for duplicate in current face to prevent self-loops
    if (this.currentFace.includes(idx)) {
      return `Vertex already in current face. Click distinct vertices.`;
    }

    this.currentFace.push(idx);
    const ptStr = FormatUtils.formatPoint(this.vertices[idx].x, this.vertices[idx].y, units, "P", this.vertices[idx].z);
    return `Added vertex to face: ${ptStr}. Click next point (click start vertex to close face, or press ENTER).`;
  }

  onInput(text: string, id: string, units: UnitsConfig, pickPt?: { x: number; y: number }, doc?: IDocument): CommandResponse | Promise<CommandResponse> | undefined {
    const input = text.trim().toUpperCase();

    if (input === "E" || input === "EXIT" || input === "QUIT") {
      return { action: "finish" };
    }

    // BAKE command to force creation of Solid3D (open or closed)
    if (input === "B" || input === "BAKE" || input === "FINISH" || (input === "" && this.currentFace.length === 0 && this.faces.length > 0)) {
      if (this.currentFace.length >= 3) {
        this.faces.push([...this.currentFace]);
        this.currentFace = [];
      }
      if (this.faces.length === 0) {
        return "No faces sketched yet. Click points to define a face first.";
      }
      return this.executeCreate(id, doc);
    }

    // CLOSE / ENTER on active face to close it
    if (input === "C" || input === "CLOSE" || input === "") {
      if (this.currentFace.length < 3) {
        return "At least 3 vertices needed to close a face.";
      }
      this.faces.push([...this.currentFace]);
      const faceCount = this.faces.length;
      this.currentFace = [];

      const naked = this.calculateNakedEdges();
      if (faceCount >= 4 && naked.length === 0) {
        return this.executeCreate(id, doc);
      }

      return `Face ${faceCount} defined. Start next face or type BAKE to finish. Naked boundaries: ${naked.length}`;
    }
  }

  private executeCreate(id: string, doc?: IDocument): Promise<CommandResponse> {
    const facetres = doc ? doc.facetres : 5.0;
    const deflection = 0.1 / facetres;

    return this.occService.createPolyhedron(this.vertices, this.faces, deflection, id)
      .then((geometry: THREE.BufferGeometry) => {
        const positions = Array.from(geometry.getAttribute('position').array) as number[];
        const indices = Array.from(geometry.getIndex()?.array || []) as number[];

        const solid = new Solid3D(
          id,
          positions,
          indices,
          geometry.userData?.faceMapping,
          geometry.userData?.edgeLines
        );
        solid.brepSnapshot = geometry.userData?.brepSnapshot;
        solid.creationParams = {
          type: 'polyhedron',
          params: { points: this.vertices, faces: this.faces }
        };

        // Reset
        this.vertices = [];
        this.faces = [];
        this.currentFace = [];

        return solid;
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        return `Error creating polyhedron: ${msg}`;
      });
  }

  getPreview(x: number, y: number, _units: UnitsConfig, _doc?: IDocument): PreviewObject | null {
    const entities: Entity[] = [];

    // 1. Draw existing vertices as points
    for (let i = 0; i < this.vertices.length; i++) {
      const v = this.vertices[i];
      const p = new Point(`v_${i}`, v.x, v.y);
      p.elevation = v.z;
      entities.push(p);
    }

    // 2. Draw sewed faces edges
    // Normal edge: grey (0x888888)
    // Naked edge: RED (0xFF0000)
    const nakedEdges = this.calculateNakedEdges();
    const isNaked = (i1: number, i2: number): boolean => {
      return nakedEdges.some(e => (e.idx1 === i1 && e.idx2 === i2) || (e.idx1 === i2 && e.idx2 === i1));
    };

    const addedEdges = new Set<string>();
    for (const face of this.faces) {
      for (let i = 0; i < face.length; i++) {
        const v1 = face[i];
        const v2 = face[(i + 1) % face.length];
        const key = v1 < v2 ? `${v1}-${v2}` : `${v2}-${v1}`;
        if (addedEdges.has(key)) continue;
        addedEdges.add(key);

        const p1 = this.vertices[v1];
        const p2 = this.vertices[v2];
        const line = new Line(`edge_${key}`, p1.x, p1.y, p2.x, p2.y, p1.z, p2.z - p1.z);
        line.properties.color = isNaked(v1, v2) ? 0xFF0000 : 0x888888;
        entities.push(line);
      }
    }

    // 3. Draw current face under construction (Cyan: 0x00FFFF)
    if (this.currentFace.length > 0) {
      for (let i = 0; i < this.currentFace.length - 1; i++) {
        const p1 = this.vertices[this.currentFace[i]];
        const p2 = this.vertices[this.currentFace[i + 1]];
        const line = new Line(`curr_${i}`, p1.x, p1.y, p2.x, p2.y, p1.z, p2.z - p1.z);
        line.properties.color = 0x00FFFF;
        entities.push(line);
      }

      // Draw dynamic line from last clicked vertex to current cursor position
      const lastPt = this.vertices[this.currentFace[this.currentFace.length - 1]];
      let dynamicEnd = { x, y, z: 0 };
      let snapTarget = -1;
      let minDistance = Infinity;
      for (let i = 0; i < this.vertices.length; i++) {
        const v = this.vertices[i];
        const dx = x - v.x;
        const dy = y - v.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < minDistance) {
          minDistance = dist;
          snapTarget = i;
        }
      }
      if (minDistance < 0.5 && snapTarget !== -1) {
        dynamicEnd = this.vertices[snapTarget];
      }

      const dynLine = new Line("curr_dyn", lastPt.x, lastPt.y, dynamicEnd.x, dynamicEnd.y, lastPt.z, dynamicEnd.z - lastPt.z);
      dynLine.properties.color = 0x00FFFF;
      entities.push(dynLine);

      // Draw dashed closing line to first vertex if currentFace has 2+ vertices
      if (this.currentFace.length >= 2) {
        const firstPt = this.vertices[this.currentFace[0]];
        const closeLine = new Line("curr_close", dynamicEnd.x, dynamicEnd.y, firstPt.x, firstPt.y, dynamicEnd.z, firstPt.z - dynamicEnd.z);
        closeLine.properties.color = 0x008888;
        entities.push(closeLine);
      }
    }

    return { type: "entities", entities };
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.currentFace.length === 0) {
      return [
        `X: ${FormatUtils.formatDistance(x, units)}`,
        `Y: ${FormatUtils.formatDistance(y, units)}`
      ];
    }
    const lastIdx = this.currentFace[this.currentFace.length - 1];
    const lastPt = this.vertices[lastIdx];
    const dx = x - lastPt.x;
    const dy = y - lastPt.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    return [
      `D: ${FormatUtils.formatDistance(dist, units)} (click start vertex to close face)`
    ];
  }

  getPrompt() {
    if (this.currentFace.length === 0) {
      if (this.faces.length === 0) {
        return "POLYHEDRON: Click vertices in sequence to sketch the first face.";
      }
      return "Start next face. Click point to add vertex.";
    }
    return "Sketching face. Click next point or click start vertex to close face.";
  }
}
