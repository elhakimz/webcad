import { Entity, BoundingBox } from "./Entity"
import { OpenCascadeService } from "../io/OpenCascadeService"
import { HistoryManager } from "./HistoryManager"
import { LayerManager } from "./Layer"
import { BlockManager } from "./Block"
import { Quadtree } from "../engine/Quadtree"
import { Insert } from "./Insert"
import { DocumentConstraint } from "../engine/SketchSolver"

export interface UnitsConfig {
  type: 'decimal' | 'architectural' | 'metric';
  precision: number;
  scale: number;
}

export interface IDocument {
  id?: string;
  entities: Map<string, Entity>;
  constraints: DocumentConstraint[];
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
  constraints: DocumentConstraint[] = []
  history = new HistoryManager()
  layers = new LayerManager()
  blocks = new BlockManager()
  units: UnitsConfig = { type: 'decimal', precision: 4, scale: 1.0 }
  dimtoh: boolean = false;
  dimtad: boolean = false;
  facetres: number = 1.0;
  currentElevation: number = 0;
  currentThickness: number = 0;
  private spatialIndex: Quadtree
  private idCounters: Map<string, number> = new Map()
  private removalsCount = 0

  constructor() {
    // Large bound for drafting space
    this.spatialIndex = new Quadtree({ minX: -1000000, minY: -1000000, maxX: 1000000, maxY: 1000000 })
    Insert.getBlockCallback = (blockName: string) => this.blocks.getBlock(blockName);
  }

  clear() {
    this.entities.clear();
    this.constraints = [];
    this.history.clear();
    this.idCounters.clear();
    this.spatialIndex.clear();
  }

  getNextId(prefix: string): string {
    const count = (this.idCounters.get(prefix) || 0) + 1;
    this.idCounters.set(prefix, count);
    return `${prefix}${count}_${Date.now()}`;
  }

  addEntity(entity: Entity) {
    this.entities.set(entity.id, entity)
    this.spatialIndex.insert({ id: entity.id, box: entity.getBoundingBox() })
  }

  removeEntity(id: string) {
    this.entities.delete(id)
    this.spatialIndex.remove(id)
    this.removalsCount++
    
    // Filter out constraints referencing the deleted entity ID
    this.constraints = this.constraints.filter(c => {
      const p1 = (c as any).p1;
      const p2 = (c as any).p2;
      const l1 = (c as any).l1;
      const l2 = (c as any).l2;
      
      if (p1 && p1.entityId === id) return false;
      if (p2 && p2.entityId === id) return false;
      if (l1 && (l1[0].entityId === id || l1[1].entityId === id)) return false;
      if (l2 && (l2[0].entityId === id || l2[1].entityId === id)) return false;
      return true;
    });

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

  /**
   * Push a solid's previous B-rep back into the OCC worker.
   *
   * The restored entity clone already carries the tessellation it had before the
   * operation, so the viewport is correct without this. What is not correct is the
   * worker's shape cache: it still holds the post-operation shape, so the next
   * boolean/fillet would be computed against geometry the user already undid.
   */
  private restoreSolidBRep = (id: string, brep: Uint8Array): void => {
    const deflection = 0.1 / (this.facetres || 5.0);
    // The history callback is synchronous; the worker round-trip is not. Nothing
    // downstream depends on its result, so let it settle on its own and make sure
    // a failure surfaces rather than becoming an unhandled rejection.
    Promise.resolve(OpenCascadeService.getInstance().importBRep(id, brep, deflection)).catch(
      (err) => {
        console.error(
          `[Document] failed to restore B-rep for ${id}; the OCC worker may be out of sync:`,
          err
        );
      }
    );
  }

  undo() {
    return this.history.undo(
      (id) => this.getEntity(id),
      (id) => this.removeEntity(id),
      (entity) => this.addEntity(entity),
      (id, dx, dy, dz) => {
        OpenCascadeService.getInstance().transformShape(id, dx, dy, dz);
      },
      this.restoreSolidBRep,
      (constraints) => {
        this.constraints = constraints;
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
      },
      this.restoreSolidBRep,
      (constraints) => {
        this.constraints = constraints;
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