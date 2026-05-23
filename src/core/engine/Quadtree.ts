import { BoundingBox } from "../model/Entity";

export interface QuadtreeItem {
  id: string;
  box: BoundingBox;
}

export class Quadtree {
  private items: QuadtreeItem[] = [];
  private children: Quadtree[] | null = null;

  /**
   * Shared reverse lookup: id → set of all nodes currently holding that item.
   * Created once at the root; every child receives the same reference.
   * Enables O(copies) removal without any tree traversal.
   */
  private readonly reverseMap: Map<string, Set<Quadtree>>;

  constructor(
    private bounds: BoundingBox,
    private depth: number = 0,
    private maxItems: number = 10,
    private maxDepth: number = 10,
    reverseMap?: Map<string, Set<Quadtree>>
  ) {
    this.reverseMap = reverseMap ?? new Map();
  }

  insert(item: QuadtreeItem) {
    if (this.children) {
      let insertedIntoChild = false;
      for (const child of this.children) {
        if (this.intersects(child.bounds, item.box)) {
          child.insert(item);
          insertedIntoChild = true;
        }
      }
      // Guard: item doesn't overlap any child (shouldn't happen for a well-formed tree)
      if (!insertedIntoChild) {
        this.storeItem(item);
      }
      return;
    }

    this.storeItem(item);

    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      this.split();
      this.redistribute();
    }
  }

  /** Store an item in this node and register the node in the shared reverse map. */
  private storeItem(item: QuadtreeItem) {
    this.items.push(item);
    let nodes = this.reverseMap.get(item.id);
    if (!nodes) {
      nodes = new Set();
      this.reverseMap.set(item.id, nodes);
    }
    nodes.add(this);
  }

  private split() {
    const subWidth = (this.bounds.maxX - this.bounds.minX) / 2;
    const subHeight = (this.bounds.maxY - this.bounds.minY) / 2;
    const x = this.bounds.minX;
    const y = this.bounds.minY;

    // Pass the shared reverseMap reference to all children
    this.children = [
      new Quadtree({ minX: x + subWidth, minY: y + subHeight, maxX: x + subWidth * 2, maxY: y + subHeight * 2 }, this.depth + 1, this.maxItems, this.maxDepth, this.reverseMap), // Top-Right
      new Quadtree({ minX: x, minY: y + subHeight, maxX: x + subWidth, maxY: y + subHeight * 2 }, this.depth + 1, this.maxItems, this.maxDepth, this.reverseMap), // Top-Left
      new Quadtree({ minX: x, minY: y, maxX: x + subWidth, maxY: y + subHeight }, this.depth + 1, this.maxItems, this.maxDepth, this.reverseMap), // Bottom-Left
      new Quadtree({ minX: x + subWidth, minY: y, maxX: x + subWidth * 2, maxY: y + subHeight }, this.depth + 1, this.maxItems, this.maxDepth, this.reverseMap) // Bottom-Right
    ];
  }

  /** After splitting, push all items held at this node into the new children. */
  private redistribute() {
    const old = this.items;
    this.items = [];
    // Unregister this node from the reverse map for each item being redistributed
    for (const item of old) {
      const nodes = this.reverseMap.get(item.id);
      if (nodes) {
        nodes.delete(this);
        if (nodes.size === 0) this.reverseMap.delete(item.id);
      }
    }
    // Re-insert through the normal path — items will fan into overlapping children
    for (const item of old) {
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
        if (this.intersects(child.bounds, range)) {
          child.query(range, result, seen);
        }
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

  /**
   * O(copies) removal: look up the set of nodes holding this id directly,
   * splice from each, then delete the reverse-map entry.
   * No tree traversal needed.
   */
  remove(id: string): boolean {
    const nodes = this.reverseMap.get(id);
    if (!nodes || nodes.size === 0) return false;

    for (const node of nodes) {
      const idx = node.items.findIndex(i => i.id === id);
      if (idx !== -1) node.items.splice(idx, 1);
    }
    this.reverseMap.delete(id);
    return true;
  }

  clear() {
    this._clearRecursive();
    this.reverseMap.clear();
  }

  private _clearRecursive() {
    this.items = [];
    if (this.children) {
      for (const child of this.children) child._clearRecursive();
      this.children = null;
    }
  }
}
