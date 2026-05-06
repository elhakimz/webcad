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
    if (this.children) {
      const index = this.getIndex(item.box);
      if (index !== -1) {
        this.children[index].insert(item);
        return;
      }
    }

    this.items.push(item);

    if (this.items.length > this.maxItems && this.depth < this.maxDepth) {
      if (!this.children) {
        this.split();
      }

      let i = 0;
      while (i < this.items.length) {
        const index = this.getIndex(this.items[i].box);
        if (index !== -1) {
          this.children![index].insert(this.items.splice(i, 1)[0]);
        } else {
          i++;
        }
      }
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

  private getIndex(box: BoundingBox): number {
    if (!this.children) return -1;

    const verticalMidpoint = this.bounds.minX + (this.bounds.maxX - this.bounds.minX) / 2;
    const horizontalMidpoint = this.bounds.minY + (this.bounds.maxY - this.bounds.minY) / 2;

    const topQuadrant = box.minY > horizontalMidpoint;
    const bottomQuadrant = box.maxY < horizontalMidpoint;

    if (box.minX > verticalMidpoint) {
      if (topQuadrant) return 0;
      if (bottomQuadrant) return 3;
    } else if (box.maxX < verticalMidpoint) {
      if (topQuadrant) return 1;
      if (bottomQuadrant) return 2;
    }

    return -1;
  }

  query(range: BoundingBox, result: string[] = []): string[] {
    if (!this.intersects(this.bounds, range)) {
      return result;
    }

    for (const item of this.items) {
      if (this.intersects(item.box, range)) {
        result.push(item.id);
      }
    }

    if (this.children) {
      for (const child of this.children) {
        child.query(range, result);
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
