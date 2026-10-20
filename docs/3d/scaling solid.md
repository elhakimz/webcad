scaling solid

Your logic for the scaling factor is absolutely correct: a factor of `2.0` doubles the size, while `0.5` cuts it in half.

However, in professional CAD software, asking for just the "scaling factor" is only half the equation. You must also ask the user for a **Base Point** (the anchor).

If you scale a $10 \times 10$ box by a factor of 2, the math engine needs to know: *Does it grow outward from its own center? Or does it grow outward from its bottom-left corner, pushing the rest of the geometry up and to the right?*

Here is an interactive demonstration of exactly why the Base Point is mathematically critical before we look at how to code it into your OpenCASCADE worker.

### The 3-Step Architecture for the "SCALE" Command

In your dual-representation architecture (Three.js + OpenCASCADE), you cannot just use `mesh.scale.set(factor, factor, factor)`. That only changes the visual proxy. You must alter the true B-Rep memory.

Here is the exact pipeline for executing a mathematically perfect scaling operation:

#### 1. The Frontend UI (The UX)

When the user types the "SCALE" command:

1. Prompt: *"Select object to scale."* (User clicks `SOLID_10`).
2. Prompt: *"Specify base point."* (User clicks a corner, or your engine defaults to the object's Bounding Box center).
3. Prompt: *"Specify scale factor."* (User types `1.5`).

While they are typing the factor, you can use Three.js `mesh.scale` and `mesh.position` to show a live ghosted preview. But once they hit Enter, you send the data to the Worker.

#### 2. The OpenCASCADE Math (`OCCWorker.ts`)

Inside your worker, scaling is handled by a **Transformation Matrix** (`gp_Trsf`). You provide the exact 3D coordinate of the Base Point and the uniform scale factor.

```typescript
function scaleShape(oc: any, shape: any, basePt: {x: number, y: number, z: number}, factor: number) {
  // 1. Define the mathematical Base Point
  const centerOfScale = new oc.gp_Pnt_3(basePt.x, basePt.y, basePt.z);

  // 2. Create the Transformation Matrix
  const trsf = new oc.gp_Trsf_1();
  
  // Set the matrix to perform a Uniform Scale anchored at the Base Point
  trsf.SetScale(centerOfScale, factor);

  // 3. Apply the matrix to the B-Rep Shape
  const transformAPI = new oc.BRepBuilderAPI_Transform_2(shape, trsf, true);
  const scaledShape = transformAPI.Shape();

  // Clean up C++ Memory
  centerOfScale.delete();
  trsf.delete();
  transformAPI.delete();

  return scaledShape;
}

```

#### 3. The Data Update

Once the worker returns the new `scaledShape`, you must:

1. Replace the old `brepSnapshot` bytes with the new bytes.
2. Replace the old Three.js geometry with the newly tessellated scaled geometry.
3. Keep the `entityId` the same, so any features in the history tree that reference it are preserved.

### The "Non-Uniform" Trap (Crucial CAD Knowledge)

You will notice the `trsf.SetScale` command only takes a single number (`factor`). It does not take `(X, Y, Z)` factors.

**In OpenCASCADE, you should almost never perform Non-Uniform scaling.** If you scale a shape by `X=1, Y=2, Z=1`, a perfect mathematical cylinder turns into an elliptical tube. A sphere turns into an ellipsoid.

When this happens, OpenCASCADE converts the pristine analytical surfaces (which are fast and exact) into highly complex **B-Spline Surfaces** (NURBS). If you perform boolean cuts on Non-Uniformly scaled objects, the math kernel becomes exponentially slower and is much more likely to crash or produce topological errors.

If a user needs a box to be twice as long in the X-axis, the CAD approach is to **Extrude** it further, or move the face, *not* to scale the whole solid non-uniformly!


---
This is a fantastic architectural question. You are touching on the core difference between **Parametric Direct Editing** and **Feature-Based Modeling**.

If your program can detect whether the selected object is a raw primitive or a complex CSG solid, it should absolutely make a branching decision. Treating them differently is how professional CAD software keeps the math engine fast and the file sizes small.

Here is the decision tree your WebCAD should execute when the user triggers the "SCALE" command.

---

### Decision Path 1: The Object is a Raw Primitive

If the user selects a Box, Cylinder, Sphere, Cone, or Torus that has **not** been modified by any CSG boolean operations, your program should **NOT** use a scaling matrix.

Instead, it should perform a **Parametric Update**.

**The Decision Logic:**

1. Check the entity's history/type. (e.g., `if (entity.type === 'Cylinder' && entity.features.length === 0)`)
2. Multiply the primitive's base parameters by the scale factor.
* *Example:* If factor is `2.0`, update the JSON state from `{ radius: 5, height: 10 }` to `{ radius: 10, height: 20 }`.


3. Send these new parameters to `OCCWorker.ts` to regenerate the primitive from scratch (`BRepPrimAPI_MakeCylinder`).

**Why this is the best approach:**

* **Pristine Math:** Generating a cylinder with a radius of 10 is mathematically cleaner than taking a radius 5 cylinder and applying a math matrix to it.
* **Data Efficiency:** Your JSON file doesn't get cluttered with "Transform" nodes. The object simply updates its definition.
* **UI Consistency:** If the user later opens the "Properties Panel" for that cylinder, they will see the actual new radius (`10mm`), rather than seeing `Radius: 5mm (Scale: 2x)`.

---

### Decision Path 2: The Object is a CSG Solid

If the object is the result of a boolean operation (e.g., a Box that has a cylindrical Hole cut out of it), you cannot easily multiply the base parameters without risking catastrophic failure in the feature tree.

If you scale the CSG solid, your program must use the **Matrix Transformation** approach.

**The Decision Logic:**

1. Check the entity. (`if (entity.features.length > 0)`)
2. Do **not** change the original parameters of the Box or the Cylinder that made the hole.
3. Instead, append a new **"Scale Feature"** to the end of that solid's history tree.
* *JSON State:* `features.push({ type: 'Scale', basePoint: {x:0, y:0, z:0}, factor: 2.0 })`


4. Inside `OCCWorker.ts`, take the final evaluated B-Rep shape of the CSG solid and run it through `gp_Trsf` and `BRepBuilderAPI_Transform` (as we discussed previously).

**Why this is the best approach:**

* **Safety:** Scaling a complex shape using a matrix guarantees that all fillets, chamfers, and cutouts scale proportionally without breaking the topological naming links.
* **History Preservation:** In a parametric CAD system, the user might want to delete the "Scale" step later. By appending it as a distinct Feature node, they can right-click and delete it, and the CSG solid will instantly revert to its original size.

---

### The Edge Case: "Edit Primitive" vs. "Scale Feature"

Because you are building a CAD engine, you have to decide what the user *intended* when they clicked the "SCALE" button.

Imagine a user has a Box. They cut a Hole in it. Later, they realize the *entire* part needs to be 2x bigger.

* **Option A (The Time Traveler):** They edit the base Box to be 2x bigger, and they edit the Cylinder tool to be 2x bigger. The boolean cut recalculates.
* **Option B (The Post-Processor):** They apply a `ScaleFeature` to the final resulting body.

In your architecture, the "SCALE" command should default to **Option B** (applying a Matrix) if they just click the 3D body in the viewport.

However, if they double-click the original "Box" in the left-hand Feature Tree UI, you should show them the property inputs (Width, Height, Depth) and let them perform **Option A**.

By distinguishing between the two, you give users the exact same power and flexibility found in industry-standard software like Fusion 360 and SolidWorks.