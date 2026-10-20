# WebCAD View Commands — Pseudocode

This document covers pseudocode for:

| Command | Purpose                         |
| ------- | ------------------------------- |
| PLAN    | Align view perpendicular to UCS |
| VPOINT  | Set camera/view direction       |
| VIEW    | Save/restore named views        |

Designed for:

* Three.js
* orthographic + perspective cameras
* AutoCAD-like workflows
* future OpenCascade integration

---

# 1. Core Concepts

---

# 1.1 Viewport Structure

```text id="n4u2q4"
VIEWPORT {

    id

    camera

    projectionMode

    target

    position

    upVector

    zoom

    renderMode

    ucs
}
```

---

# 1.2 Camera Types

| Type               | Usage         |
| ------------------ | ------------- |
| OrthographicCamera | drafting      |
| PerspectiveCamera  | visualization |

---

# 1.3 UCS Structure

```text id="9s54ah"
UCS {

    origin

    xAxis

    yAxis

    zAxis
}
```

---

# 2. PLAN Command

---

# Purpose

Align viewport perpendicular to:

* current UCS
* world UCS

Equivalent to AutoCAD PLAN.

---

# Example

```text id="txicvz"
Command: PLAN

Enter option
[Current UCS/World] <Current>:
```

---

# PLAN Workflow

```text id="wjsy9f"
Current UCS
      ↓
Extract UCS Z-axis
      ↓
Position camera
      ↓
Look toward UCS origin
      ↓
Update orthographic view
```

---

# 3. PLAN Command Main Function

```text id="hthxdi"
FUNCTION PLAN_COMMAND(option)

    viewport =
        getActiveViewport()

    IF option == "WORLD"

        ucs =
            worldUCS()

    ELSE

        ucs =
            viewport.ucs

    applyPlanView(
        viewport,
        ucs
    )

    redrawViewport(
        viewport
    )

END FUNCTION
```

---

# 4. Apply PLAN View

---

# Key Idea

Camera looks along:

```text id="x38xby"
negative UCS Z-axis
```

toward:

* UCS origin

---

# Pseudocode

```text id="l3spt0"
FUNCTION applyPlanView(
    viewport,
    ucs
)

    camera =
        viewport.camera

    distance =
        computeViewDistance()

    camera.position =
        ucs.origin +
        (
            ucs.zAxis * distance
        )

    viewport.target =
        ucs.origin

    camera.lookAt(
        ucs.origin
    )

    camera.up =
        ucs.yAxis

    updateCameraProjection(camera)

END FUNCTION
```

---

# 5. PLAN World Example

---

## World UCS

```text id="0jlwm4"
X = (1,0,0)
Y = (0,1,0)
Z = (0,0,1)
```

---

## Result

Camera:

```text id="jlwmn4"
position = (0,0,+distance)
lookAt = (0,0,0)
```

Equivalent:

* TOP view

---

# 6. VPOINT Command

---

# Purpose

Set arbitrary viewing direction.

Equivalent to AutoCAD VPOINT.

---

# Example

```text id="jlwm6m"
Command: VPOINT

Specify viewpoint:
1,1,1
```

Produces:

* isometric view

---

# VPOINT Workflow

```text id="jlwmh8"
Input direction vector
        ↓
Normalize vector
        ↓
Position camera
        ↓
Look at target
        ↓
Update viewport
```

---

# 7. Main VPOINT Command

```text id="jlwmv9"
FUNCTION VPOINT_COMMAND()

    vector =
        getVectorInput()

    viewport =
        getActiveViewport()

    setViewDirection(
        viewport,
        vector
    )

    redrawViewport()

END FUNCTION
```

---

# 8. Set View Direction

---

# Key Idea

Camera sits opposite direction vector.

---

# Pseudocode

```text id="jlwm9u"
FUNCTION setViewDirection(
    viewport,
    direction
)

    camera =
        viewport.camera

    direction =
        normalize(direction)

    target =
        viewport.target

    distance =
        computeViewDistance()

    camera.position =
        target -
        (
            direction * distance
        )

    camera.lookAt(target)

    camera.up =
        computeBestUpVector(
            direction
        )

    updateCameraProjection(camera)

END FUNCTION
```

---

# 9. Isometric View Example

Input:

```text id="jlwm5v"
1,1,1
```

Normalized:

```text id="jlwm2g"
(0.577, 0.577, 0.577)
```

Produces:

* SE Isometric

---

# 10. Preset View Directions

Useful shortcuts.

---

# Standard Views

| View   | Vector   |
| ------ | -------- |
| TOP    | (0,0,1)  |
| BOTTOM | (0,0,-1) |
| FRONT  | (0,-1,0) |
| BACK   | (0,1,0)  |
| LEFT   | (-1,0,0) |
| RIGHT  | (1,0,0)  |
| ISO    | (1,1,1)  |

---

# 11. VIEW Command

---

# Purpose

Manage named views.

Equivalent to AutoCAD VIEW.

---

# Features

| Feature      | Description          |
| ------------ | -------------------- |
| Save View    | current camera state |
| Restore View | restore camera       |
| Delete View  | remove saved view    |
| List Views   | enumerate            |

---

# 12. Named View Structure

```text id="jlwmv5"
NAMED_VIEW {

    name

    cameraPosition

    target

    upVector

    projectionMode

    zoom

    renderMode

    ucs
}
```

---

# 13. VIEW SAVE Command

---

## Example

```text id="jlwm4u"
Command: VIEW

[Save/Restore/Delete/List]

Option: SAVE

View name: ISO1
```

---

# Pseudocode

```text id="jlwmz1"
FUNCTION VIEW_SAVE(name)

    viewport =
        getActiveViewport()

    view =
        createViewSnapshot(
            viewport
        )

    namedViews[name] =
        view

    print("View saved")

END FUNCTION
```

---

# 14. Create View Snapshot

```text id="jlwmq8"
FUNCTION createViewSnapshot(
    viewport
)

    RETURN {

        cameraPosition:
            viewport.camera.position,

        target:
            viewport.target,

        upVector:
            viewport.camera.up,

        projectionMode:
            viewport.projectionMode,

        zoom:
            viewport.zoom,

        renderMode:
            viewport.renderMode,

        ucs:
            clone(viewport.ucs)
    }

END FUNCTION
```

---

# 15. VIEW RESTORE Command

---

## Example

```text id="jlwmw3"
Command: VIEW

Option: RESTORE

View name: ISO1
```

---

# Pseudocode

```text id="jlwmr8"
FUNCTION VIEW_RESTORE(name)

    IF name NOT EXISTS

        print("View not found")
        RETURN

    view =
        namedViews[name]

    viewport =
        getActiveViewport()

    applyNamedView(
        viewport,
        view
    )

    redrawViewport()

END FUNCTION
```

---

# 16. Apply Named View

```text id="jlwm0w"
FUNCTION applyNamedView(
    viewport,
    view
)

    viewport.camera.position =
        view.cameraPosition

    viewport.target =
        view.target

    viewport.camera.up =
        view.upVector

    viewport.projectionMode =
        view.projectionMode

    viewport.zoom =
        view.zoom

    viewport.renderMode =
        view.renderMode

    viewport.ucs =
        clone(view.ucs)

    viewport.camera.lookAt(
        view.target
    )

    updateCameraProjection(
        viewport.camera
    )

END FUNCTION
```

---

# 17. VIEW DELETE Command

```text id="jlwm7w"
FUNCTION VIEW_DELETE(name)

    remove namedViews[name]

END FUNCTION
```

---

# 18. VIEW LIST Command

```text id="jlwmc0"
FUNCTION VIEW_LIST()

    FOR EACH name
        IN namedViews

        print(name)

END FUNCTION
```

---

# 19. Smooth Camera Transition (Optional)

Modern enhancement.

---

# Pseudocode

```text id="jlwm3k"
FUNCTION animateCameraTransition(
    startView,
    endView
)

    interpolatePosition()

    interpolateTarget()

    renderAnimation()

END FUNCTION
```

---

# 20. View Cube Integration (Future)

Commands can integrate with:

* ViewCube
* compass widget
* orientation gizmo

---

# 21. Orthographic Zoom Handling

Important.

In orthographic camera:

```text id="jlwm2s"
camera.zoom
```

controls scale —
NOT camera distance.

---

# 22. Perspective Zoom Handling

Perspective uses:

* FOV
* camera distance

---

# 23. View Frustum Update

Always after modifications:

```text id="jlwm8j"
camera.updateProjectionMatrix()
```

---

# 24. Recommended Internal Architecture

```text id="jlwmv0"
VIEW COMMANDS
        ↓
Viewport Manager
        ↓
Camera Controller
        ↓
Three.js Camera
        ↓
Renderer
```

---

# 25. Recommended MVP Scope

IMPLEMENT FIRST:

✔ PLAN
✔ VPOINT
✔ VIEW SAVE
✔ VIEW RESTORE
✔ TOP/FRONT/LEFT/ISO presets

LATER:

* animated transitions
* multiple named UCS
* view cube
* perspective clipping
* camera bookmarks

---

# 26. Final Recommendation

Your view system should behave like:

```text id="jlwm1n"
AutoCAD R12/R13
+
modern smooth viewport UX
```

Meaning:

* command-driven
* precise engineering views
* orthographic-first
* lightweight
* fast interaction

This fits perfectly with:

* Three.js
* OpenCascade
* browser-based engineering CAD.
