import { BoundingBox } from "../model/Entity";

export interface QuadtreeItem {
  id: string;
  box: BoundingBox;
}

export class Quadtree {
  private items: QuadtreeItem[] = [];
  private children: Quadtree[] | null = null;
  private maxItems = 10;
  private maxDepth = 10;

  constructor(private bounds: BoundingBox, private depth: number = 0) {}

  insert(item: QuadtreeItem) {
    // If already split, push into every overlapping child (loose quadtree)
    if (this.children) {
      let insertedIntoChild = false;
      for (const child of this.children) {
        if (this.intersects(child.bounds, item.box)) {
          child.insert(item);
          insertedIntoChild = true;
        }
      }
      // Item doesn't overlap any child quadrant (shouldn't happen for a
      // well-formed tree, but guard against it)
      if (!insertedIntoChild) {
        this.items.push(item);
      }
      return;
    }

    this.items.push(item);

    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this.split();
      this.redistribute();
    }
  }

  private split() {
    const subWidth = (this.bounds.maxX - this.bounds.minX) / 2;
    const subHeight = (this.bounds.maxY - this.bounds.minY) / 2;
    const x = this.bounds.minX;
    const y = this.bounds.minY;

    this.children = [
      new Quadtree({ minX: x + subWidth, minY: y + subHeight, maxX: x + subWidth * 2, maxY: y + subHeight * 2 }, this.depth + 1), // Top-Right
      new Quadtree({ minX: x, minY: y + subHeight, maxX: x + subWidth, maxY: y + subHeight * 2 }, this.depth + 1), // Top-Left
      new Quadtree({ minX: x, minY: y, maxX: x + subWidth, maxY: y + subHeight }, this.depth + 1), // Bottom-Left
      new Quadtree({ minX: x + subWidth, minY: y, maxX: x + subWidth * 2, maxY: y + subHeight }, this.depth + 1) // Bottom-Right
    ];
  }

  /** After splitting, move all current items into the appropriate children. */
  private redistribute() {
    const old = this.items;
    this.items = [];
    for (const item of old) {
      // Re-insert through the normal path — now that children exist, each item
      // will be pushed into every overlapping child quadrant.
      this.insert(item);
    }
  }

  query(range: BoundingBox, result: string[] = [], seen = new Set<string>()): string[] {
    if (!this.intersects(this.bounds, range)) {
      return result;
    }

    for (const item of this.items) {
      if (!seen.has(item.id) && this.intersects(item.box, range)) {
        seen.add(item.id);
        result.push(item.id);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.query(range, result, seen);
      }
    }

    return result;
  }

  private intersects(a: BoundingBox, b: BoundingBox): boolean {
    return !(
      a.maxX < b.minX ||
      a.minX > b.maxX ||
      a.maxY < b.minY ||
      a.minY > b.maxY
    );
  }

  remove(id: string): boolean {
    let removed = false;

    const idx = this.items.findIndex(i => i.id === id);
    if (idx !== -1) {
      this.items.splice(idx, 1);
      removed = true;
    }

    // With a loose quadtree, the same item may live in multiple children,
    // so we must walk ALL children (not short-circuit with .some()).
    if (this.children) {
      for (const child of this.children) {
        if (child.remove(id)) {
          removed = true;
        }
      }
    }

    return removed;
  }

  clear() {
    this.items = [];
    if (this.children) {
      for (const child of this.children) {
        child.clear();
      }
      this.children = null;
    }
  }
}
