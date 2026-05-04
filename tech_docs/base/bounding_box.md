# Implementing Bounding Box Selection in CAD

## The Problem
Selecting a 1-pixel-wide line with a mouse is nearly impossible. CAD systems solve this using a two-step process called **Hit Testing** (or Picking), utilizing Axis-Aligned Bounding Boxes (AABB).

## The Two-Step Process
1. **Broad Phase (Bounding Box Check):** Check if the mouse click falls inside a rectangular box surrounding the entity. This is a very fast calculation. We also add a "tolerance" (a few pixels) to make the clickable area larger.
2. **Narrow Phase (Exact Geometry Check):** If the click is inside the bounding box, do the heavy math to check the exact distance from the mouse to the line, circle, or arc.

---

## Pseudocode Implementation

### 1. Define the Bounding Box Structure
```typescript
export interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}
```

### 2. Entity Classes with Bounding Box Calculation
Every CAD entity needs to know how to calculate its own bounding box.

```typescript
// Generic Entity Interface
export interface Entity {
    getBoundingBox(): BoundingBox;
}

// Line Implementation
export class CadLine implements Entity {
    x1: number; y1: number;
    x2: number; y2: number;

    getBoundingBox(): BoundingBox {
        return {
            minX: Math.min(this.x1, this.x2),
            minY: Math.min(this.y1, this.y2),
            maxX: Math.max(this.x1, this.x2),
            maxY: Math.max(this.y1, this.y2)
        };
    }
}

// Circle Implementation
export class CadCircle implements Entity {
    cx: number; cy: number;
    radius: number;

    getBoundingBox(): BoundingBox {
        return {
            minX: this.cx - this.radius,
            minY: this.cy - this.radius,
            maxX: this.cx + this.radius,
            maxY: this.cy + this.radius
        };
    }
}

// Arc Implementation
export class CadArc implements Entity {
    cx: number; cy: number;
    radius: number;
    startAngle: number; endAngle: number;

    getBoundingBox(): BoundingBox {
        // Safe & fast shortcut: Use the full circle's bounding box for the broad phase.
        return {
            minX: this.cx - this.radius,
            minY: this.cy - this.radius,
            maxX: this.cx + this.radius,
            maxY: this.cy + this.radius
        };
    }
}
```

### 3. The Hit Testing Logic
This function runs whenever the user clicks the screen.
pseudocode
```typescript
function getEntityAtSelection(clickX: number, clickY: number, entities: Entity[]): Entity | null {
    const tolerance = 5; // Pixels of wiggle room (the "fat" cursor)

    // Iterate through all drawn entities (reverse order is best to select top-most drawn items first)
    for (let i = entities.length - 1; i >= 0; i--) {
        const entity = entities[i];
        const box = entity.getBoundingBox();

        // 1. BROAD PHASE: Check the Bounding Box (Fast)
        if (
            clickX >= box.minX - tolerance &&
            clickX <= box.maxX + tolerance &&
            clickY >= box.minY - tolerance &&
            clickY <= box.maxY + tolerance
        ) {
            // 2. NARROW PHASE: Click is inside the box. Now check actual geometry distance.
            // (Assume `isPointNearEntity` is a math helper function you write elsewhere)
            if (isPointNearEntity(clickX, clickY, entity, tolerance)) {
                return entity; // Target found!
            }
        }
    }
    
    return null; // Clicked on empty space
}
```