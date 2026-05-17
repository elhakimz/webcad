import { OpenCascadeService } from "../../core/io/OpenCascadeService";
import { EvaluatedGeometry } from "../interpreter/Geometry";
import * as THREE from "three";

export class CsgExecutor {
  private occ: OpenCascadeService;
  private idCounter: number = 0;
  private tempIds: Set<string> = new Set();

  constructor() {
    this.occ = OpenCascadeService.getInstance();
  }

  async execute(geometry: EvaluatedGeometry[]): Promise<THREE.BufferGeometry[]> {
    this.idCounter = 0;
    this.tempIds.clear();
    const results: THREE.BufferGeometry[] = [];

    for (const node of geometry) {
      const geo = await this.evaluateNode(node);
      if (geo) results.push(geo);
    }

    // Cleanup all intermediate shapes except the final results
    const finalIds = new Set(results.map(g => (g.userData as any).entityId));
    const toRelease = Array.from(this.tempIds).filter(id => !finalIds.has(id));
    if (toRelease.length > 0) {
      await this.occ.releaseShapes(toRelease);
    }

    return results;
  }

  private async evaluateNode(node: EvaluatedGeometry): Promise<THREE.BufferGeometry | null> {
    const id = `scad_${this.idCounter++}`;
    this.tempIds.add(id);

    switch (node.type) {
      case "Primitive":
        return this.createPrimitive(node, id);

      case "Transform": {
        const children = await this.evaluateNodes(node.children);
        if (children.length === 0) return null;

        // SCAD implicit union of children before transform
        const sourceId = await this.ensureSingleShape(children, id + "_pre_union");
        this.tempIds.add(sourceId);
        
        return this.applyTransform(node.name, node.params, sourceId, id);
      }

      case "Boolean": {
        const children = await this.evaluateNodes(node.children);
        if (children.length === 0) return null;
        return this.applyBoolean(node.name, children, id);
      }

      case "Group": {
        const children = await this.evaluateNodes(node.children);
        if (children.length === 0) return null;
        return this.applyBoolean("union", children, id);
      }
    }

    return null;
  }

  private async evaluateNodes(nodes: EvaluatedGeometry[]): Promise<THREE.BufferGeometry[]> {
    const results: THREE.BufferGeometry[] = [];
    for (const node of nodes) {
      const geo = await this.evaluateNode(node);
      if (geo) results.push(geo);
    }
    return results;
  }

  private async createPrimitive(node: { name: string; params: any }, id: string): Promise<THREE.BufferGeometry | null> {
    const p = node.params;
    const deflection = 0.1;
    let geo: THREE.BufferGeometry | null = null;

    switch (node.name) {
      case "cube": {
        const size = p.size ?? p[0] ?? 1;
        const center = p.center ?? p[1] ?? false;
        let dx = 1, dy = 1, dz = 1;
        if (Array.isArray(size)) {
          [dx, dy, dz] = size;
        } else {
          dx = dy = dz = size;
        }
        const x = center ? -dx/2 : 0;
        const y = center ? -dy/2 : 0;
        const z = center ? -dz/2 : 0;
        geo = await this.occ.createBox(x, y, z, dx, dy, dz, deflection, id);
        break;
      }
      case "sphere": {
        const r = p.r !== undefined ? p.r : (p.d !== undefined ? p.d / 2 : (p[0] ?? 1));
        geo = await this.occ.createSphere(0, 0, 0, r, deflection, id);
        break;
      }
      case "cylinder": {
        const h = p.h ?? p[0] ?? 1;
        const r1 = p.r1 !== undefined ? p.r1 : (p.r !== undefined ? p.r : (p.d1 !== undefined ? p.d1 / 2 : (p.d !== undefined ? p.d / 2 : (p[1] ?? 1))));
        const r2 = p.r2 !== undefined ? p.r2 : (p.r !== undefined ? p.r : (p.d2 !== undefined ? p.d2 / 2 : (p.d !== undefined ? p.d / 2 : (p[2] ?? 1))));
        const center = p.center ?? p[3] ?? false;
        const z = center ? -h/2 : 0;
        if (r1 === r2) {
          geo = await this.occ.createCylinder(0, 0, z, r1, h, deflection, id);
        } else {
          geo = await this.occ.createCone(0, 0, z, r1, h, deflection, id);
        }
        break;
      }
    }
    if (geo) {
      geo.userData = { ...geo.userData, entityId: id };
    }
    return geo;
  }

  private async applyBoolean(op: string, children: THREE.BufferGeometry[], baseId: string): Promise<THREE.BufferGeometry | null> {
    if (children.length === 0) return null;
    if (children.length === 1) return children[0];

    let resultGeo = children[0];
    let resultId = (resultGeo.userData as any).entityId;
    
    for (let i = 1; i < children.length; i++) {
      const childGeo = children[i];
      const childId = (childGeo.userData as any).entityId;
      
      let type: 'fuse' | 'cut' | 'common' = 'fuse';
      if (op === 'difference') type = 'cut';
      if (op === 'intersection') type = 'common';

      const isLast = (i === children.length - 1);
      const currentResultId = isLast ? baseId : `${baseId}_step_${i}`;
      this.tempIds.add(currentResultId);
      
      resultGeo = await this.occ.createBoolean(type, resultId, childId, currentResultId);
      if (resultGeo) {
        resultGeo.userData = { ...resultGeo.userData, entityId: currentResultId };
      }
      resultId = currentResultId;
    }

    return resultGeo;
  }

  private async applyTransform(name: string, params: any, sourceId: string, targetId: string): Promise<THREE.BufferGeometry | null> {
    const p = params;
    const deflection = 0.1;
    this.tempIds.add(targetId);
    let geo: THREE.BufferGeometry | null = null;

    switch (name) {
      case "translate": {
        const v = p.v ?? p[0] ?? [0, 0, 0];
        geo = await this.occ.transformShape(sourceId, v[0], v[1], v[2], targetId, deflection);
        break;
      }
      case "rotate": {
        const v = p.a ?? p[0] ?? [0, 0, 0];
        // SCAD rotate takes [x, y, z] in degrees
        geo = await this.occ.rotateShape(sourceId, v[0], v[1], v[2], 0, 0, 0, targetId, deflection);
        break;
      }
      case "scale": {
        // Scale still missing in OCC, returning null for now
        return null;
      }
    }
    if (geo) {
      geo.userData = { ...geo.userData, entityId: targetId };
    }
    return geo;
  }

  private async ensureSingleShape(shapes: THREE.BufferGeometry[], id: string): Promise<string> {
    if (shapes.length === 1) {
      return (shapes[0].userData as any).entityId;
    }
    const result = await this.applyBoolean("union", shapes, id);
    return (result?.userData as any).entityId;
  }
}
