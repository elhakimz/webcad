import { Command, CommandResponse, PreviewObject, SelectionBoxPreview } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Entity } from "../model/Entity"
import { SelectionEngine } from "../engine/SelectionEngine"
import { StretchEngine, BoundingBox } from "../engine/StretchEngine"

export class StretchCommand implements Command {
  step = 0
  windowStart: { x: number, y: number } | null = null
  windowEnd: { x: number, y: number } | null = null
  basePoint: { x: number, y: number } | null = null
  targetPoint: { x: number, y: number } | null = null
  selectedEntities: Entity[] = []
  window: BoundingBox | null = null

  onInput(_text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }): CommandResponse | undefined {
    return this.getPrompt();
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig, doc?: IDocument): CommandResponse {
    if (this.step === 0) {
      this.windowStart = { x, y };
      this.step = 1;
      return "Specify opposite corner:";
    }
    if (this.step === 1) {
      this.windowEnd = { x, y };
      this.window = {
        minX: Math.min(this.windowStart!.x, this.windowEnd!.x),
        minY: Math.min(this.windowStart!.y, this.windowEnd!.y),
        maxX: Math.max(this.windowStart!.x, this.windowEnd!.x),
        maxY: Math.max(this.windowStart!.y, this.windowEnd!.y)
      };

      if (doc) {
        // Enforce crossing selection logic here or just query
        this.selectedEntities = SelectionEngine.getEntitiesInCrossingSpatial(
          this.window!.minX, this.window!.minY, this.window!.maxX, this.window!.maxY, 
          doc
        );
      }

      if (this.selectedEntities.length === 0) {
        this.step = 0;
        this.windowStart = null;
        this.windowEnd = null;
        return "No objects selected. Specify first corner:";
      }

      this.step = 2;
      return "Specify base point:";
    }
    if (this.step === 2) {
      this.basePoint = { x, y };
      this.step = 3;
      return "Specify second point:";
    }
    if (this.step === 3) {
      this.targetPoint = { x, y };
      const displacement = {
        x: this.targetPoint.x - this.basePoint!.x,
        y: this.targetPoint.y - this.basePoint!.y
      };

      // Clone entities and apply stretch
      const results: Entity[] = [];
      for (const e of this.selectedEntities) {
        const clone = e.clone(e.id);
        if (StretchEngine.applyStretch(clone, this.window!, displacement)) {
            results.push(clone);
        }
      }

      return { action: 'stretch', entities: results };
    }
    return this.getPrompt();
  }

  getPrompt() {
    if (this.step === 0) return "STRETCH: Click an empty area to start a crossing-window selection box...";
    if (this.step === 1) return "STRETCH: Click opposite corner to enclose the vertices you want to move:";
    if (this.step === 2) return "STRETCH: Specify base point (start of movement):";
    return "STRETCH: Specify second point (end of movement):";
  }

  getPreview(x: number, y: number, _units: UnitsConfig): PreviewObject | null {
    if (this.step === 1 && this.windowStart) {
      return {
        type: 'selection_box',
        x1: this.windowStart.x,
        y1: this.windowStart.y,
        x2: x,
        y2: y,
        isCrossing: true
      } as SelectionBoxPreview;
    }
    if (this.step === 3 && this.basePoint && this.window) {
      const displacement = { x: x - this.basePoint.x, y: y - this.basePoint.y };
      const previewEntities: Entity[] = [];
      
      for (const e of this.selectedEntities) {
        const clone = e.clone(e.id);
        if (StretchEngine.applyStretch(clone, this.window, displacement)) {
          previewEntities.push(clone);
        }
      }
      return { type: 'entities', entities: previewEntities };
    }
    return null;
  }

  getBasePoint(): { x: number, y: number } | null {
    return this.step === 3 ? this.basePoint : null;
  }

  getReferencePoints(): { x: number, y: number }[] {
    if (this.step === 3 && this.basePoint) return [this.basePoint];
    return [];
  }
}
