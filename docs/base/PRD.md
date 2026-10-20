
Below is a **practical build plan for WebCAD (AutoCAD 2.18 clone)** focused on *how to actually ship it*.

---

# 🚀 WebCAD Execution Plan (Engineering Roadmap)

## 0. Core Strategy (Important)

You are not building “a CAD app”.

You are building 4 systems that combine:

1. **Command Interpreter (AutoCAD brain)**
2. **Entity System (drawing database)**
3. **Rendering Engine (Three.js viewport)**
4. **DXF I/O Layer (compatibility bridge)**

Everything else is UI dressing.

---

# 🧠 1. System Architecture (Refined)

## 1.1 High-Level Architecture

```
┌──────────────────────────────┐
│        UI Layer (DOM)        │
│  - Command Line              │
│  - Menu Bar (DOS style)      │
│  - Status Bar                │
└────────────┬─────────────────┘
             │ events
┌────────────▼─────────────────┐
│     Command Engine           │  ← CORE (AutoCAD behavior)
│ - Lexer / Parser             │
│ - Command State Machine      │
│ - Input Router               │
└────────────┬─────────────────┘
             │
┌────────────▼─────────────────┐
│     CAD Core Model           │
│ - Entities (Line, Circle)    │
│ - Layers                     │
│ - Selection Sets            │
│ - Undo/Redo Stack           │
└────────────┬─────────────────┘
             │
┌────────────▼─────────────────┐
│   Rendering Engine           │
│   (Three.js)                 │
│ - Orthographic Camera       │
│ - Scene Graph               │
│ - BufferGeometry batch      │
└────────────┬─────────────────┘
             │
┌────────────▼─────────────────┐
│   DXF Import / Export        │
│ - ASCII DXF R12 writer       │
│ - DXF parser                 │
└──────────────────────────────┘
```

---

# 🧱 2. Technology Stack (Finalized)

## Frontend

* Vanilla TS (recommended) OR SolidJS (light UI only)
* Three.js (mandatory)
* Vite (build system)

## Core Libraries

* `three`
* `dxf-parser` (reference or fork)
* optional: `mitt` (event bus)

## Data Layer

* In-memory JSON graph
* IndexedDB (phase 2)
* localStorage autosave (MVP)

---

# 🧩 3. Folder Structure (Critical)

```
webcad/
├── src/
│   ├── core/
│   │   ├── model/
│   │   │   ├── Entity.ts
│   │   │   ├── Line.ts
│   │   │   ├── Circle.ts
│   │   │   ├── Layer.ts
│   │   │   └── SelectionSet.ts
│   │   │
│   │   ├── commands/
│   │   │   ├── Command.ts (interface)
│   │   │   ├── LineCommand.ts
│   │   │   ├── CircleCommand.ts
│   │   │   ├── MoveCommand.ts
│   │   │   └── ...
│   │   │
│   │   ├── engine/
│   │   │   ├── CommandManager.ts
│   │   │   ├── InputRouter.ts
│   │   │   ├── UndoRedo.ts
│   │   │   └── SnapEngine.ts
│   │   │
│   │   ├── render/
│   │   │   ├── Viewer.ts (Three.js wrapper)
│   │   │   ├── SceneBuilder.ts
│   │   │   └── GeometryFactory.ts
│   │   │
│   │   ├── io/
│   │   │   ├── dxfExport.ts
│   │   │   ├── dxfImport.ts
│   │   │   └── autosave.ts
│   │
│   ├── ui/
│   │   ├── commandLine.ts
│   │   ├── statusBar.ts
│   │   ├── menuBar.ts
│   │   └── theme.css
│   │
│   ├── app.ts
│   └── main.ts
```

---

# ⚙️ 4. Build Phases (VERY IMPORTANT)

---

# 🟢 PHASE 1 — CORE ENGINE (MVP FOUNDATION)

## Goal:

Make CAD “alive” (commands → geometry → render)

### Tasks:

### 1. Entity System

* Base class `Entity`
* Implement:

  * Line
  * Circle
  * Polyline
* Store in:

```ts
entities: Map<string, Entity>
```

---

### 2. Command Engine (MOST IMPORTANT PART)

Implement state machine:

```
IDLE → COMMAND_ACTIVE → WAITING_INPUT → EXECUTING → IDLE
```

Example:

```
LINE → click/start → click/end → create entity
```

Each command:

```ts
interface Command {
  name: string
  start()
  onInput(input: string)
  onPoint(x: number, y: number)
  cancel()
  finish()
}
```

---

### 3. Renderer (Three.js)

* Orthographic camera
* Convert CAD coords → world coords
* Render:

  * BufferGeometry lines
  * Instanced rendering later

---

### 4. Input System

* Command line input parser
* Coordinate parser:

  * `x,y`
  * `@dx,dy`
  * `@dist<angle`

---

### 5. Basic Commands (ONLY 5 FIRST)

Start small:

* LINE ✅
* CIRCLE ✅
* ERASE ✅
* MOVE ✅
* ZOOM ✅

DO NOT expand yet.

---

### Deliverable:

✔ You can draw shapes in browser like AutoCAD 2.18

---

# 🟡 PHASE 2 — CAD BEHAVIOR SYSTEM

## Goal:

Make it behave like real CAD software

### Add:

### 1. Selection Engine

* window select
* crossing select
* highlight system

---

### 2. Undo/Redo Stack

Command-based history:

```
[Command executed]
→ push snapshot delta
→ undo restores state
```

---

### 3. Layers System

* layer object
* visibility toggle
* active layer

---

### 4. Snap System

* endpoint
* midpoint
* grid snap

---

### 5. Core Editing Commands

Add:

* COPY ✅
* ROTATE ✅
* SCALE ✅
* MIRROR ✅
* TRIM ✅
* EXTEND ✅

---

### Deliverable:

✔ Usable CAD tool (still minimal but powerful)

---

# 🔵 PHASE 3 — AUTOCADE FEEL (DOS AUTHENTICITY)

## Goal:

Make users feel they are in 1986 AutoCAD

### Add:

* DOS font rendering
* blinking cursor
* command echo log
* error format:

```
? Unknown command
```

* menu bar (text only)
* status bar (F7/F8/F9 toggles)

---

# 🟣 PHASE 4 — FILE SYSTEM (DXF)

## Goal:

Real CAD interoperability

### Implement:

### 1. DXF Writer (R12 ASCII)

* entities → DXF sections
* LAYER mapping
* coordinate export

### 2. DXF Import

* parse entities
* rebuild scene graph

---

### Deliverable:

✔ Open file in LibreCAD / AutoCAD

---

# 🟠 PHASE 5 — PERFORMANCE + SCALE

## Goal:

10k–50k entities

### Add:

* spatial index (quadtree)
* geometry batching
* frustum culling
* dirty render system

---

# 🔴 PHASE 6 — 3D EXTENSION (OPTIONAL)

* extrusion (ELEV)
* perspective camera
* wireframe 3D view
* orbit controls

---

# 📊 5. Command System Design (KEY INNOVATION)

Instead of procedural code:

### Every command is a mini-state machine

Example:

```ts
class LineCommand implements Command {
  step = 0
  startPoint?: Vector2

  onPoint(p) {
    if (this.step === 0) {
      this.startPoint = p
      this.step = 1
    } else {
      createLine(this.startPoint, p)
      finish()
    }
  }
}
```

This is EXACTLY how AutoCAD works internally.

---

# ⚡ 6. Sprint Plan (Realistic)

## Sprint 1 (Week 1–2)

* Three.js viewport
* command line UI
* LINE command

## Sprint 2 (Week 3–4)

* circle, move, erase
* entity system stable

## Sprint 3 (Week 5–6)

* selection system
* undo/redo

## Sprint 4 (Week 7–8)

* layers + snap + grid

## Sprint 5 (Week 9–10)

* DXF import/export

## Sprint 6 (optional)

* polish DOS UI + performance

---

# ⚠️ Critical Risks (Engineering Reality)

### 1. Command system complexity

→ solve with strict state machine design

### 2. DXF correctness

→ use reference test files early

### 3. Performance bottleneck

→ batch geometry early, not later

---

# 🧭 Final Insight

If you succeed, you are essentially recreating:

> A lightweight AutoCAD kernel in the browser

The hardest part is NOT Three.js.

The hardest part is:

✔ Command interpreter
✔ Selection system
✔ Editing consistency

