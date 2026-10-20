Here’s a **clean Markdown spec + pseudocode** for implementing **AutoCAD 2.x–style `LAYER` commands** in your **WebCAD (Three.js)** system.

I’ll keep it faithful to classic behavior but adapted to a modern architecture.

---

# 📄 WebCAD Command Reference (AutoCAD 2.x Style)

## Command: `LAYER`

---

# 🧩 Overview

## 📌 Description

Manages drawing layers, including:

* Create / delete layers
* Set current layer
* Toggle visibility (ON/OFF)
* Freeze / thaw
* Lock / unlock
* Assign color & linetype

---

# 🧠 Concept Model

```text
Layer = logical container for entities + display properties
```

---

# 📦 Internal Data Structures

```pseudo
Layer {
  name: string
  color: Color
  linetype: string
  isVisible: boolean
  isFrozen: boolean
  isLocked: boolean
}

LayerManager {
  layers: Map<string, Layer>
  currentLayer: string
}
```

---

# 🎯 Command Syntax (AutoCAD 2.x style)

```text
LAYER
  ?        → List layers
  N name   → New layer
  S name   → Set current layer
  ON name  → Turn on
  OFF name → Turn off
  F name   → Freeze
  T name   → Thaw
  L name   → Lock
  U name   → Unlock
  C color name → Set color
  LT linetype name → Set linetype
  D name   → Delete
```

---

# 🧪 Main Command Dispatcher

```pseudo
COMMAND LAYER:

  PROMPT "Enter layer option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:"
  option ← USER_INPUT()

  SWITCH option:

    CASE "?":
        listLayers()

    CASE "N":
        createLayer()

    CASE "S":
        setCurrentLayer()

    CASE "ON":
        setLayerVisibility(TRUE)

    CASE "OFF":
        setLayerVisibility(FALSE)

    CASE "F":
        freezeLayer()

    CASE "T":
        thawLayer()

    CASE "L":
        lockLayer()

    CASE "U":
        unlockLayer()

    CASE "C":
        setLayerColor()

    CASE "LT":
        setLayerLinetype()

    CASE "D":
        deleteLayer()

    DEFAULT:
        ERROR "Invalid option"
```

---

# 🧱 Core Operations

---

## 📋 List Layers

```pseudo
FUNCTION listLayers():

  FOR EACH layer IN LayerManager.layers:

      PRINT layer.name,
            layer.color,
            layer.linetype,
            layer.isVisible,
            layer.isFrozen,
            layer.isLocked,
            (layer.name == currentLayer ? "<CURRENT>" : "")
```

---

## ➕ Create Layer

```pseudo
FUNCTION createLayer():

  PROMPT "Enter new layer name:"
  name ← USER_INPUT()

  IF LayerManager.layers.contains(name):
      ERROR "Layer already exists"
      RETURN

  layer ← NEW Layer(
      name = name,
      color = DEFAULT_COLOR,
      linetype = "CONTINUOUS",
      isVisible = TRUE,
      isFrozen = FALSE,
      isLocked = FALSE
  )

  LayerManager.layers[name] ← layer
```

---

## 🎯 Set Current Layer

```pseudo
FUNCTION setCurrentLayer():

  PROMPT "Enter layer name:"
  name ← USER_INPUT()

  IF NOT LayerManager.layers.contains(name):
      ERROR "Layer not found"
      RETURN

  layer ← LayerManager.layers[name]

  IF layer.isFrozen:
      ERROR "Cannot set frozen layer current"
      RETURN

  LayerManager.currentLayer ← name
```

---

## 👁️ Visibility (ON/OFF)

```pseudo
FUNCTION setLayerVisibility(state):

  PROMPT "Enter layer name:"
  name ← USER_INPUT()

  layer ← GET_LAYER(name)

  layer.isVisible ← state

  UPDATE_LAYER_RENDERING(layer)
```

---

## ❄️ Freeze / Thaw

```pseudo
FUNCTION freezeLayer():

  name ← PROMPT_LAYER()

  layer ← GET_LAYER(name)

  layer.isFrozen ← TRUE

  HIDE_ALL_ENTITIES(layer)
```

```pseudo
FUNCTION thawLayer():

  name ← PROMPT_LAYER()

  layer ← GET_LAYER(name)

  layer.isFrozen ← FALSE

  SHOW_ALL_ENTITIES(layer)
```

---

## 🔒 Lock / Unlock

```pseudo
FUNCTION lockLayer():

  name ← PROMPT_LAYER()

  layer ← GET_LAYER(name)

  layer.isLocked ← TRUE
```

```pseudo
FUNCTION unlockLayer():

  name ← PROMPT_LAYER()

  layer ← GET_LAYER(name)

  layer.isLocked ← FALSE
```

---

## 🎨 Set Color

```pseudo
FUNCTION setLayerColor():

  PROMPT "Enter color number (1-255):"
  color ← USER_INPUT()

  PROMPT "Enter layer name:"
  name ← USER_INPUT()

  layer ← GET_LAYER(name)

  layer.color ← color

  UPDATE_LAYER_MATERIAL(layer)
```

---

## 📏 Set Linetype

```pseudo
FUNCTION setLayerLinetype():

  PROMPT "Enter linetype:"
  linetype ← USER_INPUT()

  PROMPT "Enter layer name:"
  name ← USER_INPUT()

  layer ← GET_LAYER(name)

  layer.linetype ← linetype

  UPDATE_LAYER_STYLE(layer)
```

---

## ❌ Delete Layer

```pseudo
FUNCTION deleteLayer():

  PROMPT "Enter layer name:"
  name ← USER_INPUT()

  IF name == LayerManager.currentLayer:
      ERROR "Cannot delete current layer"
      RETURN

  IF layerHasEntities(name):
      ERROR "Layer not empty"
      RETURN

  REMOVE LayerManager.layers[name]
```

---

# 🔧 Utility Functions

```pseudo
FUNCTION GET_LAYER(name):

  IF NOT LayerManager.layers.contains(name):
      ERROR "Layer not found"
      THROW

  RETURN LayerManager.layers[name]
```

---

```pseudo
FUNCTION PROMPT_LAYER():
  PROMPT "Enter layer name:"
  RETURN USER_INPUT()
```

---

# 🧱 Three.js Integration

---

## 🧩 Entity Structure

```pseudo
Entity {
  geometry
  material
  layerName
}
```

---

## 👁️ Visibility Update

```pseudo
FUNCTION UPDATE_LAYER_RENDERING(layer):

  FOR EACH entity IN scene:

      IF entity.layerName == layer.name:
          entity.visible = layer.isVisible AND NOT layer.isFrozen
```

---

## 🎨 Material Update

```pseudo
FUNCTION UPDATE_LAYER_MATERIAL(layer):

  FOR EACH entity IN scene:

      IF entity.layerName == layer.name:
          entity.material.color = layer.color
```

---

## 🔒 Lock Enforcement (Editing)

```pseudo
FUNCTION canEdit(entity):

  layer ← LayerManager.layers[entity.layerName]

  RETURN NOT layer.isLocked
```

---

# ⚡ Advanced Enhancements (Recommended)

---

## 1. Layer Groups (future)

```pseudo
LayerGroup {
  name
  layers[]
}
```

---

## 2. Per-layer Three.js Group

```pseudo
group = new THREE.Group()
group.name = layer.name
scene.add(group)
```

👉 Huge performance improvement

---

## 3. Bitmask Filtering (fast visibility)

```pseudo
entity.layerMask = bitIndex(layer)
camera.layers.enable(layerMask)
```

---

## 4. Undo/Redo Integration

```pseudo
COMMAND_WRAPPER:
  SAVE_STATE()
  EXECUTE()
```

---

# 🚀 Summary

| Feature          | Status |
| ---------------- | ------ |
| Layer creation   | ✅      |
| Visibility       | ✅      |
| Freeze/Thaw      | ✅      |
| Locking          | ✅      |
| Color/Linetype   | ✅      |
| Three.js mapping | ✅      |

---

