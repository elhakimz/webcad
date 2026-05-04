
export abstract class Entity {
  id: string
  layer: string = "0"
  constructor(id: string) {
    this.id = id
  }

  abstract move(dx: number, dy: number): void;
}
