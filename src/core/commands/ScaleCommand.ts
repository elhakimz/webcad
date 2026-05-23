import { Command, CommandResponse } from "./types"
import { UnitsConfig } from "../model/Document"
import { Point } from "../engine/MathUtils"
import { FormatUtils } from "../engine/FormatUtils"

function getCreationCoordinate(entity: any): { x: number, y: number, z?: number } {
  if (entity.creationParams && entity.creationParams.params) {
    const p = entity.creationParams.params;
    if (p.x !== undefined && p.y !== undefined) {
      return { x: p.x, y: p.y, z: p.z || 0 };
    }
  }
  if (entity.x1 !== undefined && entity.y1 !== undefined) {
    return { x: entity.x1, y: entity.y1, z: entity.elevation || 0 };
  }
  if (entity.cx !== undefined && entity.cy !== undefined) {
    return { x: entity.cx, y: entity.cy, z: entity.elevation || 0 };
  }
  if (entity.position !== undefined) {
    return { x: entity.position.x, y: entity.position.y, z: entity.position.z || 0 };
  }
  return { x: 0, y: 0, z: 0 };
}

function getObjectCenter(entity: any): { x: number, y: number, z?: number } {
  const isSolid = entity.type === "Solid3D" || entity.constructor.name === "Solid3D";
  if (isSolid && entity.position) {
    return { x: entity.position.x, y: entity.position.y, z: entity.position.z || 0 };
  }
  if (entity.cx !== undefined && entity.cy !== undefined) {
    return { x: entity.cx, y: entity.cy, z: entity.elevation || 0 };
  }
  if (typeof entity.getBoundingBox === 'function') {
    const bbox = entity.getBoundingBox();
    return {
      x: (bbox.minX + bbox.maxX) / 2,
      y: (bbox.minY + bbox.maxY) / 2,
      z: entity.elevation || 0
    };
  }
  return { x: 0, y: 0, z: 0 };
}

export class ScaleCommand implements Command {
  step = 0
  basePoint: Point = { x: 0, y: 0 }
  targetIds: string[] = []
  factor = 1.0

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  calculateFactor(y: number): number {
    const dy = y - this.basePoint.y;
    const factor = 1.0 + dy / 10.0;
    return Math.max(0.01, factor);
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: any): CommandResponse | undefined {
    const val = text.trim().toUpperCase();
    if (this.step === 0 && val !== "") {
      this.targetIds = [val];
      this.step = 1;
      return "Base point [Origin(default)/Creation(O)/Center(C)] <0,0,0>:";
    }

    if (this.step === 1) {
      if (val === "O") {
        if (doc && this.targetIds.length > 0) {
          const entity = doc.getEntity(this.targetIds[0]);
          if (entity) {
            const pt = getCreationCoordinate(entity);
            this.basePoint = { x: pt.x, y: pt.y };
            this.step = 2;
            return "Scale factor:";
          }
        }
        this.basePoint = { x: 0, y: 0 };
        this.step = 2;
        return "Scale factor:";
      }

      if (val === "C") {
        if (doc && this.targetIds.length > 0) {
          const entity = doc.getEntity(this.targetIds[0]);
          if (entity) {
            const pt = getObjectCenter(entity);
            this.basePoint = { x: pt.x, y: pt.y };
            this.step = 2;
            return "Scale factor:";
          }
        }
        this.basePoint = { x: 0, y: 0 };
        this.step = 2;
        return "Scale factor:";
      }

      if (val === "") {
        this.basePoint = { x: 0, y: 0 };
        this.step = 2;
        return "Scale factor:";
      }

      const num = parseFloat(val);
      if (!isNaN(num)) {
        this.basePoint = { x: 0, y: 0 };
        const ids = [...this.targetIds];
        const factor = num;
        const baseX = this.basePoint.x;
        const baseY = this.basePoint.y;
        this.step = 0;
        this.targetIds = [];
        return { action: "scale", ids, factor, baseX, baseY } as CommandResponse;
      }
    }

    if (this.step === 2) {
      const n = parseFloat(val);
      if (!isNaN(n)) {
          const ids = [...this.targetIds];
          const factor = n;
          const baseX = this.basePoint.x;
          const baseY = this.basePoint.y;
          this.step = 0;
          this.targetIds = [];
          return { action: "scale", ids, factor, baseX, baseY } as CommandResponse;
      }
    }
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 1) {
      this.basePoint = { x, y }
      this.step = 2
      return "Scale factor:"
    } else if (this.step === 2) {
      const factor = this.calculateFactor(y);
      const ids = [...this.targetIds];
      const baseX = this.basePoint.x;
      const baseY = this.basePoint.y;
      this.step = 0;
      this.targetIds = [];
      return { action: "scale", ids, factor, baseX, baseY } as CommandResponse;
    }
    return this.getPrompt();
  }

  getPreview(x: number, y: number, _units: UnitsConfig, doc?: any): import('./types').PreviewObject | null {
    if (this.step === 2) {
      const factor = this.calculateFactor(y);
      if (doc && this.targetIds.length > 0) {
        const previewEntities: any[] = [];
        for (const id of this.targetIds) {
          const entity = doc.getEntity(id);
          if (entity) {
            const cloned = entity.clone(entity.id + "_preview");
            if (cloned.scale) {
              cloned.scale(this.basePoint.x, this.basePoint.y, factor);
            }
            previewEntities.push(cloned);
          }
        }
        return { type: 'entities', entities: previewEntities };
      }
    }
    return null
  }

  getDynamicInput(x: number, y: number, units: UnitsConfig): string[] | null {
    if (this.step === 1) {
      return [
        `Specify base point <0,0,0>`,
        `[O] Object Creation Coordinate`,
        `[C] Center of Object`,
        `X: ${FormatUtils.formatValue(x, units)}`,
        `Y: ${FormatUtils.formatValue(y, units)}`
      ];
    }
    if (this.step === 2) {
      const factor = this.calculateFactor(y);
      return [
        `Factor: ${factor.toFixed(2)}`,
        `Move mouse up/down to adjust`
      ];
    }
    return null;
  }

  getReferencePoints() {
    if (this.step === 2) return [this.basePoint]
    return []
  }

  getBasePoint() {
      return this.step === 2 ? this.basePoint : null;
  }

  getPrompt() {
    if (this.step === 0) return "Select objects:";
    if (this.step === 1) return "Base point [Origin(default)/Creation(O)/Center(C)] <0,0,0>:";
    return "Scale factor:";
  }
}
