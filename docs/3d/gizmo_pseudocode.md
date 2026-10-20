# Gizmo Pseudocode — Move & Rotate for Solid3D
### Three.js + OrthographicCamera (WebCAD)

---

## Architecture Overview

```
GizmoManager            ← orchestrator: owns state, wires events
  ├── GizmoRenderer     ← builds and updates the THREE.Group in scene
  └── GizmoController   ← hit-test, drag math, applies transform to target
```

Three.js scene has two layers:
- **Layer 0** — world objects (Solid3D meshes)
- **Layer 1** — gizmo handles (never occluded by world, depthTest = false)

---

## 1. GizmoRenderer — Build the visual handles

```
CLASS GizmoRenderer:

  CONSTANTS:
    AXIS_LENGTH     = 80          // in world units at zoom=1
    ARROW_HEAD_LEN  = 16
    ARROW_HEAD_RAD  = 5
    SHAFT_RAD       = 2
    RING_RADIUS     = 55          // rotation ring radius
    RING_TUBE_RAD   = 2
    RING_SEGMENTS   = 64
    HANDLE_OPACITY  = 0.85
    HIGHLIGHT_COLOR = 0xffff00

  COLORS:
    X_COLOR = 0xff2222   // red
    Y_COLOR = 0x22cc22   // green
    Z_COLOR = 0x2266ff   // blue
    CENTER_COLOR = 0xffffff

  MEMBERS:
    root:         THREE.Group      // added to scene once
    translateGroup: THREE.Group
    rotateGroup:  THREE.Group

    // Translate handles (arrow cone + shaft cylinder per axis)
    xArrow, yArrow, zArrow: THREE.Group
    // Rotate handles (torus per axis)
    xRing, yRing, zRing:    THREE.Mesh
    // Center cube (free-move on camera plane)
    centerHandle:           THREE.Mesh

    // Map mesh.uuid → handle descriptor (used in GizmoController)
    handleMap: Map<uuid, HandleDescriptor>


  FUNCTION build():
    root = new THREE.Group()
    root.renderOrder = 999             // always draw on top
    root.layers.set(1)

    translateGroup = new THREE.Group()
    rotateGroup    = new THREE.Group()
    root.add(translateGroup, rotateGroup)

    buildTranslateAxis('X', new Vector3(1,0,0), X_COLOR)
    buildTranslateAxis('Y', new Vector3(0,1,0), Y_COLOR)
    buildTranslateAxis('Z', new Vector3(0,0,1), Z_COLOR)

    buildRotateRing('X', new Vector3(1,0,0), X_COLOR)
    buildRotateRing('Y', new Vector3(0,1,0), Y_COLOR)
    buildRotateRing('Z', new Vector3(0,0,1), Z_COLOR)

    buildCenterHandle()

    RETURN root


  FUNCTION buildTranslateAxis(name, dir: Vector3, color):
    group = new THREE.Group()

    // Shaft: thin cylinder along +dir
    shaftGeo = new CylinderGeometry(SHAFT_RAD, SHAFT_RAD, AXIS_LENGTH, 8)
    shaftGeo.rotateToAlignWithY(dir)       // CylinderGeometry is along Y by default
    shaftGeo.translate(dir * AXIS_LENGTH/2)
    shaft = new THREE.Mesh(shaftGeo, buildMaterial(color))
    shaft.userData = { handle: 'translate', axis: name, part: 'shaft' }
    shaft.raycast = customRaycast       // slightly enlarged hit zone

    // Cone arrowhead at tip
    coneGeo = new ConeGeometry(ARROW_HEAD_RAD, ARROW_HEAD_LEN, 12)
    coneGeo.rotateToAlignWithY(dir)
    coneGeo.translate(dir * (AXIS_LENGTH + ARROW_HEAD_LEN/2))
    cone = new THREE.Mesh(coneGeo, buildMaterial(color))
    cone.userData = { handle: 'translate', axis: name, part: 'cone' }

    group.add(shaft, cone)
    translateGroup.add(group)

    handleMap.set(shaft.uuid, { type:'translate', axis:name, dir })
    handleMap.set(cone.uuid,  { type:'translate', axis:name, dir })

    IF name == 'X': xArrow = group
    IF name == 'Y': yArrow = group
    IF name == 'Z': zArrow = group


  FUNCTION buildRotateRing(name, normal: Vector3, color):
    // TorusGeometry lies in XY plane by default — rotate to face the right normal
    torusGeo = new TorusGeometry(RING_RADIUS, RING_TUBE_RAD, 8, RING_SEGMENTS)

    IF name == 'X': torusGeo.rotateZ(Math.PI/2)   // normal → X
    IF name == 'Y': // no rotation needed           // normal → Y (default XZ)
      torusGeo.rotateX(Math.PI/2)
    IF name == 'Z': // no rotation needed           // normal → Z (XY plane)

    ring = new THREE.Mesh(torusGeo, buildMaterial(color))
    ring.userData = { handle: 'rotate', axis: name, normal }
    ring.renderOrder = 999

    rotateGroup.add(ring)
    handleMap.set(ring.uuid, { type:'rotate', axis:name, normal })

    IF name == 'X': xRing = ring
    IF name == 'Y': yRing = ring
    IF name == 'Z': zRing = ring


  FUNCTION buildCenterHandle():
    geo = new BoxGeometry(10, 10, 10)
    centerHandle = new THREE.Mesh(geo, buildMaterial(CENTER_COLOR))
    centerHandle.userData = { handle: 'translate', axis: 'VIEW' }
    translateGroup.add(centerHandle)
    handleMap.set(centerHandle.uuid, { type:'translate', axis:'VIEW' })


  FUNCTION buildMaterial(color):
    mat = new THREE.MeshBasicMaterial({
      color,
      depthTest:  false,    // always visible through objects
      depthWrite: false,
      transparent: true,
      opacity: HANDLE_OPACITY,
      toneMapped: false
    })
    RETURN mat


  FUNCTION highlight(handleUUID, active: bool):
    mesh = findMeshByUUID(handleUUID)
    IF active:
      mesh.material.color.setHex(HIGHLIGHT_COLOR)
      mesh.material.opacity = 1.0
    ELSE:
      descriptor = handleMap.get(handleUUID)
      mesh.material.color.setHex(originalColor(descriptor.axis))
      mesh.material.opacity = HANDLE_OPACITY


  // Called every frame from GizmoManager.update()
  FUNCTION updateTransform(targetPosition: Vector3, camera: OrthographicCamera):
    root.position.copy(targetPosition)

    // Keep gizmo constant screen size regardless of zoom
    scale = GIZMO_BASE_SIZE / camera.zoom
    root.scale.setScalar(scale)

    // Always face rings toward camera (billboard the rotation gizmo group)
    // — Each ring normal stays fixed, but we compensate if camera is orthographic
    // by slightly fading rings whose normal is nearly parallel to view direction
    cameraDir = camera.position.clone().sub(camera.target).normalize()
    FOR each ring IN [xRing, yRing, zRing]:
      dot = abs(ring.userData.normal.dot(cameraDir))
      ring.material.opacity = lerp(0.85, 0.15, dot)  // fade face-on rings
```

---

## 2. GizmoController — Hit-test & drag math

```
CLASS GizmoController:

  MEMBERS:
    raycaster:        THREE.Raycaster
    activeHandle:     HandleDescriptor | null
    hoveredHandle:    HandleDescriptor | null

    dragStartMouse:   Vector2           // NDC at drag start
    dragStartPos:     Vector3           // target world position at drag start
    dragStartQuat:    Quaternion        // target world quaternion at drag start

    dragPlaneNormal:  Vector3           // world-space normal of the drag plane
    dragPlaneOrigin:  Vector3           // world-space point on drag plane
    dragStartHitPt:   Vector3           // world-space hit point at drag start

    axisStartAngle:   number            // angle of hit point from center at drag start


  // ── Hit test ────────────────────────────────────────────────────────────────

  FUNCTION hitTestGizmo(mouseNDC: Vector2, camera, handleMap, gizmoMeshes[]):
    raycaster.setFromCamera(mouseNDC, camera)
    hits = raycaster.intersectObjects(gizmoMeshes, recursive=false)

    IF hits.length == 0: RETURN null
    RETURN handleMap.get(hits[0].object.uuid)   // closest hit


  // ── Drag Start ──────────────────────────────────────────────────────────────

  FUNCTION onDragStart(mouseNDC, camera, target: THREE.Object3D, handle: HandleDescriptor):
    activeHandle     = handle
    dragStartMouse   = mouseNDC.clone()
    dragStartPos     = target.position.clone()
    dragStartQuat    = target.quaternion.clone()

    IF handle.type == 'translate':
      setupTranslateDragPlane(camera, handle, target.position)
      dragStartHitPt = raycastOntoPlane(mouseNDC, camera)

    ELSE IF handle.type == 'rotate':
      setupRotateDragPlane(handle, target.position)
      hitPt = raycastOntoPlane(mouseNDC, camera)
      dragStartHitPt = hitPt
      // Store initial angle: atan2 of hit projected onto rotation plane
      localHit = hitPt.clone().sub(target.position)
      axisStartAngle = computeAngleOnPlane(localHit, handle.normal)


  FUNCTION setupTranslateDragPlane(camera, handle, originPt):
    dragPlaneOrigin = originPt.clone()

    IF handle.axis == 'VIEW':
      // Free-move: plane faces the camera
      dragPlaneNormal = camera.position.clone().sub(camera.target).normalize()

    ELSE:
      // Axis-constrained: choose the plane whose normal is most perpendicular
      // to the camera direction (best for picking accuracy)
      axisDir = directionForAxis(handle.axis)       // (1,0,0) / (0,1,0) / (0,0,1)
      cameraDir = camera.position.clone().normalize()

      // Pick between the two planes containing the axis
      // Use whichever has the larger |dot(planeNormal, cameraDir)|
      candidate1 = perpendicular(axisDir, Vector3.UP)
      candidate2 = perpendicular(axisDir, candidate1)
      IF abs(candidate1.dot(cameraDir)) > abs(candidate2.dot(cameraDir)):
        dragPlaneNormal = candidate1
      ELSE:
        dragPlaneNormal = candidate2


  FUNCTION setupRotateDragPlane(handle, originPt):
    dragPlaneOrigin = originPt.clone()
    dragPlaneNormal = directionForAxis(handle.axis)   // ring normal IS the rotation axis


  // ── Drag Move ───────────────────────────────────────────────────────────────

  FUNCTION onDragMove(mouseNDC, camera, target: THREE.Object3D):
    IF activeHandle == null: RETURN

    currentHitPt = raycastOntoPlane(mouseNDC, camera)
    IF currentHitPt == null: RETURN

    IF activeHandle.type == 'translate':
      applyTranslate(currentHitPt, target)

    ELSE IF activeHandle.type == 'rotate':
      applyRotate(currentHitPt, target)


  FUNCTION applyTranslate(currentHitPt, target):
    delta = currentHitPt.clone().sub(dragStartHitPt)  // full 3D world delta

    IF activeHandle.axis == 'VIEW':
      // Free camera-plane move: apply full delta
      target.position.copy(dragStartPos).add(delta)

    ELSE:
      // Project delta onto the constrained axis
      axisDir = directionForAxis(activeHandle.axis)
      projectedLength = delta.dot(axisDir)
      target.position.copy(dragStartPos).addScaledVector(axisDir, projectedLength)


  FUNCTION applyRotate(currentHitPt, target):
    rotAxis = directionForAxis(activeHandle.axis)  // e.g. (0,0,1) for Z

    // Compute signed angle between start hit and current hit, both relative to
    // the gizmo origin, projected onto the rotation plane
    localStart   = dragStartHitPt.clone().sub(dragStartPos)
    localCurrent = currentHitPt.clone().sub(dragStartPos)

    angleCurrent = computeAngleOnPlane(localCurrent, rotAxis)
    angleDelta   = angleCurrent - axisStartAngle

    // Wrap delta to [-π, π] to avoid flip at ±180°
    WHILE angleDelta >  PI: angleDelta -= 2*PI
    WHILE angleDelta < -PI: angleDelta += 2*PI

    // Apply incremental rotation on top of the stored start quaternion
    rotQuat = new THREE.Quaternion().setFromAxisAngle(rotAxis, angleDelta)
    target.quaternion.copy(dragStartQuat).premultiply(rotQuat)


  // ── Drag End ─────────────────────────────────────────────────────────────────

  FUNCTION onDragEnd(target, commandHistory):
    IF activeHandle == null: RETURN

    // Record undo snapshot
    IF activeHandle.type == 'translate':
      commandHistory.push(new TranslateUndoEntry(
        target.id,
        dragStartPos,
        target.position.clone()
      ))
    ELSE:
      commandHistory.push(new RotateUndoEntry(
        target.id,
        dragStartQuat,
        target.quaternion.clone()
      ))

    activeHandle = null


  // ── Plane raycast helper ─────────────────────────────────────────────────────

  FUNCTION raycastOntoPlane(mouseNDC, camera) -> Vector3 | null:
    raycaster.setFromCamera(mouseNDC, camera)
    ray   = raycaster.ray
    plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
              dragPlaneNormal, dragPlaneOrigin)
    target = new THREE.Vector3()
    hit    = ray.intersectPlane(plane, target)
    RETURN hit   // null if ray is parallel to plane


  // ── Angle helper ─────────────────────────────────────────────────────────────

  FUNCTION computeAngleOnPlane(vec: Vector3, planeNormal: Vector3) -> number:
    // Project vec onto the plane perpendicular to planeNormal,
    // then return atan2 of the projected components.
    u = arbitraryPerp(planeNormal)           // any vector ⊥ normal
    v = planeNormal.cross(u).normalize()     // second tangent
    RETURN atan2(vec.dot(v), vec.dot(u))


  FUNCTION directionForAxis(axis: string) -> Vector3:
    IF axis == 'X': RETURN new Vector3(1,0,0)
    IF axis == 'Y': RETURN new Vector3(0,1,0)
    IF axis == 'Z': RETURN new Vector3(0,0,1)
```

---

## 3. GizmoManager — Wire events into Viewer

```
CLASS GizmoManager:

  MEMBERS:
    renderer:     GizmoRenderer
    controller:   GizmoController
    viewer:       Viewer                // existing Viewer instance

    targetObject: THREE.Object3D | null
    isDragging:   bool = false
    isHovering:   bool = false

    gizmoMeshes:  THREE.Mesh[]         // flat list of all pickable handles


  FUNCTION init(viewer):
    this.viewer = viewer
    renderer = new GizmoRenderer()
    controller = new GizmoController()

    root = renderer.build()
    viewer.scene.add(root)
    root.visible = false

    // Collect all gizmo meshes for raycasting
    root.traverse(child =>
      IF child IS THREE.Mesh: gizmoMeshes.push(child))

    // Hook into the viewer's canvas events (before existing handlers)
    canvas = viewer.canvas
    canvas.addEventListener('pointermove', onPointerMove, { capture: true })
    canvas.addEventListener('pointerdown', onPointerDown, { capture: true })
    canvas.addEventListener('pointerup',   onPointerUp,   { capture: true })

    // Start render loop update
    viewer.onBeforeRender.add(update)   // or hook into requestAnimationFrame


  // ── Attach / Detach ─────────────────────────────────────────────────────────

  FUNCTION attachToObject(obj: THREE.Object3D):
    targetObject = obj
    root.visible = true
    snapGizmoToObject()

  FUNCTION detach():
    targetObject = null
    root.visible = false
    controller.activeHandle = null


  FUNCTION snapGizmoToObject():
    IF targetObject == null: RETURN
    // Position gizmo at object bounding-box center
    bbox = new THREE.Box3().setFromObject(targetObject)
    center = bbox.getCenter(new THREE.Vector3())
    renderer.root.position.copy(center)

    // Gizmo axes stay world-aligned (no inherit of object rotation).
    // If you want local-space gizmo, do:
    //   renderer.root.quaternion.copy(targetObject.quaternion)


  // ── Per-frame update ─────────────────────────────────────────────────────────

  FUNCTION update():
    IF targetObject == null: RETURN
    IF NOT isDragging:
      snapGizmoToObject()      // keep gizmo centred if object moved externally
    renderer.updateTransform(renderer.root.position, viewer.camera)
    viewer.scheduleRender()


  // ── Pointer events ────────────────────────────────────────────────────────────

  FUNCTION onPointerMove(e: PointerEvent):
    IF targetObject == null: RETURN

    ndc = viewer.getNormalizedDeviceCoordinates(e.clientX, e.clientY)

    IF isDragging:
      controller.onDragMove(ndc, viewer.camera, targetObject)
      viewer.scheduleRender()
      e.stopPropagation()      // suppress camera orbit/pan while dragging gizmo
      RETURN

    // Hover highlight
    hit = controller.hitTestGizmo(ndc, viewer.camera, renderer.handleMap, gizmoMeshes)
    IF hit != null:
      IF hoveredHandle != hit:
        IF hoveredHandle: renderer.highlight(hoveredHandle.uuid, false)
        renderer.highlight(hit.uuid, true)
        hoveredHandle = hit
        viewer.canvas.style.cursor = 'grab'
      e.stopPropagation()       // don't change cursor to crosshair
    ELSE:
      IF hoveredHandle:
        renderer.highlight(hoveredHandle.uuid, false)
        hoveredHandle = null
        viewer.canvas.style.cursor = ''


  FUNCTION onPointerDown(e: PointerEvent):
    IF targetObject == null OR e.button != 0: RETURN

    ndc = viewer.getNormalizedDeviceCoordinates(e.clientX, e.clientY)
    hit = controller.hitTestGizmo(ndc, viewer.camera, renderer.handleMap, gizmoMeshes)

    IF hit == null: RETURN

    isDragging = true
    viewer.canvas.style.cursor = 'grabbing'
    viewer.canvas.setPointerCapture(e.pointerId)

    controller.onDragStart(ndc, viewer.camera, targetObject, hit)

    e.stopPropagation()         // prevent Viewer's own pointerdown (pan/orbit)
    e.preventDefault()


  FUNCTION onPointerUp(e: PointerEvent):
    IF NOT isDragging: RETURN

    isDragging = false
    viewer.canvas.style.cursor = hoveredHandle ? 'grab' : ''
    viewer.canvas.releasePointerCapture(e.pointerId)

    controller.onDragEnd(targetObject, commandHistory)

    // Sync model data back to document entity
    syncTransformToEntity(targetObject)

    e.stopPropagation()


  // ── Sync transform back to document ─────────────────────────────────────────

  FUNCTION syncTransformToEntity(obj: THREE.Object3D):
    entity = document.findEntityById(obj.name)
    IF entity == null: RETURN

    entity.position = { x: obj.position.x, y: obj.position.y, z: obj.position.z }
    entity.rotation = quaternionToEuler(obj.quaternion)   // or store quat directly
    document.markDirty(entity.id)
```

---

## 4. Integration in Viewer / App — Selection triggers gizmo

```
// In app.ts / Viewer.ts — where object selection is handled:

FUNCTION onObjectClicked(e: PointerEvent):
  ndc  = viewer.getNormalizedDeviceCoordinates(e.clientX, e.clientY)
  raycaster.setFromCamera(ndc, viewer.camera)

  // Only test world objects (layer 0), NOT gizmo (layer 1)
  hits = raycaster.intersectObjects(worldObjects, recursive=true)

  IF hits.length > 0:
    obj = hits[0].object
    IF obj.userData.type == 'Solid3D':
      gizmoManager.attachToObject(obj)
      selectedEntity = obj
  ELSE:
    // Click on empty space → deselect
    gizmoManager.detach()
    selectedEntity = null
```

---

## 5. Data flow diagram

```
User clicks solid                  User grabs translate arrow
        │                                   │
  onObjectClicked()            onPointerDown (captured before Viewer)
        │                                   │
  gizmoManager.attachToObject()    hitTestGizmo() → HandleDescriptor{type:'translate', axis:'X'}
        │                                   │
  root.visible = true              controller.onDragStart()
  snapGizmoToObject()                ├── setupTranslateDragPlane()
        │                            └── record dragStartPos, dragStartHitPt
  renderer.updateTransform()                 │
        │                          onPointerMove (each frame)
  scene renders:                     ├── raycastOntoPlane() → currentHitPt
  ┌────────────┐                     ├── delta = currentHitPt − dragStartHitPt
  │  Solid3D   │                     ├── project delta onto axis X direction
  │ ┌────────┐ │                     └── target.position = dragStartPos + projectedDelta
  │ │ Gizmo  │ │                                 │
  │ │ ╠═══X  │ │                        scene re-renders each pointer move
  │ │ ╠═══Y  │ │                                 │
  │ │ ╠═══Z  │ │                       onPointerUp
  │ │  ○ ○ ○ │ │                         ├── controller.onDragEnd() → push undo entry
  │ └────────┘ │                         └── syncTransformToEntity() → doc.markDirty()
  └────────────┘
```

---

## 6. Key constants & tuning

```
GIZMO_BASE_SIZE   = 120     // screen px equivalent of gizmo radius at zoom=1
HIT_EXPAND_RADIUS = 8       // extra px around thin shafts for easier picking
SNAP_ANGLE_DEG    = 15      // optional: snap rotation to multiples of 15°
SNAP_TRANSLATE    = 0       // optional: snap translation to grid (0 = off)

// Torus orientation corrections (Three.js TorusGeometry default = XY plane, normal = Z):
X_RING_ROTATION = Euler(0, PI/2, 0)    // normal → X
Y_RING_ROTATION = Euler(PI/2, 0, 0)    // normal → Y
Z_RING_ROTATION = Euler(0, 0, 0)       // normal → Z (default)
```
