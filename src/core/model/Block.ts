import { Entity } from "./Entity";
import { Point } from "../engine/MathUtils";

export interface BlockDefinition {
  name: string;
  basePoint: Point;
  entities: Entity[];
}

export class BlockManager {
  private blocks: Map<string, BlockDefinition> = new Map();

  addBlock(name: string, basePoint: Point, entities: Entity[]) {
    this.blocks.set(name.toUpperCase(), {
      name: name.toUpperCase(),
      basePoint,
      entities
    });
  }

  getBlock(name: string): BlockDefinition | undefined {
    return this.blocks.get(name.toUpperCase());
  }

  listBlocks(): string[] {
    return Array.from(this.blocks.keys());
  }

  deleteBlock(name: string) {
    this.blocks.delete(name.toUpperCase());
  }

  clear() {
    this.blocks.clear();
  }
}
