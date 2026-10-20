# Transaction-Based Undo/Redo System for WebCAD

A proper CAD undo/redo system is **not** just storing snapshots.

Professional CAD systems use:

```text
Command → Transaction → Operations → Document Database
```

This allows:

* efficient memory usage
* partial rollback
* grouped operations
* scripting safety
* nested commands
* parametric edits
* block editing
* stable entity references

---

# Why Snapshot Undo Is Bad

Naive approach:

```ts
undoStack.push(JSON.stringify(document))
```

Problems:

* huge memory usage
* slow with large drawings
* difficult partial rollback
* breaks references
* impossible nested operations
* difficult multi-user sync later

---

# Proper CAD Architecture

---

# Core Concept

Instead of saving the entire document:

Save **operations/deltas**.

Example:

```text
MOVE entity A
FROM (10,10)
TO (20,20)
```

instead of:

```text
Entire document snapshot
```

---

# High-Level Architecture

```text
Document
  └── TransactionManager
          ├── Undo Stack
          ├── Redo Stack
          └── Active Transaction
```

---

# Transaction Flow

```text
User Command
    ↓
Begin Transaction
    ↓
Modify Entities
    ↓
Record Operations
    ↓
Commit Transaction
    ↓
Push to Undo Stack
```

---

# Example

User executes:

```text
MOVE
```

Internally:

```text
BeginTransaction("MOVE")

ModifyEntity(line1)
ModifyEntity(circle5)

CommitTransaction()
```

Undo:

```text
UndoTransaction()
```

Redo:

```text
RedoTransaction()
```

---

# Core Classes

---

# TransactionManager

```ts
class TransactionManager {
    undoStack: Transaction[] = [];
    redoStack: Transaction[] = [];
    activeTransaction?: Transaction;

    begin(name: string): void;
    commit(): void;
    rollback(): void;

    undo(): void;
    redo(): void;
}
```

---

# Transaction

```ts
class Transaction {
    id: string;
    name: string;

    operations: Operation[] = [];

    add(op: Operation): void;

    undo(document: Document): void;
    redo(document: Document): void;
}
```

---

# Operation Base Class

```ts
abstract class Operation {
    abstract undo(doc: Document): void;
    abstract redo(doc: Document): void;
}
```

---

# Operation Types

---

# CreateEntityOperation

```ts
class CreateEntityOperation extends Operation {
    entity: Entity;

    undo(doc: Document) {
        doc.remove(this.entity.id);
    }

    redo(doc: Document) {
        doc.add(this.entity);
    }
}
```

---

# DeleteEntityOperation

```ts
class DeleteEntityOperation extends Operation {
    entity: Entity;

    undo(doc: Document) {
        doc.add(this.entity);
    }

    redo(doc: Document) {
        doc.remove(this.entity.id);
    }
}
```

---

# ModifyEntityOperation

Most important operation.

```ts
class ModifyEntityOperation extends Operation {
    before: EntityState;
    after: EntityState;

    undo(doc: Document) {
        doc.update(this.before);
    }

    redo(doc: Document) {
        doc.update(this.after);
    }
}
```

---

# EntityState

Should be lightweight.

```ts
interface EntityState {
    id: string;
    type: string;
    properties: any;
}
```

---

# Why State Snapshots Per Entity Work

Efficient because:

* only changed entities stored
* easy rollback
* stable IDs
* no full-document duplication

---

# Example — MOVE Command

---

# Before

```text
LINE1:
start=(0,0)
end=(10,0)
```

---

# User Moves Line

```text
MOVE by (5,5)
```

---

# Operation Stored

```ts
{
    before: {
        start: (0,0),
        end: (10,0)
    },

    after: {
        start: (5,5),
        end: (15,5)
    }
}
```

---

# Undo

Restore:

```text
(0,0) → (10,0)
```

---

# Redo

Restore:

```text
(5,5) → (15,5)
```

---

# Critical Feature — Grouped Transactions

One user command may modify MANY entities.

Example:

```text
TRIM
```

may affect:

* 20 lines
* 5 arcs
* 3 polylines

But user expects:

```text
ONE undo step
```

Therefore:

```text
Transaction
 ├── Modify line1
 ├── Modify line2
 ├── Delete arc5
 └── Modify polyline7
```

---

# Nested Transactions

Advanced CAD feature.

Example:

```text
BLOCK EDITOR
```

Internally launches subcommands.

Need:

```text
Parent Transaction
    └── Child Transactions
```

Architecture:

```ts
class Transaction {
    children: Transaction[];
}
```

Optional for first version.

---

# Entity IDs Are Essential

Every entity MUST have:

```ts
id: UUID
```

Never rely on array indices.

Bad:

```ts
entities[5]
```

Good:

```ts
entities.get(entityId)
```

Because undo/redo changes order.

---

# Important — Immutable Entity States

Avoid mutating live objects directly.

Preferred:

```ts
entity = entity.cloneWithChanges(...)
```

instead of:

```ts
entity.x = newX
```

Immutable states reduce undo bugs massively.

---

# Suggested Document Architecture

```text
Document
 ├── EntityDatabase
 ├── LayerTable
 ├── BlockTable
 ├── LinetypeTable
 ├── StyleTable
 └── TransactionManager
```

---

# Command Integration

---

# Base Command

```ts
abstract class Command {
    abstract execute(ctx: CommandContext): void;
}
```

---

# Example MOVE Command

```ts
execute(ctx: CommandContext) {

    const tx = ctx.transactions.begin("MOVE");

    for (const entity of selection) {

        const before = entity.serialize();

        entity.move(dx, dy);

        const after = entity.serialize();

        tx.add(
            new ModifyEntityOperation(before, after)
        );
    }

    ctx.transactions.commit();
}
```

---

# Automatic Rollback on Failure

Extremely important.

Example:

```text
OFFSET failed halfway
```

Need:

```text
RollbackTransaction()
```

This guarantees document consistency.

---

# Recommended Transaction Lifecycle

```text
BEGIN
  ↓
record ops
  ↓
VALIDATE
  ↓
COMMIT
```

If error:

```text
ROLLBACK
```

---

# Memory Optimization

Professional CAD systems often use:

---

# Delta Compression

Instead of full entity states:

```text
x changed 10→20
```

instead of entire entity snapshot.

Optional later.

---

# Object Pooling

Reuse operation objects.

Useful for huge drawings.

---

# Lazy Serialization

Only serialize entity state when modified.

---

# Future-Proof Features

A proper transaction engine enables:

---

# 1. AutoLISP Support

Scripts become undo-safe.

```lisp
(command "MOVE")
```

wrapped in transaction.

---

# 2. Parametric Constraints

Constraint solver updates many entities atomically.

---

# 3. Multi-User Collaboration

Transactions can become network patches.

---

# 4. Crash Recovery

Replay committed transactions.

---

# 5. Timeline/History Viewer

Like:

```text
UNDO
  MOVE
  OFFSET
  FILLET
  HATCH
```

---

# Recommended Folder Structure

```text
core/
 ├── transactions/
 │     ├── Transaction.ts
 │     ├── TransactionManager.ts
 │     ├── Operation.ts
 │     ├── operations/
 │     │      ├── CreateEntityOperation.ts
 │     │      ├── DeleteEntityOperation.ts
 │     │      └── ModifyEntityOperation.ts
 │     └── serializers/
```

---

# Recommended Immediate Implementation Order

---

# Phase 1

Implement:

* TransactionManager
* Transaction
* Operation base class
* Create/Delete/Modify operations

---

# Phase 2

Integrate into:

* MOVE
* COPY
* ROTATE
* SCALE

---

# Phase 3

Integrate into:

* TRIM
* EXTEND
* FILLET
* CHAMFER

---

# Phase 4

Add:

* rollback
* nested transactions
* transaction merging

---

# Phase 5

Add:

* command history UI
* persistent recovery
* AutoLISP integration

---

# Ideal End Result

Eventually every modification in WebCAD should become:

```text
Command
   ↓
Transaction
   ↓
Operations
   ↓
Document Database
```

This is the same architectural direction used by professional CAD systems like:

* AutoCAD
* FreeCAD
* SolidWorks
* Rhino
