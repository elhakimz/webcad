3d solid snapping

In professional CAD architecture, what you are describing is known as a **Concentric Mate** or an **Axis-to-Axis Snap**.

To make a bolt automatically jump into a hole, your engine must perform two distinct mathematical operations simultaneously: **Proximity Detection** (Translation) and **Axis Alignment** (Rotation).

Here is exactly how you build this "smart snapping" logic into your WebCAD frontend using Three.js, bridging the gap between user mouse movements and mathematical precision.

### The 3-Step Snapping Architecture

#### 1. Define the "Snap Points" (The Metadata)

A raw 3D mesh doesn't know what a "hole" or a "bottom" is. You must define these geometric anchors either during the B-Rep generation in your WebWorker or via heuristics in your frontend.

* **The Bolt (Moving Object):** Needs a defined `SnapOrigin` (a `THREE.Vector3` at the center of its bottom face) and a `SnapAxis` (a normalized vector pointing straight up its shaft).
* **The Hole (Target Object):** Needs a `TargetOrigin` (center of the hole opening) and a `TargetAxis` (the direction the hole goes in).

#### 2. The Drag Loop (Proximity Detection)

When the user clicks and drags the bolt, you don't just move the mesh. On every `mousemove` event (or `requestAnimationFrame`), you calculate the distance between the Bolt's `SnapOrigin` and all visible `TargetOrigins` in the scene.

```typescript
const SNAP_TOLERANCE = 5.0; // Distance in CAD units to trigger the snap

// Inside your drag loop:
let closestHole = null;
let minDistance = Infinity;

for (const hole of sceneHoles) {
  const distance = currentBoltBottom.distanceTo(hole.origin);
  if (distance < SNAP_TOLERANCE && distance < minDistance) {
    minDistance = distance;
    closestHole = hole;
  }
}

```

#### 3. The Snap Execution (Translation + Rotation)

If the bolt enters the `SNAP_TOLERANCE` radius of a hole, you **intercept** the user's mouse coordinates and replace them with the mathematical coordinates of the hole.

* **Translation:** Move the bolt so its `SnapOrigin` perfectly equals the `TargetOrigin`.
* **Rotation:** Use the cross-product and dot-product (or quaternions) to align the Bolt's `SnapAxis` perfectly to the Hole's `TargetAxis`.

```typescript
if (closestHole) {
  // 1. Math perfectly aligns the axes
  const alignQuaternion = new THREE.Quaternion().setFromUnitVectors(bolt.snapAxis, closestHole.targetAxis);
  boltMesh.quaternion.copy(alignQuaternion);

  // 2. Math perfectly aligns the positions
  // We must offset the mesh position based on where the snap origin is relative to the mesh center
  const offset = bolt.snapOriginOffset.clone().applyQuaternion(alignQuaternion);
  boltMesh.position.copy(closestHole.origin).sub(offset);
  
  // Optional: Highlight the hole to give the user visual feedback of the lock
} else {
  // Follow the mouse normally
}

```

### Try the Logic

To help you visualize how the tolerance threshold and the distance calculation feel from a UX perspective, I have built an interactive demonstration of this exact Three.js logic below. Notice how the bolt "breaks free" only when you pull your mouse firmly outside the tolerance radius.

### How to get the Hole Centers from OpenCASCADE

In a real WebCAD, you won't hardcode the hole locations. When the user hovers near a solid in "Assembly Mode", your engine should query the OpenCASCADE B-Rep:

1. Search the solid for `Face`s that are cylindrical (`GeomAbs_Cylinder`).
2. Extract the cylinder's `Location` (which is the center axis) and its top circular boundary (an `Edge` that is a `GeomAbs_Circle`).
3. The center of that circle is your `TargetOrigin`.

--

You hit the nail on the head. Simply snapping two points together is how video games handle inventory items, but it is not how CAD handles mechanical assemblies.

If you only snap the `SnapOrigin` to the `TargetOrigin`, a bolt might snap to the hole but remain completely horizontal, or sit perfectly vertical but hover flush with the top of the hole instead of going inside it.

To fix this, you must introduce **Snap Direction (Axis Alignment)** and **Snap Depth (Penetration)** into your Three.js math pipeline. Here is exactly how professional engines handle both.

### 1. Snap Direction (Fixing the Horizontal Bolt)

Every snap point must have a corresponding **Axis Vector**.

* The Bolt's axis points straight up its shaft (e.g., `[0, 1, 0]`).
* The Hole's axis points straight out of the hole (e.g., `[0, 1, 0]` if on top, or `[1, 0, 0]` if on the side of a box).

When the snap triggers, you use a Quaternion to calculate the exact rotation required to align the bolt's axis to the hole's axis. This guarantees the bolt always faces the correct way, regardless of what angle the hole is drilled at.

### 2. Snap Depth (Sinking into the Hole)

Once the bolt is perfectly aligned and snapped to the hole's opening, you must push it *down* into the hole.
Because the Hole's Axis vector points *out* of the hole, you simply multiply that vector by a negative number (your depth) and add it to the position.

### The Complete Three.js Math Pipeline

Here is the exact code snippet that combines both concepts. When your drag loop detects that the bolt is within the `SNAP_TOLERANCE`, you execute this:

```typescript
function executeAdvancedSnap(boltMesh, boltAxis, holeOrigin, holeAxis, snapDepth) {
  // 1. SNAP DIRECTION (Rotation)
  // Calculate the rotation needed to align the bolt's axis with the hole's axis
  const alignQuat = new THREE.Quaternion().setFromUnitVectors(boltAxis, holeAxis);
  
  // Apply the rotation to the mesh
  boltMesh.quaternion.copy(alignQuat);

  // 2. SNAP DEPTH (Translation)
  // The holeAxis points OUT of the hole. We want to go IN, so we multiply by negative depth.
  const depthVector = holeAxis.clone().multiplyScalar(-snapDepth);

  // 3. FINAL PLACEMENT
  // Start at the hole's opening, then push the bolt down by the depth vector
  const finalPosition = holeOrigin.clone().add(depthVector);
  
  // Apply to mesh
  boltMesh.position.copy(finalPosition);
}

```

### Try the Advanced Snapping Logic

To see exactly why both of these mathematical steps are necessary, try this advanced simulator. I have angled the hole at $45^\circ$ so you can see how the Axis Alignment forces the bolt to rotate, and how the Depth slider pushes it perfectly down that specific angled vector.