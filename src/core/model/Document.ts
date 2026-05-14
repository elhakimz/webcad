import { Entity, BoundingBox } from "./Entity"
import { OpenCascadeService } from "../io/OpenCascadeService.js"
import { HistoryManager } from "./HistoryManager"
import { LayerManager } from "./Layer"
import { BlockManager } from "./Block"
import { Quadtree } from "../engine/Quadtree"

export interface UnitsConfig {
  type: 'decimal' | 'architectural' | 'metric';
  precision: number;
  scale: number;
}

export interface IDocument {
  id?: string;
  entities: Map<string, Entity>;
  units: UnitsConfig;
  dimtoh: boolean;
  dimtad: boolean;
  facetres: number;
  layers: LayerManager;
  blocks: BlockManager;
  currentElevation: number;
  currentThickness: number;
  
  clear(): void;
  getNextId(prefix: string): string;
  addEntity(entity: Entity): void;
  removeEntity(id: string): void;
  updateSpatialIndex(): void;
  querySpatialIndex(range: BoundingBox): string[];
  getEntity(id: string): Entity | undefined;
  getAllEntities(): Entity[];
  getIdCounters(): Record<string, number>;
  restoreIdCounters(counters: Record<string, number>): void;
  recordAdd(entity: Entity): void;
  recordRemove(entity: Entity): void;
  recordTransform(before: Entity, after: Entity): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

export class Document implements IDocument {
  id?: string;
  entities: Map<string, Entity> = new Map()
  history = new HistoryManager()
  layers = new LayerManager()
  blocks = new BlockManager()
  units: UnitsConfig = { type: 'decimal', precision: 4, scale: 1.0 }
  dimtoh: boolean = false;
  dimtad: boolean = false;
  facetres: number = 0.5;
  currentElevation: number = 0;
  currentThickness: number = 0;
  private spatialIndex: Quadtree
  private idCounters: Map<string, number> = new Map()
  private removalsCount = 0

  constructor() {
    // Large bound for drafting space
    this.spatialIndex = new Quadtree({ minX: -1000000, minY: -1000000, maxX: 1000000, maxY: 1000000 })
  }

  clear() {
    this.entities.clear();
    this.history.clear();
    this.idCounters.clear();
    this.spatialIndex.clear();
  }

  getNextId(prefix: string): string {
    const count = (this.idCounters.get(prefix) || 0) + 1;
    this.idCounters.set(prefix, count);
    return prefix + count;
  }

  addEntity(entity: Entity) {
    this.entities.set(entity.id, entity)
    this.spatialIndex.insert({ id: entity.id, box: entity.getBoundingBox() })
  }

  removeEntity(id: string) {
    this.entities.delete(id)
    this.spatialIndex.remove(id)
    this.removalsCount++
    
    if (this.removalsCount >= 100) {
      this.rebuildSpatialIndex()
    }
  }

  private rebuildSpatialIndex() {
    this.spatialIndex.clear()
    for (const entity of this.entities.values()) {
      this.spatialIndex.insert({ id: entity.id, box: entity.getBoundingBox() })
    }
    this.removalsCount = 0
  }

  updateSpatialIndex() {
    this.rebuildSpatialIndex()
  }

  querySpatialIndex(range: BoundingBox): string[] {
    return this.spatialIndex.query(range)
  }

  getEntity(id: string) {
    return this.entities.get(id)
  }

  getAllEntities() {
    return Array.from(this.entities.values())
  }

  getIdCounters(): Record<string, number> {
    const out: Record<string, number> = {};
    this.idCounters.forEach((v, k) => { out[k] = v; });
    return out;
  }

  restoreIdCounters(counters: Record<string, number>): void {
    this.idCounters = new Map(Object.entries(counters));
  }

  recordAdd(entity: Entity) {
    this.history.recordAdd(entity)
  }

  recordRemove(entity: Entity) {
    this.history.recordRemove(entity)
  }

  recordTransform(before: Entity, after: Entity) {
    this.history.recordTransform(before, after);
  }

  undo() {
    return this.history.undo(
      (id) => this.getEntity(id),
      (id) => this.removeEntity(id),
      (entity) => this.addEntity(entity),
      (id, dx, dy, dz) => {
        OpenCascadeService.getInstance().transformShape(id, dx, dy, dz);
      }
    )
  }

  redo() {
    return this.history.redo(
      (id) => this.getEntity(id),
      (id) => this.removeEntity(id),
      (entity) => this.addEntity(entity),
      (id, dx, dy, dz) => {
        OpenCascadeService.getInstance().transformShape(id, dx, dy, dz);
      }
    )
  }

  canUndo() {
    return this.history.canUndo()
  }

  canRedo() {
    return this.history.canRedo()
  }
}