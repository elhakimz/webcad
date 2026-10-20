# WebCAD Database Structure (RxDB + IndexedDB)

Recommended architecture for your WebCAD:

```text
UI
 ↓
Command System
 ↓
Document Service
 ↓
RxDB
 ↓
IndexedDB
```

This architecture is ideal for:

* offline-first CAD
* browser CAD
* Electron CAD
* future collaboration
* undo/redo
* multi-viewports
* parametric extension

---

# Core Design Principle

## Store ONLY CAD semantic data

Store:

* entities
* layers
* blocks
* styles
* constraints
* metadata

DO NOT store:

* Three.js meshes
* GPU buffers
* materials
* render caches

Renderer must rebuild visuals dynamically.

---

# Recommended Database Collections

# Main Collections

```text
db/
 ├── documents
 ├── entities
 ├── layers
 ├── blocks
 ├── linetypes
 ├── textstyles
 ├── dimstyles
 ├── layouts
 ├── viewports
 ├── constraints
 ├── groups
 ├── history
 ├── dictionaries
 └── settings
```

---

# 1. documents Collection

Represents DWG/DXF-like drawing file.

## Example

```ts
{
  id: "doc_001",

  name: "factory-layout",

  units: "mm",

  createdAt: 1710000000,
  updatedAt: 1710001000,

  activeLayoutId: "layout_model",

  metadata: {
    author: "Abil Hakim",
    version: "0.1"
  }
}
```

---

# 2. entities Collection

Most important collection.

Contains ALL drawing entities.

---

# Entity Base Structure

```ts
{
  id: "ent_001",

  documentId: "doc_001",

  type: "LINE",

  layerId: "layer_0",

  visible: true,
  locked: false,

  transform: {
    position: [0,0,0],
    rotation: [0,0,0],
    scale: [1,1,1]
  },

  geometry: {},

  style: {},

  metadata: {},

  createdAt: 1710000000,
  updatedAt: 1710001000
}
```

---

# Example: LINE Entity

```ts
{
  id: "ent_line_001",

  type: "LINE",

  geometry: {
    start: [0,0,0],
    end: [100,0,0]
  },

  style: {
    color: 1,
    lineweight: 0.25,
    linetypeId: "continuous"
  }
}
```

---

# Example: ARC Entity

```ts
{
  id: "ent_arc_001",

  type: "ARC",

  geometry: {
    center: [50,50,0],
    radius: 25,
    startAngle: 0,
    endAngle: 180
  }
}
```

---

# Example: POLYLINE Entity

```ts
{
  id: "ent_pl_001",

  type: "LWPOLYLINE",

  geometry: {
    vertices: [
      [0,0],
      [100,0],
      [100,100]
    ],

    closed: false,

    bulges: [0,0]
  }
}
```

---

# Example: HATCH Entity

```ts
{
  id: "ent_hatch_001",

  type: "HATCH",

  geometry: {
    loops: [
      {
        type: "polyline",
        points: [...]
      }
    ]
  },

  hatch: {
    pattern: "ANSI31",
    scale: 1,
    angle: 0
  }
}
```

---

# Example: TEXT Entity

```ts
{
  id: "ent_text_001",

  type: "TEXT",

  geometry: {
    insertionPoint: [0,0,0]
  },

  text: {
    value: "HELLO",
    height: 2.5,
    rotation: 0,
    styleId: "standard"
  }
}
```

---

# 3. layers Collection

```ts
{
  id: "layer_0",

  name: "0",

  visible: true,
  locked: false,

  color: 7,

  lineweight: 0.25,

  linetypeId: "continuous"
}
```

---

# 4. blocks Collection

Critical for CAD scalability.

```ts
{
  id: "block_door",

  name: "DOOR",

  basePoint: [0,0,0],

  entityIds: [
    "ent_001",
    "ent_002"
  ]
}
```

---

# INSERT Entity

```ts
{
  id: "insert_001",

  type: "INSERT",

  blockId: "block_door",

  transform: {
    position: [100,200,0],
    rotation: [0,0,90],
    scale: [1,1,1]
  }
}
```

---

# 5. layouts Collection

For paperspace/modelspace.

```ts
{
  id: "layout_model",

  name: "Model",

  type: "modelspace",

  viewportIds: [
    "vp_001"
  ]
}
```

---

# 6. viewports Collection

```ts
{
  id: "vp_001",

  camera: {
    target: [0,0,0],
    zoom: 1
  },

  renderMode: "wireframe",

  gridEnabled: true,

  snapEnabled: true
}
```

---

# 7. constraints Collection

Future parametric CAD.

```ts
{
  id: "constraint_001",

  type: "parallel",

  entityRefs: [
    "ent_001",
    "ent_002"
  ]
}
```

---

# 8. history Collection

For undo/redo.

---

# Transaction-Based History

```ts
{
  id: "txn_001",

  type: "command",

  command: "MOVE",

  timestamp: 1710000000,

  operations: [
    {
      type: "modify",
      entityId: "ent_001",

      before: {...},
      after: {...}
    }
  ]
}
```

---

# 9. settings Collection

```ts
{
  id: "app_settings",

  snap: true,
  ortho: false,
  grid: true,

  autosaveMinutes: 5
}
```

---

# Recommended RxDB Schema Example

# Entity Schema

```ts
const entitySchema = {
  title: "entity schema",

  version: 0,

  primaryKey: "id",

  type: "object",

  properties: {

    id: {
      type: "string"
    },

    type: {
      type: "string"
    },

    documentId: {
      type: "string"
    },

    layerId: {
      type: "string"
    },

    geometry: {
      type: "object"
    },

    style: {
      type: "object"
    },

    metadata: {
      type: "object"
    },

    createdAt: {
      type: "number"
    },

    updatedAt: {
      type: "number"
    }
  },

  required: [
    "id",
    "type",
    "documentId"
  ]
};
```

---

# Recommended CAD Runtime Architecture

# Runtime Flow

```text
RxDB Document
      ↓
Document Service
      ↓
Entity Events
      ↓
Renderer
      ↓
Three.js Meshes
```

---

# Important Design Rule

## NEVER let renderer directly mutate database

BAD:

```ts
mesh.position.x += 5
```

GOOD:

```ts
documentService.moveEntity(id, delta)
```

then renderer reacts automatically.

---

# Recommended Entity Cache

Use runtime cache:

```text
EntityCache
 ├── spatial index
 ├── render cache
 ├── snap cache
 └── selection cache
```

These should NOT be persisted.

---

# Recommended Spatial Index

Store separately in memory only:

```text
Quadtree
BVH
Octree
```

because rebuilding is safer than persistence.

---

# Recommended ID Strategy

Use stable UUIDs:

```text
doc_xxxxx
ent_xxxxx
layer_xxxxx
block_xxxxx
```

Very important for:

* undo
* collaboration
* references
* constraints

---

# Recommended Entity Inheritance Strategy

Avoid huge inheritance trees.

Instead use:

```text
Entity
 ├── geometry
 ├── style
 ├── metadata
 └── behaviors
```

composition-based architecture scales better.

---

# Recommended Future Extensions

# Add Later

```text
materials
assemblies
parametric features
BREP topology
GIS coordinates
IFC/BIM metadata
simulation metadata
```

without breaking schema.

---

# Recommended IndexedDB Strategy

# One Database Per Drawing

GOOD:

```text
webcad_factory_layout
webcad_house_plan
webcad_city_map
```

Avoid giant single DB for all projects.

---

# Autosave Strategy

Every:

```text
5–30 seconds
```

persist changed documents only.

RxDB handles reactive updates very well.

---

# Recommended Large Drawing Strategy

For huge CAD files:

## Split collections

```text
entities_2d
entities_3d
hatches
annotations
```

to reduce query cost.

---

# Future Collaboration Evolution

Later architecture:

```text
Local RxDB
     ↕ sync
Collaboration Server
     ↕
PostgreSQL/MongoDB
```

without rewriting client DB.

---

# Best Final Architecture

```text
WebCAD
 ├── RxDB
 ├── IndexedDB
 ├── Document Service
 ├── Command System
 ├── Geometry Kernel
 ├── Renderer
 ├── Spatial Index
 ├── Constraint Solver
 └── Scripting Engine
```

This architecture is strong enough to evolve toward:

* AutoCAD-like workflows
* offline CAD
* collaborative CAD
* parametric CAD
* BIM-lite
* CAM preparation
* GIS integration
* OpenCascade solid modeling
