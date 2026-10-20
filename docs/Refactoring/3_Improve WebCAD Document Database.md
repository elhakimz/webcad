# Improve WebCAD Document Database

Your current architecture already has entities and commands, but professional CAD systems require a much deeper **document database layer** between commands and rendering.

Right now your system likely behaves like:

```text
commands -> entities[] -> renderer
```

Professional CAD systems behave more like:

```text
commands
   ↓
transaction system
   ↓
document database
   ↓
object graph
   ↓
render pipeline
```

The database becomes the “source of truth” for the entire CAD system.

---

# 1. Why a CAD Database Matters

Without a proper document database, problems appear later:

* undo/redo becomes fragile
* blocks become difficult
* dependencies break
* references become inconsistent
* layouts become messy
* parametric systems impossible
* linetype/style inheritance difficult
* OpenCascade solids difficult to manage

The database solves all these.

---

# 2. Core Concept

The document database is NOT SQL.

It is an **in-memory object graph** similar to:

* AutoCAD AcDb
* FreeCAD App Document
* Blender DataBlocks
* Revit Document

---

# 3. Recommended Core Architecture

## High-Level Structure

```text
Document
 ├── Header
 ├── ObjectDatabase
 ├── Tables
 ├── Dictionaries
 ├── ModelSpace
 ├── PaperSpace
 ├── UndoStack
 ├── DependencyGraph
 └── SpatialIndexes
```

---

# 4. Core Classes

---

# Document

The root container.

```ts
class Document {
    id: string
    name: string

    database: ObjectDatabase

    modelSpace: BlockRecord
    paperSpaces: BlockRecord[]

    layers: LayerTable
    linetypes: LinetypeTable
    textStyles: TextStyleTable
    dimStyles: DimStyleTable
    blocks: BlockTable

    history: TransactionManager
    dependencyGraph: DependencyGraph

    spatialIndex: SpatialIndex
}
```

This becomes the heart of the entire CAD system.

---

# 5. Object Database

The most important component.

---

## Responsibilities

The database:

* owns all objects
* assigns IDs
* tracks references
* handles lookup
* handles deletion
* handles serialization
* manages object lifetime

---

## Recommended Structure

```ts
class ObjectDatabase {
    objects: Map<ObjectId, DBObject>
}
```

---

# 6. DBObject Base Class

Everything in CAD should inherit from DBObject.

---

## Example

```ts
abstract class DBObject {
    id: ObjectId
    handle: string

    ownerId?: ObjectId

    erased: boolean = false

    createdAt: number
    modifiedAt: number

    xdata?: Map<string, any>
}
```

---

# Why This Matters

This enables:

* undo/redo
* ownership
* references
* DXF handles
* dependency tracking
* extension dictionaries
* AutoLISP integration

---

# 7. Entity Hierarchy

Example:

```text
DBObject
 ├── Entity
 │     ├── Line
 │     ├── Circle
 │     ├── Arc
 │     ├── Polyline
 │     ├── Hatch
 │     ├── Text
 │     └── Dimension
 │
 ├── Layer
 ├── Linetype
 ├── BlockRecord
 ├── TextStyle
 └── Viewport
```

---

# 8. Object IDs

Never use array indexes.

Every object needs:

```ts
type ObjectId = string
```

Example:

```text
3F2A
3F2B
3F2C
```

---

# 9. Handles vs IDs

Professional CAD systems use both.

---

## ObjectId

Internal runtime reference.

---

## Handle

Persistent DXF/DWG identifier.

Example:

```text
5A2F
```

Used during:

* save/load
* external references
* blocks
* scripts

---

# 10. Ownership System

Very important.

Example:

```text
ModelSpace
 ├── Line
 ├── Circle
 └── BlockReference
```

Entities belong to containers.

---

## Example

```ts
entity.ownerId = modelSpace.id
```

---

# 11. Tables

CAD uses symbol tables.

---

## Layer Table

```ts
class LayerTable {
    records: Map<string, Layer>
}
```

---

## Linetype Table

```ts
class LinetypeTable {
    records: Map<string, Linetype>
}
```

---

## Other Tables

```text
TextStyleTable
DimStyleTable
BlockTable
UcsTable
MaterialTable
ViewportTable
```

---

# 12. Block Architecture

Critical for CAD.

---

## Block Definition

```text
DoorBlock
 ├── Line
 ├── Arc
 └── Hatch
```

---

## Insert (BlockReference)

```text
INSERT DoorBlock
 position=(100,200)
 scale=(2,2)
 rotation=45
```

---

## Recommended Classes

```ts
class BlockRecord extends DBObject {
    entities: ObjectId[]
}
```

```ts
class BlockReference extends Entity {
    blockId: ObjectId
}
```

---

# 13. ModelSpace vs PaperSpace

Must be separated.

---

## ModelSpace

Real geometry.

---

## PaperSpace

Layouts/printing.

---

## Structure

```text
Document
 ├── ModelSpace
 └── PaperSpaces
      ├── Layout1
      ├── Layout2
```

---

# 14. Dependency Graph

One of the most important future systems.

Tracks:

```text
Dimension -> Line
Constraint -> Circle
BlockRef -> Block
Viewport -> Layer
```

---

## Example

```ts
class DependencyGraph {
    edges: Map<ObjectId, Set<ObjectId>>
}
```

---

# Why This Matters

If a line changes:

* dimensions update
* constraints solve
* hatch recalculates
* references redraw

---

# 15. Transaction System

Critical.

Every command should run inside transaction.

---

## Example

```ts
transaction.begin()

create(line)
modify(circle)

transaction.commit()
```

or

```ts
transaction.rollback()
```

---

# 16. Undo/Redo Architecture

Never directly mutate entities permanently.

Use operation records.

---

## Example

```ts
class Operation {
    undo()
    redo()
}
```

---

## Examples

```text
CreateEntityOperation
DeleteEntityOperation
ModifyEntityOperation
```

---

# 17. Entity Lifecycle

Recommended states:

```text
alive
erased
purged
```

Do NOT instantly delete entities.

AutoCAD marks erased first.

---

# 18. Spatial Index Integration

The database should own spatial indexes.

---

## Example

```ts
class SpatialIndex {
    insert(entity)
    remove(entity)
    query(bounds)
}
```

---

# 19. Rendering Integration

Renderer should NEVER own geometry permanently.

Renderer should observe document.

---

## Flow

```text
Document changed
    ↓
Event emitted
    ↓
Renderer updates buffers
```

---

# 20. Event System

Extremely important.

---

## Example

```ts
document.events.emit("entityAdded")
document.events.emit("entityModified")
document.events.emit("layerChanged")
```

---

# 21. Serialization Layer

Separate storage from runtime.

---

## Runtime Objects

```ts
LineEntity
```

---

## Serialized

```json
{
  "type": "LINE",
  "id": "3F2A",
  "start": [0,0],
  "end": [100,0]
}
```

---

# 22. Recommended Folder Structure

```text
core/
 ├── database/
 │    ├── Document.ts
 │    ├── ObjectDatabase.ts
 │    ├── DBObject.ts
 │    ├── tables/
 │    ├── transactions/
 │    ├── dependency/
 │    └── serialization/
```

---

# 23. Future-Proofing for OpenCascade

Eventually:

```text
Entity
 ├── 2D entities
 └── OCC entities
```

Example:

```ts
class OCCSolid extends Entity {
    shapeHandle
}
```

Database architecture makes this easy.

---

# 24. Recommended Immediate Refactor

---

## Step 1

Create:

```text
Document
ObjectDatabase
DBObject
```

---

## Step 2

Convert all entities:

```ts
extends DBObject
```

---

## Step 3

Replace arrays with:

```ts
Map<ObjectId, DBObject>
```

---

## Step 4

Add transaction manager.

---

## Step 5

Add ownership system.

---

## Step 6

Add event system.

---

# 25. Most Important Principle

The renderer should NOT be the authority.

The document database must be the authority.

---

# Ideal Final Flow

```text
UI
 ↓
Command Engine
 ↓
Transaction
 ↓
Document Database
 ↓
Dependency Graph
 ↓
Renderer
```

This is the architecture used by real CAD systems.
