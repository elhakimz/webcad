import { Entity } from "./Entity"

export class Document {
  entities: Map<string, Entity> = new Map()

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
}
