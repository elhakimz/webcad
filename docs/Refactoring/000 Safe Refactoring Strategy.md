# Safe Refactoring Strategy for Your WebCAD

Your current project is already large enough that unsafe refactoring can easily break:

* command behavior
* snapping
* selection
* DXF export
* rendering
* undo/redo
* UI interaction

At this stage, you should refactor like a CAD vendor, not like a small prototype.

---

# Primary Refactoring Goal

The goal is NOT:

> “rewrite everything cleaner”

The goal IS:

> “improve architecture while preserving CAD behavior stability”

That is a huge difference.

---

# Golden Rule

## NEVER refactor these simultaneously:

* architecture
* behavior
* rendering
* UI logic
* entity model

Refactor only ONE dimension at a time.

---

# Recommended Safe Refactor Order

## Phase 1 — Freeze Existing Behavior

Before major refactoring:

## Create Behavioral Baseline

You need:

```text
tests/
 ├── commands/
 ├── rendering/
 ├── snapping/
 ├── geometry/
 ├── DXF/
 └── interaction/
```

---

# Critical Snapshot Tests

Add tests for:

## Geometry

```text
LINE creation
ARC creation
OFFSET results
TRIM results
FILLET geometry
```

---

## Rendering

Use image snapshots:

```text
before_refactor.png
after_refactor.png
```

Compare automatically.

---

## DXF Stability

Test:

```text
DXF import -> export -> import
```

and verify geometry remains equivalent.

---

# Why This Matters

CAD systems are extremely sensitive.

A tiny refactor can break:

* snap precision
* selection bounds
* hatch islands
* coordinate transforms
* arc winding
* linetypes

without obvious visual errors.

---

# Phase 2 — Introduce Boundaries

Currently your code likely has:

```text
UI directly touching renderer
renderer directly touching entities
commands mutating scene directly
```

This becomes dangerous.

---

# Safe Architecture Target

```text
UI
 ↓
Command System
 ↓
Document Database
 ↓
Render System
```

---

# Most Important Refactor

## Introduce Document API

Instead of:

```ts
scene.add(entity.mesh)
```

commands should do:

```ts
document.addEntity(entity)
```

Then renderer observes document changes.

---

# Why This Is Critical

Without this:

* undo becomes hard
* DXF sync becomes hard
* multi-viewports impossible
* transactions impossible
* collaborative editing impossible

---

# Phase 3 — Add Adapter Layers

DO NOT rewrite immediately.

Create adapters first.

---

# Example

Current:

```ts
LineCommand → ThreeJS directly
```

Temporary adapter:

```ts
LineCommand
   ↓
EntityService
   ↓
RenderAdapter
   ↓
ThreeJS
```

Later:

```text
ThreeJS
BabylonJS
WebGPU
OpenCascade Viewer
```

can be swapped safely.

---

# Safe Refactor Pattern

## WRONG

```text
rewrite renderer completely
```

---

## CORRECT

```text
old renderer
      ↓
renderer interface
      ↓
new renderer implementation
```

Then migrate gradually.

---

# Recommended Refactor Sequence

# 1. Extract Interfaces FIRST

Before changing logic:

```ts
interface IEntityRenderer
interface ICommand
interface ISnapProvider
interface IDocument
interface ISelectionService
```

---

# Why?

Interfaces reduce coupling.

You can then refactor internals safely.

---

# 2. Introduce Service Layer

Move logic OUT of UI components.

---

## BAD

```ts
Toolbar.ts
  creates entities
  edits scene
  updates renderer
```

---

## GOOD

```ts
Toolbar.ts
   ↓
CommandDispatcher
   ↓
DocumentService
```

UI becomes thin.

---

# 3. Convert Global State Gradually

Likely current issue:

```ts
window.viewer
window.scene
window.currentLayer
```

Replace with:

```ts
AppContext
CADContext
DocumentContext
```

---

# 4. Refactor Rendering LAST

Most dangerous subsystem.

Do NOT start there.

Because rendering touches:

* selection
* snapping
* interaction
* visibility
* highlighting
* text
* dimensions

---

# Safe Rendering Refactor

## Step A

Add abstraction:

```ts
RendererFacade
```

---

## Step B

Move rendering calls behind interface.

---

## Step C

Replace implementation gradually.

---

# Example

Before:

```ts
line.mesh.material.color.set(...)
```

After:

```ts
renderer.updateEntityStyle(entityId, style)
```

---

# Phase 4 — Modularize Entities

Current likely:

```text
entities/
 ├── Line.ts
 ├── Arc.ts
 └── Circle.ts
```

Good start.

---

# Next Safe Evolution

Separate:

```text
entity/
 ├── geometry/
 ├── rendering/
 ├── snapping/
 ├── serialization/
 └── editing/
```

---

# Example

```text
Line/
 ├── LineEntity.ts
 ├── LineGeometry.ts
 ├── LineRenderer.ts
 ├── LineSnapProvider.ts
 ├── LineDXF.ts
 └── LineGripEditor.ts
```

This scales MUCH better.

---

# Phase 5 — Introduce Immutable Geometry

Very important for CAD stability.

---

# BAD

```ts
line.start.x += 5
```

---

# GOOD

```ts
line = line.withStart(newPoint)
```

or

```ts
const newLine = transformLine(line)
```

---

# Why?

Immutable geometry prevents:

* hidden mutation bugs
* undo corruption
* stale render caches
* invalid references

---

# Phase 6 — Transaction System

Currently likely:

```ts
command executes immediately
```

Need:

```text
Transaction
 ├── begin
 ├── modify
 ├── commit
 └── rollback
```

---

# Why?

Essential for:

* undo
* parametric editing
* scripting
* block editing
* future collaboration

---

# Phase 7 — Event Bus

Currently likely tight coupling:

```ts
SelectionManager directly calls renderer
```

Refactor toward:

```text
SelectionChangedEvent
LayerChangedEvent
DocumentModifiedEvent
ViewportChangedEvent
```

---

# Benefits

Massively reduces coupling.

Makes future features easier:

* minimap
* multi-view
* scripting
* plugins
* remote collaboration

---

# DO NOT REFACTOR YET

Avoid touching these until architecture stabilizes:

## 1. HATCH

Extremely fragile mathematically.

---

## 2. SPLINE

Easy to break precision.

---

## 3. DIMENSIONS

Very interconnected.

---

## 4. TEXT/MTEXT

Rendering complexity huge.

---

## 5. DXF Import

One tiny parser change can corrupt files.

---

# Most Dangerous Refactor Mistakes

# Mistake 1 — “Big Rewrite”

Never:

```text
delete old system
rewrite everything
```

CAD projects die this way.

---

# Mistake 2 — Mixing Refactor + Feature Development

Never simultaneously:

* add 3D
* refactor renderer
* rewrite commands

Choose ONE.

---

# Mistake 3 — No Regression Tests

Without regression tests:

You WILL break geometry silently.

---

# Recommended Branch Strategy

## Main Branch

```text
stable
```

Always runnable.

---

## Refactor Branches

```text
refactor/document-db
refactor/render-system
refactor/viewport
```

Small focused branches only.

---

# Recommended Immediate Safe Refactors

## Safest First Targets

### 1. Extract interfaces

Very low risk.

---

### 2. Create document service

High value.

---

### 3. Introduce renderer facade

Very high value.

---

### 4. Remove global state

Important long-term.

---

### 5. Add event bus

Excellent scalability.

---

# Refactor Priority Matrix

| Refactor              | Risk      | Reward         |
| --------------------- | --------- | -------------- |
| Interface extraction  | Low       | Very High      |
| Document service      | Medium    | Extremely High |
| Renderer facade       | Medium    | Extremely High |
| Immutable geometry    | Medium    | High           |
| Event bus             | Medium    | Very High      |
| Entity modularization | Medium    | High           |
| Renderer rewrite      | Very High | High           |
| Command rewrite       | Very High | Medium         |

---

# Best Long-Term Architecture

Your eventual architecture should resemble:

```text
CAD Application
 ├── UI Layer
 ├── Command System
 ├── Document Database
 ├── Geometry Kernel
 ├── Constraint Solver
 ├── Render Engine
 ├── IO System
 ├── Scripting Engine
 └── Plugin System
```

That is how professional CAD systems evolve safely.
