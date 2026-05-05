import { Entity, BoundingBox } from "./Entity"
import { Line } from "./Line"
import { Circle } from "./Circle"
import { Arc } from "./Arc"
import { Polyline, PolylineVertex } from "./Polyline"
import { Point } from "./Point"
import { Text } from "./Text"
import { Solid } from "./Solid"
import { Trace } from "./Trace"
import { Shape } from "./Shape"
import { Hatch } from "./Hatch"

export type EntityType = 'line' | 'circle' | 'arc' | 'polyline' | 'point' | 'text' | 'solid' | 'trace' | 'shape' | 'hatch'

export interface EntityData {
  type: EntityType
  id: string
  data: Record<string, unknown>
}

export type ActionType = 'ADD' | 'REMOVE' | 'MODIFY'

export interface HistoryAction {
  type: ActionType
  entityId: string
  entityData: EntityData | null
  previousData: EntityData | null
}

export interface HistorySnapshot {
  actions: HistoryAction[]
  timestamp: number
}

export class HistoryManager {
  private undoStack: HistorySnapshot[] = []
  private redoStack: HistorySnapshot[] = []
  private maxStackSize = 100

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  recordAction(action: HistoryAction) {
    const snapshot: HistorySnapshot = {
      actions: [action],
      timestamp: Date.now()
    }
    
    this.undoStack.push(snapshot)
    
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift()
    }
    
    this.redoStack = []
  }

  recordBatch(actions: HistoryAction[]) {
    if (actions.length === 0) return
    
    const snapshot: HistorySnapshot = {
      actions,
      timestamp: Date.now()
    }
    
    this.undoStack.push(snapshot)
    
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift()
    }
    
    this.redoStack = []
  }

  undo(getEntity: (id: string) => Entity | null, removeEntity: (id: string) => void, addEntity: (entity: Entity) => void): HistoryAction[] {
    if (this.undoStack.length === 0) return []
    
    const snapshot = this.undoStack.pop()!
    const reverseActions: HistoryAction[] = []
    
    for (const action of snapshot.actions) {
      const reverseAction = this.reverseAction(action, getEntity, removeEntity, addEntity)
      if (reverseAction) {
        reverseActions.push(reverseAction)
      }
    }
    
    this.redoStack.push(snapshot)
    
    return reverseActions
  }

  redo(getEntity: (id: string) => Entity | null, removeEntity: (id: string) => void, addEntity: (entity: Entity) => void): HistoryAction[] {
    if (this.redoStack.length === 0) return []
    
    const snapshot = this.redoStack.pop()!
    const forwardActions: HistoryAction[] = []
    
    for (const action of snapshot.actions) {
      const forwardAction = this.applyAction(action, getEntity, removeEntity, addEntity)
      if (forwardAction) {
        forwardActions.push(forwardAction)
      }
    }
    
    this.undoStack.push(snapshot)
    
    return forwardActions
  }

  private reverseAction(action: HistoryAction, getEntity: (id: string) => Entity | null, removeEntity: (id: string) => void, addEntity: (entity: Entity) => void): HistoryAction | null {
    if (action.type === 'ADD') {
      const entity = getEntity(action.entityId)
      if (entity) {
        removeEntity(action.entityId)
        return { type: 'REMOVE', entityId: action.entityId, entityData: action.entityData, previousData: null }
      }
    } else if (action.type === 'REMOVE') {
      if (action.entityData) {
        const entity = this.createEntityFromData(action.entityData)
        if (entity) {
          addEntity(entity)
          return { type: 'ADD', entityId: action.entityId, entityData: action.entityData, previousData: null }
        }
      }
    } else if (action.type === 'MODIFY') {
      const entity = getEntity(action.entityId)
      if (entity && action.previousData) {
        const currentData = this.serializeEntity(entity)
        this.restoreEntity(entity, action.previousData.data)
        return { type: 'MODIFY', entityId: action.entityId, entityData: currentData, previousData: action.entityData }
      }
    }
    return null
  }

  private applyAction(action: HistoryAction, getEntity: (id: string) => Entity | null, removeEntity: (id: string) => void, addEntity: (entity: Entity) => void): HistoryAction | null {
    if (action.type === 'ADD') {
      if (action.entityData) {
        const entity = this.createEntityFromData(action.entityData)
        if (entity) {
          addEntity(entity)
          return { type: 'REMOVE', entityId: action.entityId, entityData: action.entityData, previousData: null }
        }
      }
    } else if (action.type === 'REMOVE') {
      const entity = getEntity(action.entityId)
      if (entity) {
        const entityData = this.serializeEntity(entity)
        removeEntity(action.entityId)
        return { type: 'ADD', entityId: action.entityId, entityData, previousData: null }
      }
    } else if (action.type === 'MODIFY') {
      const entity = getEntity(action.entityId)
      if (entity && action.entityData) {
        const previousData = this.serializeEntity(entity)
        this.restoreEntity(entity, action.entityData.data)
        return { type: 'MODIFY', entityId: action.entityId, entityData: previousData, previousData: action.entityData }
      }
    }
    return null
  }

  serializeEntity(entity: Entity): EntityData {
    const type = entity.constructor.name.toLowerCase()
    const data: Record<string, unknown> = {}
    
    if (entity instanceof Line) {
      data.x1 = entity.x1; data.y1 = entity.y1; data.x2 = entity.x2; data.y2 = entity.y2
    } else if (entity instanceof Circle) {
      data.cx = entity.cx; data.cy = entity.cy; data.r = entity.r
    } else if (entity instanceof Arc) {
      data.cx = entity.cx; data.cy = entity.cy; data.r = entity.r
      data.startAngle = entity.startAngle; data.endAngle = entity.endAngle; data.ccw = entity.ccw
    } else if (entity instanceof Polyline) {
      data.vertices = entity.vertices; data.closed = entity.closed
    } else if (entity instanceof Point) {
      data.x = entity.x; data.y = entity.y
    } else if (entity instanceof Text) {
      data.x = entity.x; data.y = entity.y; data.text = entity.text; data.height = entity.height
    } else if (entity instanceof Solid) {
      data.points = entity.points
    } else if (entity instanceof Trace) {
      data.points = entity.points
    } else if (entity instanceof Shape) {
      data.shapeName = entity.shapeName; data.x = entity.x; data.y = entity.y
      data.scale = entity.shapeScale; data.rotation = entity.rotation; data.segments = entity.segments
    } else if (entity instanceof Hatch) {
      data.patternName = entity.patternName; data.boundaryVertices = entity.boundaryVertices
    }
    
    return { type: type as EntityType, id: entity.id, data }
  }

  createEntityFromData(entityData: EntityData): Entity | null {
    const { type, id, data } = entityData
    
    switch (type) {
      case 'line':
        return new Line(id, data.x1 as number, data.y1 as number, data.x2 as number, data.y2 as number)
      case 'circle':
        return new Circle(id, data.cx as number, data.cy as number, data.r as number)
      case 'arc':
        return new Arc(id, data.cx as number, data.cy as number, data.r as number, 
          data.startAngle as number, data.endAngle as number, data.ccw as boolean)
      case 'polyline':
        return new Polyline(id, data.vertices as PolylineVertex[], data.closed as boolean)
      case 'point':
        return new Point(id, data.x as number, data.y as number)
      case 'text':
        return new Text(id, data.x as number, data.y as number, data.text as string, data.height as number)
      case 'solid':
        return new Solid(id, data.points as {x: number, y: number}[])
      case 'trace':
        return new Trace(id, data.points as {x: number, y: number}[])
      case 'shape':
        return new Shape(id, data.shapeName as string, data.x as number, data.y as number, 
          data.scale as number, data.rotation as number, data.segments as any)
      case 'hatch':
        return new Hatch(id, data.patternName as string, data.boundaryVertices as {x: number, y: number}[][])
      default:
        return null
    }
  }

  restoreEntity(entity: Entity, data: Record<string, unknown>) {
    if (entity instanceof Line) {
      entity.x1 = data.x1 as number; entity.y1 = data.y1 as number
      entity.x2 = data.x2 as number; entity.y2 = data.y2 as number
    } else if (entity instanceof Circle) {
      entity.cx = data.cx as number; entity.cy = data.cy as number; entity.r = data.r as number
    } else if (entity instanceof Arc) {
      entity.cx = data.cx as number; entity.cy = data.cy as number; entity.r = data.r as number
      entity.startAngle = data.startAngle as number; entity.endAngle = data.endAngle as number; entity.ccw = data.ccw as boolean
    } else if (entity instanceof Polyline) {
      entity.vertices = data.vertices as PolylineVertex[]; entity.closed = data.closed as boolean
    } else if (entity instanceof Point) {
      entity.x = data.x as number; entity.y = data.y as number
    } else if (entity instanceof Text) {
      entity.x = data.x as number; entity.y = data.y as number; entity.text = data.text as string; entity.height = data.height as number
    } else if (entity instanceof Solid) {
      entity.points = data.points as {x: number, y: number}[]
    } else if (entity instanceof Trace) {
      entity.points = data.points as {x: number, y: number}[]
    } else if (entity instanceof Shape) {
      entity.x = data.x as number; entity.y = data.y as number
      entity.shapeScale = data.scale as number; entity.rotation = data.rotation as number
    } else if (entity instanceof Hatch) {
      entity.patternName = data.patternName as string; entity.boundaryVertices = data.boundaryVertices as {x: number, y: number}[][]
    }
  }

  clear() {
    this.undoStack = []
    this.redoStack = []
  }
}