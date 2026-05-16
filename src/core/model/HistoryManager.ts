import { Entity } from "./Entity"
import { Solid3D } from "./Solid3D"

export enum HistoryAction {
  ADD = 'ADD',
  REMOVE = 'REMOVE',
  TRANSFORM = 'TRANSFORM'
}

export interface HistoryRecord {
  action: HistoryAction;
  entityId: string;
  beforeData?: string; // JSON string of entity properties
  afterData?: string;
  entity?: Entity; // Used for ADD/REMOVE
}

export class HistoryManager {
  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.currentTransaction = [];
  }
  private undoStack: HistoryRecord[][] = []
  private redoStack: HistoryRecord[][] = []
  private currentTransaction: HistoryRecord[] = []

  startTransaction() {
    this.currentTransaction = []
  }

  commitTransaction() {
    if (this.currentTransaction.length > 0) {
      this.undoStack.push(this.currentTransaction)
      this.redoStack = []
      this.currentTransaction = []
    }
  }

  recordAdd(entity: Entity) {
    this.currentTransaction.push({
      action: HistoryAction.ADD,
      entityId: entity.id,
      entity: entity.clone(entity.id) // Clone to store state
    })
  }

  recordRemove(entity: Entity) {
    this.currentTransaction.push({
      action: HistoryAction.REMOVE,
      entityId: entity.id,
      entity: entity.clone(entity.id)
    })
  }

  recordTransform(entityBefore: Entity, _entityAfter: Entity) {
    this.currentTransaction.push({
      action: HistoryAction.TRANSFORM,
      entityId: entityBefore.id,
      entity: entityBefore.clone(entityBefore.id)
    })
  }

  undo(
    getEntity: (id: string) => Entity | undefined,
    removeEntity: (id: string) => void,
    addEntity: (entity: Entity) => void,
    onSolidTransform?: (id: string, dx: number, dy: number, dz: number) => void,
    onSolidBRepRestore?: (id: string, brep: Uint8Array) => void
  ) {
    const transaction = this.undoStack.pop()
    if (!transaction) return

    const redoTransaction: HistoryRecord[] = []

    // Process in reverse order for undo
    for (let i = transaction.length - 1; i >= 0; i--) {
      const record = transaction[i]
      if (record.action === HistoryAction.ADD) {
        const entity = getEntity(record.entityId)
        if (entity) {
            redoTransaction.push({ action: HistoryAction.REMOVE, entityId: entity.id, entity: entity.clone(entity.id) })
            removeEntity(record.entityId)
        }
      } else if (record.action === HistoryAction.REMOVE) {
        if (record.entity) {
          addEntity(record.entity.clone(record.entityId))
          redoTransaction.push({ action: HistoryAction.ADD, entityId: record.entityId })
        }
      } else if (record.action === HistoryAction.TRANSFORM) {
        const entity = getEntity(record.entityId)
        if (entity && record.entity) {
          // Store current state for redo before reverting
          redoTransaction.push({ 
              action: HistoryAction.TRANSFORM, 
              entityId: entity.id, 
              entity: entity.clone(entity.id)
          })
          
          // Calculate delta for Solid3D if callback provided
          if (onSolidTransform && (entity instanceof Solid3D)) {
            const posBefore = (record.entity as any).position || { x: 0, y: 0, z: 0 };
            const posAfter = (entity as any).position || { x: 0, y: 0, z: 0 };
            const dx = posBefore.x - posAfter.x;
            const dy = posBefore.y - posAfter.y;
            const dz = posBefore.z - posAfter.z;
            
            if (dx !== 0 || dy !== 0 || dz !== 0) {
              onSolidTransform(entity.id, dx, dy, dz);
            }
          }

          if (onSolidBRepRestore && record.entity instanceof Solid3D && record.entity.brepSnapshot) {
            onSolidBRepRestore(record.entityId, record.entity.brepSnapshot);
          }
          
          removeEntity(record.entityId)
          addEntity(record.entity.clone(record.entityId))
        }
      }
    }

    this.redoStack.push(redoTransaction)
  }

  redo(
    getEntity: (id: string) => Entity | undefined,
    removeEntity: (id: string) => void,
    addEntity: (entity: Entity) => void,
    onSolidTransform?: (id: string, dx: number, dy: number, dz: number) => void,
    onSolidBRepRestore?: (id: string, brep: Uint8Array) => void
  ) {
    const transaction = this.redoStack.pop()
    if (!transaction) return

    const undoTransaction: HistoryRecord[] = []

    for (let i = transaction.length - 1; i >= 0; i--) {
      const record = transaction[i]
      if (record.action === HistoryAction.ADD) {
          const entity = getEntity(record.entityId)
          if (entity) {
              undoTransaction.push({ action: HistoryAction.REMOVE, entityId: entity.id, entity: entity.clone(entity.id) })
              removeEntity(record.entityId)
          }
      } else if (record.action === HistoryAction.REMOVE) {
          if (record.entity) {
              addEntity(record.entity.clone(record.entityId))
              undoTransaction.push({ action: HistoryAction.ADD, entityId: record.entityId })
          }
      } else if (record.action === HistoryAction.TRANSFORM) {
          const entity = getEntity(record.entityId)
          if (entity && record.entity) {
              undoTransaction.push({ 
                  action: HistoryAction.TRANSFORM, 
                  entityId: entity.id, 
                  entity: entity.clone(entity.id)
              })
              
              // Calculate delta for Solid3D if callback provided
              if (onSolidTransform && (entity instanceof Solid3D)) {
                const posBefore = (record.entity as any).position || { x: 0, y: 0, z: 0 };
                const posAfter = (entity as any).position || { x: 0, y: 0, z: 0 };
                const dx = posBefore.x - posAfter.x;
                const dy = posBefore.y - posAfter.y;
                const dz = posBefore.z - posAfter.z;
                
                if (dx !== 0 || dy !== 0 || dz !== 0) {
                  onSolidTransform(entity.id, dx, dy, dz);
                }
              }

              if (onSolidBRepRestore && record.entity instanceof Solid3D && record.entity.brepSnapshot) {
                onSolidBRepRestore(record.entityId, record.entity.brepSnapshot);
              }
              
              removeEntity(record.entityId)
              addEntity(record.entity.clone(record.entityId))
          }
      }
    }

    this.undoStack.push(undoTransaction)
  }

  canUndo() {
    return this.undoStack.length > 0
  }

  canRedo() {
    return this.redoStack.length > 0
  }
}
