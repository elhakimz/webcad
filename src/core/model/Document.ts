import { Entity, BoundingBox } from "./Entity"
import { HistoryManager, HistoryAction } from "./HistoryManager"
import { LayerManager } from "./Layer"
import { BlockManager } from "./Block"
import { Quadtree } from "../engine/Quadtree"

export class Document {
  entities: Map<string, Entity> = new Map()
  history = new HistoryManager()
  layers = new LayerManager()
  blocks = new BlockManager()
  private spatialIndex: Quadtree
  private idCounters: Map<string, number> = new Map()

  constructor() {
    // Large bound for drafting space
    this.spatialIndex = new Quadtree({ minX: -1000000, minY: -1000000, maxX: 1000000, maxY: 1000000 })
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
    // For simplicity, we rebuild if many removals happen, 
    // or just leave it for now. Quadtree implementation doesn't have individual remove yet.
    // Actually, I should probably implement remove in Quadtree or rebuild it.
    this.rebuildSpatialIndex()
  }

  private rebuildSpatialIndex() {
    this.spatialIndex.clear()
    for (const entity of this.entities.values()) {
      this.spatialIndex.insert({ id: entity.id, box: entity.getBoundingBox() })
    }
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

  recordAdd(entity: Entity) {
    const action: HistoryAction = {
      type: 'ADD',
      entityId: entity.id,
      entityData: this.history.serializeEntity(entity),
      previousData: null
    }
    this.history.recordAction(action)
  }

  recordRemove(entity: Entity) {
    const action: HistoryAction = {
      type: 'REMOVE',
      entityId: entity.id,
      entityData: this.history.serializeEntity(entity),
      previousData: null
    }
    this.history.recordAction(action)
  }

  recordModify(entity: Entity, oldData: Record<string, unknown>) {
    const action: HistoryAction = {
      type: 'MODIFY',
      entityId: entity.id,
      entityData: this.history.serializeEntity(entity),
      previousData: { type: 'unknown', id: entity.id, data: oldData }
    }
    this.history.recordAction(action)
  }

  recordBatch(actions: HistoryAction[]) {
    this.history.recordBatch(actions)
  }

  undo() {
    return this.history.undo(
      (id) => this.getEntity(id),
      (id) => this.removeEntity(id),
      (entity) => this.addEntity(entity)
    )
  }

  redo() {
    return this.history.redo(
      (id) => this.getEntity(id),
      (id) => this.removeEntity(id),
      (entity) => this.addEntity(entity)
    )
  }

  canUndo() {
    return this.history.canUndo()
  }

  canRedo() {
    return this.history.canRedo()
  }
}