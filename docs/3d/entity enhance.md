entity enhance

Looking at your `Entity.ts` and `Solid3D.ts` files through the lens of our discussions on professional CAD architecture (Parametrics, Assembly Snapping, and the "Mesh vs. Math" divide), you have a solid foundation.

However, there is a **critical architectural flaw** in how you are handling 3D transformations, and several missing pieces needed to support the features we discussed.

Here are the 4 major enhancements your data model needs right now.

---

### 1. CRITICAL FLAW: The "B-Rep Desync" in `Solid3D.ts`

Look at your `move3D()`, `rotate()`, and `scale()` functions in `Solid3D.ts`. You are iterating through the `this.positions` Float32Array and manually updating the vertex coordinates.

**Why this breaks the CAD engine:**
`this.positions` is just the Three.js proxy mesh. If the user moves a box $+50\text{mm}$ in the X direction, your visual mesh moves. But `this.brepSnapshot` (the actual C++ memory payload) **does not move**.
If the user then tries to cut a hole in that box, OpenCASCADE will load the snapshot, try to cut the hole at $X=50$, miss the box entirely (because OpenCASCADE still thinks the box is at $X=0$), and the cut will fail.

**The Fix:** You must introduce a `transformMatrix` (a $4 \times 4$ array) to `Solid3D`. When the user moves the object, you update this matrix. When you send the solid to the worker for a Boolean operation, you must apply this matrix to the B-Rep *before* doing the cut!

```typescript
// Inside Solid3D.ts
export class Solid3D extends Entity {
  // ... existing properties
  
  // ADD THIS: The absolute mathematical transform of the solid
  transformMatrix: number[] = [
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ];

  // Modify move3D to update the matrix, NOT just the vertices!
  move3D(dx: number, dy: number, dz: number) {
    // 1. Update the Matrix
    this.transformMatrix[3] += dx;
    this.transformMatrix[7] += dy;
    this.transformMatrix[11] += dz;

    // 2. Update the visual mesh (your existing loop is fine for immediate UI feedback, 
    // but the matrix is what matters for the math kernel!)
    // ... your existing positions loop ...
  }
}

```

---

### 2. Add the "Feature Tree" (Parametric History)

Right now, `Solid3D` has `creationParams` (e.g., `{ type: "box", ... }`). This is great for a raw primitive, but it doesn't support sequential modeling.
If I make a Box, cut a Hole, and then Fillet the edge, your entity needs to remember all three steps so they can be edited later.

**The Fix:**
Add a `features` array to track every CSG operation applied to this solid.

```typescript
// Add to Solid3D.ts

export interface FeatureNode {
  id: string;
  type: "Extrude" | "Cut" | "Fillet" | "Scale" | "Sketch";
  // The data needed to rebuild this specific step
  parameters: Record<string, any>; 
  // If this feature depends on a specific face (Topological Naming)
  topologicalReference?: GeometricSignature; 
  isActive: boolean;
}

export class Solid3D extends Entity {
  // ...
  // The parametric recipe to rebuild this solid from scratch
  features: FeatureNode[] = [];
}

```

---

### 3. Add Assembly "Mate Connectors"

To support the intelligent "Bolt snapping into a Hole" feature we discussed, the `Entity` class needs to support spatial metadata. The mesh alone doesn't know where the center of a hole is.

**The Fix:**
Define the `MateConnector` interface and add it to the base `Entity`.

```typescript
// Add to Entity.ts

export type ConnectorRole = 'Male' | 'Female' | 'Neutral';

export interface MateConnector {
  id: string;
  name: string;
  origin: { x: number; y: number; z: number }; // Snap center
  axis: { x: number; y: number; z: number };   // Direction for alignment
  role: ConnectorRole;                         // E.g., Male (Bolt shaft)
  category: string;                            // E.g., "M8", "Dowel_5mm"
}

export abstract class Entity {
  // ...
  
  // Intelligent snap points for assemblies
  connectors: MateConnector[] = [];
}

```

---

### 4. Add "Topological Signatures"

To solve the Topological Naming Problem (so sketches and fillets don't break when the solid changes), you need an interface to store the mathematical "fingerprint" of a face.

**The Fix:**
Add this interface to `Solid3D.ts` (or your MathUtils) so it can be attached to your `FeatureNode`s.

```typescript
// Add to Solid3D.ts or a new Types file

export interface GeometricSignature {
  originalFaceIndex: number; // The index it had when it was created
  surfaceType: "Plane" | "Cylinder" | "Sphere" | "Torus" | "Cone" | "NURBS";
  
  // The mathematical fingerprint used to find the face again after a boolean rebuild
  centerOfMass: { x: number; y: number; z: number };
  normalVector: { x: number; y: number; z: number };
  area: number;
  
  // For sketches: the exact 3D point the user clicked to start drawing
  anchorPoint?: { x: number; y: number; z: number }; 
}

```

### Summary of Next Steps

1. Stop mutating `this.positions` as the source of truth for 3D location. Rely on `transformMatrix` and pass that matrix to `multMatrixShape` in your `OCCWorker`.
2. Evolve `creationParams` into a `features[]` array so you can stack operations.
3  (LATER after features created). Inject `MateConnectors` into your generated bolts and plates so your frontend drag-loop can snap them together!