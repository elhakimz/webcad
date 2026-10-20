ui fixes and else

Looking at your Three.js frontend code, you have implemented a fantastic on-demand rendering loop in `Viewer.ts` (`scheduleRender` / `renderRequested`). This is a pro-tier architectural choice that saves battery life and keeps the laptop fans quiet when the user isn't actively interacting.

However, the "Death by a Thousand Cuts" memory leak has crept into your UI rendering layer. Your `CursorRenderer.ts` and `GridRenderer.ts` are actively fighting against your 60fps goal.

Here are the critical WebGL bottlenecks in your UI code and how to eliminate them.

### 1. The Mouse-Move Memory Leak (`CursorRenderer.ts`)

Inside `CursorRenderer.ts`, your `setCursorHover` method is a performance trap. You are doing this every time the mouse moves over a new object:

```typescript
// From your code:
while (this.hoverGroup.children.length > 0) {
  // ... remove, geometry.dispose(), material.dispose()
}
const mat = new THREE.LineBasicMaterial({ ... });
const leftGeo = new THREE.BufferGeometry().setFromPoints([...]);
const leftLine = new THREE.Line(leftGeo, mat);
this.hoverGroup.add(leftLine);

```

In Three.js, calling `new THREE.BufferGeometry()`, `new Material()`, and `scene.add()` are incredibly expensive. They force Three.js to allocate new memory, compile new WebGL shader programs (sometimes), and upload new buffers to the GPU. Doing this in a `mousemove` or hover-state loop will cause massive micro-stutters.

**The Fix: The Object Pool Pattern**
Never create or destroy objects in a render or mouse loop. Create your hover cursor exactly *once* in the constructor, and then simply move it and toggle its visibility.

```typescript
// Better CursorRenderer.ts Architecture
export class CursorRenderer {
  // ...
  private hoverMeshLeft: THREE.Line;
  private hoverMeshRight: THREE.Line;

  constructor(scene: THREE.Scene, camera: THREE.OrthographicCamera) {
    // ...
    // 1. Pre-allocate the hover materials and geometry ONCE
    const color = 0x00FFFF;
    const mat = new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
    
    // Create dummy geometry, we will update the scale/position later
    const leftGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-1, 1, 0), new THREE.Vector3(0, 0, 0), new THREE.Vector3(-1, -1, 0)
    ]);
    this.hoverMeshLeft = new THREE.Line(leftGeo, mat);
    this.hoverMeshLeft.visible = false; // Hide it initially

    // ... repeat for right geo ...
    
    this.hoverGroup.add(this.hoverMeshLeft);
    // ...
  }

  setCursorHover(isHovering: boolean, targetPosition?: THREE.Vector3) {
    this.hoverMeshLeft.visible = isHovering;
    // this.hoverMeshRight.visible = isHovering;

    if (isHovering && targetPosition) {
      // 2. Just update position and scale dynamically! No allocations.
      const size = 5 / this.camera.zoom;
      this.hoverMeshLeft.position.copy(targetPosition);
      this.hoverMeshLeft.scale.set(size, size, size);
    }
  }
}

```

### 2. The Grid Rebuild Trap (`GridRenderer.ts`)

You have the exact same issue in `GridRenderer.ts`. Every time the camera pans (which triggers `updateGrid`), you are destroying the entire grid and rebuilding it:

```typescript
// From your code:
while (this.gridGroup.children.length > 0) {
  // ... remove, dispose
}
const grid = new THREE.GridHelper(size, divisions, 0x777777, 0x444444);

```

Rebuilding a `GridHelper` with hundreds of lines forces a massive WebGL buffer upload on every single pan frame.

**The Fix: The Infinite Grid Illusion**
Instead of destroying and rebuilding the grid to follow the camera, you create a single `GridHelper` once. When the camera pans, you move the grid's `position.x` and `position.y` to snap to the nearest grid increment. This creates the illusion of an infinite grid without ever changing the underlying geometry.

```typescript
// Better GridRenderer.ts
export class GridRenderer {
  private gridMesh: THREE.GridHelper;
  private currentSpacing: number = 0;

  constructor(scene: THREE.Scene) {
    // ...
    // Pre-allocate a massive grid ONCE
    this.gridMesh = new THREE.GridHelper(10000, 1000, 0x777777, 0x444444);
    this.gridMesh.rotation.x = Math.PI / 2; // Assuming Z-up or Y-up CAD coordinates
    this.gridGroup.add(this.gridMesh);
  }

  updateGrid(spacing: number, enabled: boolean, cameraPosition: THREE.Vector3) {
    this.gridGroup.visible = enabled;
    if (!enabled) return;

    // If spacing changes, we DO have to rebuild or scale, 
    // but if it's just a pan, we just move it.
    if (this.currentSpacing !== spacing) {
      // Rebuild logic here (only happens on zoom-level changes)
      this.currentSpacing = spacing;
    }

    // The Magic Trick: Snap the grid position to the camera position
    // modulo the spacing. The grid physically slides underneath the camera
    // in lockstep with the pan, creating a perfect infinite illusion.
    const offsetX = cameraPosition.x % spacing;
    const offsetY = cameraPosition.y % spacing;
    
    // Only update position coordinates! Zero GPU upload overhead.
    this.gridMesh.position.set(
      cameraPosition.x - offsetX, 
      cameraPosition.y - offsetY, 
      0
    );
  }
}

```

### 3. A Note on `GizmoRenderer.ts`

Your `GizmoRenderer` is actually quite well structured. You are correctly updating the `.position`, `.scale`, and `.rotation` of existing meshes in `updateTransform` rather than rebuilding the arrows.

The only minor tweak is to ensure that the materials used for the Gizmo handles (`X_COLOR`, `Y_COLOR`) are instantiated once and shared across all meshes, rather than creating a `new THREE.MeshBasicMaterial` for every single arrow shaft and arrow head.

Apply these object-pooling patterns to your UI, and your frontend will match the zero-allocation speed of your math engine.