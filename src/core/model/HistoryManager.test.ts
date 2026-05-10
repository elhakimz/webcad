import { describe, it, expect, vi } from "vitest"
import { HistoryManager } from "./HistoryManager"
import { Line } from "./Line"
import { Entity } from "./Entity"

describe("HistoryManager", () => {
  it("should undo and redo TRANSFORM action using clones", () => {
    const hm = new HistoryManager()
    const line = new Line("1", 0, 0, 10, 10)
    
    // Mock getEntity, removeEntity, addEntity
    const entities = new Map<string, Entity>()
    entities.set("1", line)
    
    const getEntity = (id: string) => entities.get(id)
    const removeEntity = vi.fn((id: string) => entities.delete(id))
    const addEntity = vi.fn((entity: Entity) => entities.set(entity.id, entity))

    // Record transform
    hm.startTransaction()
    const lineBefore = line.clone(line.id)
    line.move(5, 5) // Modify line
    hm.recordTransform(lineBefore, line)
    hm.commitTransaction()

    expect(entities.get("1")).toBe(line)
    expect((entities.get("1") as Line).x1).toBe(5)

    // Undo
    hm.undo(getEntity, removeEntity, addEntity)
    
    expect(removeEntity).toHaveBeenCalledWith("1")
    expect(addEntity).toHaveBeenCalled()
    
    const restored = entities.get("1") as Line
    expect(restored).toBeTruthy()
    expect(restored.x1).toBe(0) // Restored to before state!
    expect(restored).not.toBe(line) // It's a new instance (clone)!
    expect(restored instanceof Line).toBe(true) // Prototype preserved!

    // Redo
    hm.redo(getEntity, removeEntity, addEntity)
    
    const redone = entities.get("1") as Line
    expect(redone).toBeTruthy()
    expect(redone.x1).toBe(5) // Redone to after state!
    expect(redone).not.toBe(restored) // It's a new instance (clone)!
    expect(redone instanceof Line).toBe(true) // Prototype preserved!
  })
})
