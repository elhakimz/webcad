import { Entity } from "./Entity"
import { HistoryManager, HistoryAction } from "./HistoryManager"
import { LayerManager } from "./Layer"

export class Document {
  entities: Map<string, Entity> = new Map()
  history = new HistoryManager()
  layers = new LayerManager()
  private idCounters: Map<string, number> = new Map()

  getNextId(prefix: string): string {
    const count = (this.idCounters.get(prefix) || 0) + 1;
    this.idCounters.set(prefix, count);
    return prefix + count;
  }

  addEntity(entity: Entity) {
    this.entities.set(entity.id, entity)
  }

  removeEntity(id: string) {
    this.entities.delete(id)
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