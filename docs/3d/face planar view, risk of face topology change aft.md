face planar view, risk of face topology change after ops

You have just identified the exact reasons why the **Topological Naming Problem** causes professional CAD engines to crash, throw errors, or rebuild models incorrectly.

When a boolean operation (like a cut, fuse, or fillet) alters the topology of a solid, OpenCASCADE throws away the old mathematical B-Rep and generates a completely new one.

If you are tracking references (like a Sketch attached to a Face), here are the four specific edge-cases you must anticipate in your WebCAD architecture, and exactly how your engine should handle them.

---

### 1. The "Slot Cut" (Face Splitting)

**What happens:** You have a Sketch attached to `Face A`. A user goes back in the history tree and cuts a channel straight through the middle of `Face A`. When the B-Rep rebuilds, `Face A` has been split into two entirely separate faces: `Face A1` (left) and `Face A2` (right).
**What to anticipate:** Your "Geometric Signature" heuristic will find *two* faces that perfectly match the surface type and normal vector. Which one does the sketch attach to?
**The Architectural Fix:**
In your signature-matching logic, when multiple faces match the normal vector, calculate the 3D distance from the Sketch's original **Anchor Point** (the exact `x,y,z` where the user first clicked to create the sketch) to the center of the new faces. The sketch must attach to the face that is physically closest to its original anchor.

### 2. The "Machined Away" Face (Total Annihilation)

**What happens:** The user sketches a circle on a face, extrudes it, and then goes back in the timeline and completely deletes or cuts away the entire face they sketched on.
**What to anticipate:** Your solver will search the new B-Rep and find zero faces matching the signature. If unhandled, your WebWorker will crash, the promise will reject, and the entire app will freeze.
**The Architectural Fix: The "Dangling Reference"**
Professional CAD handles this through UI/UX. When the solver returns `null` for a face search:

1. **Halt the Rebuild:** Do not attempt to extrude the missing sketch. Stop the feature tree execution at that step.
2. **Flag the Error:** Mark the Sketch feature in your UI tree with a yellow warning triangle ⚠️ ("Missing Face Reference").
3. **Ghost the Sketch:** Render the sketch lines in red or grey in the 3D viewport at their last known absolute 3D position.
4. **Prompt the User:** Allow the user to right-click the sketch and select "Redefine Sketch Plane", where they can click a new face to repair the broken topological link.

### 3. The "Silent Flip" (UV Parametric Shift)

**What happens:** The face survives the boolean operation, and your signature finds it perfectly. However, because the face's boundaries changed, OpenCASCADE recalculates the underlying NURBS mathematical surface.
**What to anticipate:** The face's Normal (Z-axis) is correct, but OpenCASCADE might have rotated the implicit U/V directions (the X and Y axes) by 90 degrees or flipped them. Your UCS Matrix inherits this flip. **The sketch will suddenly rotate 90 degrees or mirror itself** on the face, causing all subsequent cuts to be in the wrong place!
**The Architectural Fix:**
Your `TopologicalReference` signature must store more than just the Face Normal. It must store a **Reference X-Axis**.
When creating the sketch, pick a vertex on the face and save the vector pointing from the face center to that vertex. After a rebuild, use that vector to lock the rotation of your UCS matrix, guaranteeing the sketch never spins.

### 4. Co-planar Merging (Fuzzy Booleans)

**What happens:** A user draws two cubes touching side-by-side and fuses them. The two top faces are perfectly flush.
**What to anticipate:** OpenCASCADE's `BRepAlgoAPI_Fuse` might leave a seam line between them, or it might optimize them into one massive, continuous top face. If a sketch was attached to the left cube's top face, the Center of Mass and Area of the new merged face will be wildly different than what the signature expects.
**The Architectural Fix:**
When matching the Geometric Signature, you must enforce a **Tolerance Hierarchy**.

1. **Strict Match:** Normal matches AND Area matches within 5%.
2. **Loose Match:** Normal matches, Area is different, but the Sketch's Anchor Point mathematically intersects the infinite plane of the new face.
By falling back to a "Loose Match," your sketch will survive even if the face it lives on suddenly doubles in size due to a fuse operation.

### Summary Checklist for your `OCCWorker.ts`

When building your `findFaceBySignature` function, implement it in this order:

1. Try to find the exact face by `faceIndex` (Fastest, works 60% of the time).
2. If Normal or Area doesn't match, search all faces for a Normal match + Area match (Handles index shuffling).
3. If still not found, search all faces for a Normal match + Anchor Point intersection (Handles face merging/splitting).
4. If still not found, throw a `DanglingReferenceException` back to the frontend to highlight the UI red.