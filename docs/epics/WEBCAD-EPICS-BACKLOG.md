# WebCad backlog epics (for later implementation)

These epics extend the **WebCad Engine Container (WC-EC)** epic. They are not scheduled; each lists what must exist first. Ticket descriptions are intentionally lighter than WC-EC; refine them (and re-check suitability) when an epic is scheduled.

**Agent working agreement:** same as WC-EC v5. One ticket per branch/PR, verify command from AGENTS.md before review, stop and ask on ambiguity or oversized changes. Suitability: A agent-led, B agent drafts / human designs, C human-led. Licences below are from public READMEs or general knowledge and must be verified before adoption; nothing here is legal advice.

## Epics overview

| Epic | Name | Tickets | Start after |
|---|---|---|---|
| WC-GEO | Geometry Quality, Healing and Validation | 5 | WC-EC kernel skeleton and parity harness |
| WC-XCH | Data Exchange and Export | 7 | WC-EC export ticket and gRPC blob/result streaming |
| WC-MSH | Mesh Pipeline, LOD and Previews | 7 | WC-EC tessellation port and observability |
| WC-ASM | Assemblies and Analysis | 7 | WC-EC command API, operation log and persistent ids |
| WC-DRW | 2D Drawings and Documentation | 6 | WC-EC persistent ids and command registry |
| WC-SKT | Sketch Solver and Sketch Tools | 6 | WC-EC feature graph and server-side sketch re-solve |
| WC-MFG | Sheet Metal and Manufacturing Preparation | 4 | WC-GEO validity policy and WC-XCH 2D export |
| WC-COL | Collaboration, Versioning and Sharing | 7 | WC-EC operation log, document actor and concurrent writers |
| WC-PLT | Platform Scaling and Operations | 7 | WC-EC compose, observability and benchmark |
| WC-AGT | Automation, Scripting and Agent Access | 6 | WC-EC command registry |
| WC-LIC | Licensing, Compliance and Customer Data | 5 | Start early: feeds the kernel ADR |

---

## WC-GEO - Geometry Quality, Healing and Validation

Define what a valid model is, repair imperfect input, and keep results trustworthy across kernels. Builds on OCCT's open shape-healing and checking tools (ShapeAnalysis, ShapeFix, ShapeUpgrade, BRepCheck); evaluate commercial add-ons only if these prove insufficient.

**Start after:** WC-EC kernel skeleton and parity harness · **Labels:** backlog, geometry

### WC-GEO-01 - Validity and tolerance policy

**Priority:** high · **Agent:** B · **Labels:** geometry, policy · **Parent:** WC-GEO · **Depends on:** WC-EC-12, WC-EC-13

**Goal:** One written definition of 'valid' and of tolerances, used by every operation and import.

**Tasks**
- [ ] Define validity checks per operation (BRepCheck, closed solid, positive volume, volume-drift limits)
- [ ] Define units, precision and fuzzy-value defaults; how they are stored in documents
- [ ] Specify the result gates shared by booleans, fillets and imports
- [ ] Document differences between kernels (WASM fallback vs native)

**Acceptance criteria**
- [ ] Policy doc approved
- [ ] Gates exist as shared, testable functions

### WC-GEO-02 - Healing pipeline for imported shapes

**Priority:** high · **Agent:** B · **Labels:** geometry, import · **Parent:** WC-GEO · **Depends on:** WC-GEO-01, WC-EC-24

**Goal:** Analyze and repair imports before they enter a document.

**Tasks**
- [ ] Pipeline: analyze, fix wires/faces/shells/solids, upgrade; each stage optional and logged
- [ ] Do NOT run seam-merge/unify blindly: re-validate and reject if it changes volume or validity (lesson from materializr's changelog)
- [ ] Per-stage time limits and failure handling (structured errors)
- [ ] Run inside the kernel sandbox after B-rep input pre-validation

**Acceptance criteria**
- [ ] Dirty-model corpus repaired with measured validity gains
- [ ] Volume drift within policy tolerance

### WC-GEO-03 - Repair report and user review

**Priority:** medium · **Agent:** B · **Labels:** geometry, ux · **Parent:** WC-GEO · **Depends on:** WC-GEO-02

**Goal:** Tell users what was wrong and what was changed.

**Tasks**
- [ ] Structured report: gaps, tiny edges, self-intersections, orientation fixes, before/after metrics
- [ ] UI to review, accept or reject the repair; keep the original
- [ ] Store the report with the document version

**Acceptance criteria**
- [ ] Report generated for every repaired import
- [ ] User can reject repairs and keep the original

### WC-GEO-04 - Dirty-model regression corpus

**Priority:** high · **Agent:** A · **Labels:** geometry, testing · **Parent:** WC-GEO · **Depends on:** WC-GEO-02, WC-EC-40

**Goal:** Fixtures and metrics so healing never regresses silently.

**Tasks**
- [ ] Collect supplier-style models and synthetic defects (gaps, flipped faces, tiny edges)
- [ ] Metrics: validity before/after, volume/area drift, runtime
- [ ] Run in CI for the kernel version matrix (7.9.3 and 8.0.x)

**Acceptance criteria**
- [ ] Corpus and metrics in CI
- [ ] Failures report metric and delta

### WC-GEO-05 - Analytic form recovery (spike)

**Priority:** low · **Agent:** C · **Labels:** geometry, spike · **Parent:** WC-GEO · **Depends on:** WC-GEO-04

**Goal:** Evaluate recovering planes/cylinders/etc. from NURBS geometry in imported parts.

**Tasks**
- [ ] Survey open options in OCCT before considering the commercial 'canonical recognition' component
- [ ] Measure recovery rate on the corpus
- [ ] Decision memo: build / skip / buy

**Acceptance criteria**
- [ ] Memo with measurements and recommendation


---

## WC-XCH - Data Exchange and Export

Import/export formats, fidelity and delivery for large files. Uses OCCT's open exchange modules first; proprietary formats are a separate decision.

**Start after:** WC-EC export ticket and gRPC blob/result streaming · **Labels:** backlog, exchange

### WC-XCH-01 - Format matrix and priorities

**Priority:** high · **Agent:** C · **Labels:** exchange, decision · **Parent:** WC-XCH

**Goal:** Decide which formats are supported, at what fidelity, in which tier.

**Tasks**
- [ ] List candidate formats (STEP, IGES, BREP, STL, OBJ, glTF, 3MF, DXF, SVG, USD) with direction (import/export), fidelity expectations and owner module (OCCT built-in vs library)
- [ ] Rank by customer demand
- [ ] Record licences for every library involved

**Acceptance criteria**
- [ ] Matrix approved
- [ ] Each format has an owner module and a test plan

### WC-XCH-02 - STEP import/export with assemblies and attributes

**Priority:** high · **Agent:** B · **Labels:** exchange, step · **Parent:** WC-XCH · **Depends on:** WC-XCH-01, WC-EC-24, WC-EC-25

**Goal:** Round-trip STEP with names, colors, layers and assembly structure.

**Tasks**
- [ ] Use the OCCT XCAF-based exchange path; cover AP214 and AP242 as supported
- [ ] Map assembly structure to the assembly model (see assemblies epic)
- [ ] Round-trip tests on the oracle/corpus parts

**Acceptance criteria**
- [ ] Round trip preserves geometry within tolerance and keeps names/colors
- [ ] Assembly structure imported

### WC-XCH-03 - Mesh export: STL, OBJ, glTF, 3MF

**Priority:** medium · **Agent:** A · **Labels:** exchange, mesh · **Parent:** WC-XCH · **Depends on:** WC-XCH-01, WC-EC-23

**Goal:** Export meshes with quality controls and correct units.

**Tasks**
- [ ] Quality presets (deflection/angle); units and axis conventions
- [ ] Evaluate optional compression (meshoptimizer, Draco) and its browser decode cost
- [ ] 3MF: evaluate OCCT support vs a library; verify licence

**Acceptance criteria**
- [ ] Exports open correctly in third-party viewers
- [ ] Quality presets documented

### WC-XCH-04 - Large import/export jobs

**Priority:** high · **Agent:** B · **Labels:** exchange, infra · **Parent:** WC-XCH · **Depends on:** WC-XCH-01, WC-EC-09, WC-EC-32

**Goal:** Handle files too large for a single request.

**Tasks**
- [ ] Imports via BlobRef chunked upload; exports via result_id/StreamResult or object-store link
- [ ] Background jobs with progress, cancel and deadlines
- [ ] Untrusted-input handling: size limits, pre-validation, sandbox
- [ ] Retention and cleanup of job artifacts

**Acceptance criteria**
- [ ] Multi-hundred-MB file imports and exports complete without exceeding gRPC limits
- [ ] Cancel and failure leave no leaked blobs

### WC-XCH-05 - 2D import/export: DXF and SVG

**Priority:** medium · **Agent:** B · **Labels:** exchange, 2d · **Parent:** WC-XCH · **Depends on:** WC-XCH-01

**Goal:** Bring 2D drawings into sketches and export outlines.

**Tasks**
- [ ] Parse SVG/DXF in the browser; send profiles to the kernel
- [ ] Check licences of candidate DXF libraries (many C++ DXF libraries are GPL)
- [ ] Fitting/simplification options for splines

**Acceptance criteria**
- [ ] Sample DXF/SVG files import to editable profiles
- [ ] Licence decision recorded

### WC-XCH-06 - Scene and mesh import: Assimp, USD (evaluate)

**Priority:** low · **Agent:** C · **Labels:** exchange, spike · **Parent:** WC-XCH · **Depends on:** WC-XCH-01

**Goal:** Decide whether extra mesh/scene formats are worth supporting.

**Tasks**
- [ ] Evaluate Assimp (BSD-3-Clause) and OpenUSD (modified Apache-2.0); verify licences and binary sizes
- [ ] Estimate demand and maintenance cost

**Acceptance criteria**
- [ ] Memo: adopt / defer

### WC-XCH-07 - Proprietary CAD formats decision (Parasolid, ACIS, JT)

**Priority:** medium · **Agent:** C · **Labels:** exchange, decision · **Parent:** WC-XCH · **Depends on:** WC-XCH-01

**Goal:** There is no practical open-source route; decide the commercial or customer-STEP policy.

**Tasks**
- [ ] Document demand and alternatives (customers export STEP; commercial SDKs)
- [ ] If pursued: licensing, cost and integration plan

**Acceptance criteria**
- [ ] Decision memo


---

## WC-MSH - Mesh Pipeline, LOD and Previews

Fast, small, stable meshes for large models, plus thumbnails and a possible mesh/export worker split.

**Start after:** WC-EC tessellation port and observability · **Labels:** backlog, mesh

### WC-MSH-01 - Tessellation quality presets and mesher evaluation

**Priority:** medium · **Agent:** B · **Labels:** mesh, performance · **Parent:** WC-MSH · **Depends on:** WC-EC-23, WC-EC-33

**Goal:** Per-use quality settings and a measured mesher choice.

**Tasks**
- [ ] Presets for display vs export; adaptive by object size
- [ ] Evaluate OCCT's Delabella mesher on many-hole faces (reference: 400-hole plate, 1.1 s default vs 84 ms Delabella as reported by materializr)
- [ ] Track faces that fail to triangulate

**Acceptance criteria**
- [ ] Benchmarked presets documented
- [ ] Mesher choice recorded

### WC-MSH-02 - Mesh payload optimization and delta updates

**Priority:** medium · **Agent:** B · **Labels:** mesh, protocol · **Parent:** WC-MSH · **Depends on:** WC-MSH-01, WC-EC-09

**Goal:** Send less data per edit.

**Tasks**
- [ ] Per-body hashing; only changed bodies sent
- [ ] Optional quantization/compression with measured browser decode cost
- [ ] Compatibility with the packed bytes layout in the protocol

**Acceptance criteria**
- [ ] Edit of one body transfers only that body
- [ ] Payload sizes measured before/after

### WC-MSH-03 - LOD generation and progressive loading

**Priority:** medium · **Agent:** B · **Labels:** mesh, scale · **Parent:** WC-MSH · **Depends on:** WC-MSH-01

**Goal:** Open large assemblies quickly.

**Tasks**
- [ ] Simplification (evaluate meshoptimizer, MIT)
- [ ] Progressive streaming of detail levels
- [ ] Client switching rules by screen size

**Acceptance criteria**
- [ ] Large-assembly open time target met on reference models

### WC-MSH-04 - Thumbnail and preview service

**Priority:** low · **Agent:** B · **Labels:** mesh, service · **Parent:** WC-MSH · **Depends on:** WC-EC-04

**Goal:** Server-side previews for lists and sharing.

**Tasks**
- [ ] Scale the headless snapshot renderer into a service
- [ ] Evaluate software rendering vs headless browser; caching by version hash

**Acceptance criteria**
- [ ] Thumbnail for every document version, cached

### WC-MSH-05 - Mesh/export worker split

**Priority:** medium · **Agent:** C · **Labels:** mesh, infra · **Parent:** WC-MSH · **Depends on:** WC-EC-38, WC-EC-34

**Goal:** Split meshing/export from geometry workers only when contention is measured.

**Tasks**
- [ ] Define trigger metrics from observability data
- [ ] Separate worker pool and queue; keep kernel semantics unchanged
- [ ] Rollout and rollback plan

**Acceptance criteria**
- [ ] Trigger criteria documented
- [ ] Split is a no-op until criteria are met

### WC-MSH-06 - Stable picking and topology mapping

**Priority:** high · **Agent:** B · **Labels:** mesh, topology · **Parent:** WC-MSH · **Depends on:** WC-EC-42

**Goal:** Selections survive rebuilds.

**Tasks**
- [ ] Map mesh faces/edges to persistent topology ids
- [ ] Picking BVH on the client
- [ ] Test selection stability across upstream edits

**Acceptance criteria**
- [ ] Selection persists across rebuilds on corpus parts

### WC-MSH-07 - Client rendering performance budget

**Priority:** medium · **Agent:** B · **Labels:** mesh, web · **Parent:** WC-MSH

**Goal:** Keep the web UI smooth.

**Tasks**
- [ ] Budgets: frame time, draw calls, memory
- [ ] Instancing, culling, material sharing in three.js
- [ ] Profiling dashboard in CI/e2e

**Acceptance criteria**
- [ ] Budget enforced in e2e on reference scenes


---

## WC-ASM - Assemblies and Analysis

Multi-part assemblies with mates, interference checks, measurements and mass properties. Supersedes the single 'Assembly model (backlog)' ticket in WC-EC.

**Start after:** WC-EC command API, operation log and persistent ids · **Labels:** backlog, assembly

### WC-ASM-01 - Assembly data model

**Priority:** high · **Agent:** C · **Labels:** assembly, design · **Parent:** WC-ASM · **Depends on:** WC-EC-47, WC-EC-48

**Goal:** Parts, instances and transforms referencing versioned part studios.

**Tasks**
- [ ] Reference model: part studio version + instance transform
- [ ] Command-registry operations for add/move/remove instances
- [ ] Interaction with the versioned operation log

**Acceptance criteria**
- [ ] Design doc approved
- [ ] Instances survive part edits via stable references

### WC-ASM-02 - Mates and basic kinematics

**Priority:** medium · **Agent:** C · **Labels:** assembly, solver · **Parent:** WC-ASM · **Depends on:** WC-ASM-01, WC-EC-42

**Goal:** Rigid mates (fastened, revolute, slider) and a solver.

**Tasks**
- [ ] Choose approach: custom solver vs open library (verify licences)
- [ ] Diagnostics for over/under-constrained mates
- [ ] Persistent references for mate connectors

**Acceptance criteria**
- [ ] Mates solved deterministically on test assemblies

### WC-ASM-03 - Interference detection

**Priority:** medium · **Agent:** B · **Labels:** assembly, analysis · **Parent:** WC-ASM · **Depends on:** WC-ASM-01

**Goal:** Find overlapping parts.

**Tasks**
- [ ] Exact checks with OCCT common/extrema; mesh-level pre-filter (BVH; evaluate FCL, BSD-3-Clause, or Bullet, zlib)
- [ ] Incremental recheck after edits
- [ ] Report with highlighted regions

**Acceptance criteria**
- [ ] Known interference corpus detected with no false negatives

### WC-ASM-04 - Distance, clearance and measurement tools

**Priority:** low · **Agent:** A · **Labels:** assembly, analysis · **Parent:** WC-ASM · **Depends on:** WC-ASM-01

**Goal:** Measure between shapes.

**Tasks**
- [ ] Use OCCT BRepExtrema distance tools
- [ ] Tool UI: point/edge/face to point/edge/face
- [ ] Units and precision from the policy

**Acceptance criteria**
- [ ] Measurements match oracle values within tolerance

### WC-ASM-05 - Mass properties and materials

**Priority:** low · **Agent:** A · **Labels:** assembly, analysis · **Parent:** WC-ASM · **Depends on:** WC-EC-13

**Goal:** Volume, mass, centre of mass, inertia.

**Tasks**
- [ ] Use OCCT GProp
- [ ] Material library and units
- [ ] Include in reports/exports

**Acceptance criteria**
- [ ] Values match analytic references for the oracle parts

### WC-ASM-06 - Exploded and section views

**Priority:** low · **Agent:** B · **Labels:** assembly, viz · **Parent:** WC-ASM · **Depends on:** WC-ASM-01

**Goal:** Understand assemblies visually.

**Tasks**
- [ ] Explode by direction/distance
- [ ] Section planes (client clipping + exact kernel sections where needed)

**Acceptance criteria**
- [ ] Saved views restore exactly

### WC-ASM-07 - Configurations and variants

**Priority:** medium · **Agent:** C · **Labels:** assembly, engine · **Parent:** WC-ASM · **Depends on:** WC-EC-44, WC-EC-45

**Goal:** Parameter tables producing variants.

**Tasks**
- [ ] Configuration table schema bound to feature parameters
- [ ] Rebuild per configuration with caching by chain hash
- [ ] UI for selecting/editing configurations

**Acceptance criteria**
- [ ] Two configurations of one part studio build and cache independently


---

## WC-DRW - 2D Drawings and Documentation

Drawing sheets with projected views, dimensions and export. Uses OCCT's open hidden-line removal; the project already depends on jspdf and svg2pdf.js for output.

**Start after:** WC-EC persistent ids and command registry · **Labels:** backlog, drawing

### WC-DRW-01 - Drawing document model

**Priority:** high · **Agent:** C · **Labels:** drawing, design · **Parent:** WC-DRW · **Depends on:** WC-EC-48, WC-EC-46

**Goal:** Sheets, views and annotations linked to model versions.

**Tasks**
- [ ] Schema for sheets, views, annotations
- [ ] Update policy when the model changes
- [ ] Storage via the operation log

**Acceptance criteria**
- [ ] Design doc approved

### WC-DRW-02 - Projected views with HLR

**Priority:** high · **Agent:** B · **Labels:** drawing, kernel · **Parent:** WC-DRW · **Depends on:** WC-DRW-01

**Goal:** Visible/hidden-line views from the kernel.

**Tasks**
- [ ] Use OCCT HLRBRep (exact vs polygonal; measure speed)
- [ ] Return 2D edges as packed buffers
- [ ] Section and detail views

**Acceptance criteria**
- [ ] Views match reference drawings within tolerance

### WC-DRW-03 - Dimensions and annotations

**Priority:** medium · **Agent:** B · **Labels:** drawing, topology · **Parent:** WC-DRW · **Depends on:** WC-DRW-02, WC-EC-43

**Goal:** Dimensions bound to geometry.

**Tasks**
- [ ] Reference persistent topology ids
- [ ] Re-attachment and 'reference lost' states
- [ ] Standard styles (units, tolerances)

**Acceptance criteria**
- [ ] Dimensions follow model edits or flag lost references

### WC-DRW-04 - PMI/GD&T via STEP AP242 (evaluate)

**Priority:** low · **Agent:** C · **Labels:** drawing, spike · **Parent:** WC-DRW · **Depends on:** WC-DRW-01

**Goal:** Evaluate reading/writing PMI with OCCT's XCAF support.

**Tasks**
- [ ] Scope which PMI types matter
- [ ] Round-trip tests
- [ ] Decision: build / defer

**Acceptance criteria**
- [ ] Memo with findings

### WC-DRW-05 - Drawing export: PDF, SVG, DXF

**Priority:** medium · **Agent:** A · **Labels:** drawing, export · **Parent:** WC-DRW · **Depends on:** WC-DRW-02

**Goal:** Output drawings.

**Tasks**
- [ ] PDF via the existing jspdf/svg2pdf.js dependencies; SVG; DXF (see exchange epic for licences)
- [ ] Title blocks and templates
- [ ] Page sizes and scaling

**Acceptance criteria**
- [ ] Exported PDF matches on-screen layout

### WC-DRW-06 - BOM and tables

**Priority:** low · **Agent:** A · **Labels:** drawing, assembly · **Parent:** WC-DRW · **Depends on:** WC-DRW-01

**Goal:** Bills of materials from assemblies.

**Tasks**
- [ ] Derive from the assembly model
- [ ] Balloons and table styles
- [ ] CSV/PDF output

**Acceptance criteria**
- [ ] BOM matches assembly contents


---

## WC-SKT - Sketch Solver and Sketch Tools

Choose and harden the 2D constraint solver and sketch tooling. Complements the single server-side re-solve ticket in WC-EC.

**Start after:** WC-EC feature graph and server-side sketch re-solve · **Labels:** backlog, sketch

### WC-SKT-01 - Solver evaluation and decision

**Priority:** high · **Agent:** C · **Labels:** sketch, spike · **Parent:** WC-SKT · **Depends on:** WC-EC-50

**Goal:** Pick the long-term solver.

**Tasks**
- [ ] Candidates: existing TypeScript solver, SolidCraft's sketch crate (MIT or Apache per its README), FreeCAD planegcs and SolveSpace's solver (verify licences; SolveSpace's is GPL)
- [ ] Criteria: DOF reporting, redundant/conflicting detection, performance at 200+ entities, determinism, licence, wasm/node support
- [ ] Decision memo

**Acceptance criteria**
- [ ] Memo with benchmarks and recommendation

### WC-SKT-02 - Constraint diagnostics and feedback

**Priority:** medium · **Agent:** B · **Labels:** sketch, ux · **Parent:** WC-SKT · **Depends on:** WC-SKT-01

**Goal:** Tell users why a sketch is stuck.

**Tasks**
- [ ] Expose solved/unsolved, remaining freedom, conflicting and redundant constraints
- [ ] Highlight offending entities
- [ ] Cancelable large solves

**Acceptance criteria**
- [ ] Diagnostics correct on a library of broken sketches

### WC-SKT-03 - Regions, offsets and 2D booleans

**Priority:** medium · **Agent:** B · **Labels:** sketch, kernel · **Parent:** WC-SKT

**Goal:** Planar region handling.

**Tasks**
- [ ] Closed-region detection with holes
- [ ] Offsets and planar booleans via OCCT
- [ ] Checks after each operation

**Acceptance criteria**
- [ ] Region and offset results validated on corpus

### WC-SKT-04 - Sketch import: SVG and DXF

**Priority:** low · **Agent:** B · **Labels:** sketch, exchange · **Parent:** WC-SKT

**Goal:** Import 2D vector data into sketches.

**Tasks**
- [ ] Browser-side parsing; fitting and simplification
- [ ] Constraint inference options

**Acceptance criteria**
- [ ] Imported files become editable sketches

### WC-SKT-05 - Model references in sketches

**Priority:** high · **Agent:** B · **Labels:** sketch, topology · **Parent:** WC-SKT · **Depends on:** WC-EC-42

**Goal:** Project/intersect model geometry.

**Tasks**
- [ ] Use persistent topology references
- [ ] Lost-reference states

**Acceptance criteria**
- [ ] Projected geometry follows upstream edits

### WC-SKT-06 - Solver determinism and client/server agreement tests

**Priority:** medium · **Agent:** A · **Labels:** sketch, testing · **Parent:** WC-SKT · **Depends on:** WC-SKT-01

**Goal:** Same sketch, same result on client and server.

**Tasks**
- [ ] Golden sketches with expected solved coordinates
- [ ] Run on client and Node
- [ ] Tolerance and tie-breaking rules

**Acceptance criteria**
- [ ] Agreement test in CI


---

## WC-MFG - Sheet Metal and Manufacturing Preparation

Flat patterns, bends and manufacturing outputs. Exploratory: validate demand before building.

**Start after:** WC-GEO validity policy and WC-XCH 2D export · **Labels:** backlog, manufacturing

### WC-MFG-01 - Demand validation and scope

**Priority:** medium · **Agent:** C · **Labels:** manufacturing, decision · **Parent:** WC-MFG

**Goal:** Decide which manufacturing features matter.

**Tasks**
- [ ] Interview/usage data; shortlist (sheet metal, hole/thread wizard, CAM prep)
- [ ] Go/no-go per feature

**Acceptance criteria**
- [ ] Scope memo

### WC-MFG-02 - Sheet-metal model and unfolding

**Priority:** medium · **Agent:** C · **Labels:** manufacturing, kernel · **Parent:** WC-MFG · **Depends on:** WC-MFG-01

**Goal:** Thickness, bend radius, K-factor, flat pattern.

**Tasks**
- [ ] Data model for sheet-metal features
- [ ] Unfold algorithm: evaluate reusing SolidCraft's sheet-metal (MIT or Apache per its README) vs implementing; materializr's unfold is GPLv3 (reference only)
- [ ] Deformation review

**Acceptance criteria**
- [ ] Flat pattern of reference parts within tolerance

### WC-MFG-03 - Flat pattern export for cutting

**Priority:** medium · **Agent:** B · **Labels:** manufacturing, export · **Parent:** WC-MFG · **Depends on:** WC-MFG-02

**Goal:** DXF/SVG outlines with bend lines.

**Tasks**
- [ ] Layer conventions and units
- [ ] Nesting out of scope

**Acceptance criteria**
- [ ] Exported outlines open in common tools

### WC-MFG-04 - Hole and thread features

**Priority:** low · **Agent:** B · **Labels:** manufacturing, kernel · **Parent:** WC-MFG · **Depends on:** WC-MFG-01

**Goal:** Standard holes and threads.

**Tasks**
- [ ] Hole/thread tables
- [ ] Performance on long threads (materializr reverted from OCCT 8.0.0 after a long-rod thread-generation hang; include in the version gate)

**Acceptance criteria**
- [ ] Long-thread cases pass on the baseline kernel


---

## WC-COL - Collaboration, Versioning and Sharing

Multi-user workflows on top of the server-owned document. Features stay operation-log based; any CRDT use is limited to presence.

**Start after:** WC-EC operation log, document actor and concurrent writers · **Labels:** backlog, collaboration

### WC-COL-01 - Presence and cursors

**Priority:** medium · **Agent:** B · **Labels:** collab, realtime · **Parent:** WC-COL · **Depends on:** WC-EC-49

**Goal:** See who is in the document.

**Tasks**
- [ ] Server-streaming presence events
- [ ] Evaluate Yjs awareness only for presence; no CRDT for features
- [ ] Client-to-server rate limits (unary calls)

**Acceptance criteria**
- [ ] Two users see each other's presence

### WC-COL-02 - Version history and compare

**Priority:** high · **Agent:** B · **Labels:** collab, versioning · **Parent:** WC-COL · **Depends on:** WC-EC-48

**Goal:** Browse, name, restore and diff versions.

**Tasks**
- [ ] Version list UI
- [ ] Feature-level diff
- [ ] Restore as a new version

**Acceptance criteria**
- [ ] Restore and compare work on reference documents

### WC-COL-03 - Branch and merge (research)

**Priority:** low · **Agent:** C · **Labels:** collab, spike · **Parent:** WC-COL · **Depends on:** WC-EC-52

**Goal:** Branching semantics for parametric history.

**Tasks**
- [ ] Rebase rules per command type
- [ ] Conflict surfacing
- [ ] Decision memo

**Acceptance criteria**
- [ ] Memo

### WC-COL-04 - Comments anchored to references

**Priority:** medium · **Agent:** B · **Labels:** collab, topology · **Parent:** WC-COL · **Depends on:** WC-EC-42

**Goal:** Comments tied to persistent references.

**Tasks**
- [ ] Anchor model; lost-anchor behavior
- [ ] Notifications

**Acceptance criteria**
- [ ] Comments follow edits or show orphaned state

### WC-COL-05 - Permissions, sharing and audit log

**Priority:** high · **Agent:** C · **Labels:** collab, security · **Parent:** WC-COL · **Depends on:** WC-EC-37

**Goal:** Roles and link sharing.

**Tasks**
- [ ] Roles: view/comment/edit; org/team model
- [ ] Share links with expiry
- [ ] Audit log of edits and access

**Acceptance criteria**
- [ ] Policy doc approved; enforcement tested

### WC-COL-06 - Writer-lock UX and conflict handling

**Priority:** medium · **Agent:** B · **Labels:** collab, ux · **Parent:** WC-COL · **Depends on:** WC-EC-52

**Goal:** Clear behavior when editing collides.

**Tasks**
- [ ] Lock acquisition/release/timeouts
- [ ] Stale base-version messaging
- [ ] Reconnect behavior

**Acceptance criteria**
- [ ] UX flows tested in e2e

### WC-COL-07 - Offline and local-fallback reconciliation (research)

**Priority:** low · **Agent:** C · **Labels:** collab, spike · **Parent:** WC-COL

**Goal:** What happens when the browser falls back to the WASM kernel.

**Tasks**
- [ ] Define allowed offline edits
- [ ] Reconcile on reconnect
- [ ] Risks of kernel version differences

**Acceptance criteria**
- [ ] Memo with recommendation


---

## WC-PLT - Platform Scaling and Operations

Run the engine reliably for many users: capacity, deploys, storage and security operations.

**Start after:** WC-EC compose, observability and benchmark · **Labels:** backlog, platform

### WC-PLT-01 - Kernel fleet autoscaling and routing

**Priority:** high · **Agent:** C · **Labels:** platform, scale · **Parent:** WC-PLT · **Depends on:** WC-EC-33, WC-EC-34

**Goal:** Scale kernel processes with load.

**Tasks**
- [ ] Capacity model from the benchmark; sessions per host
- [ ] Sticky routing by client-generated session id
- [ ] Drain on deploy

**Acceptance criteria**
- [ ] Load test meets targets

### WC-PLT-02 - Multi-tenancy quotas and accounting

**Priority:** medium · **Agent:** B · **Labels:** platform, tenancy · **Parent:** WC-PLT · **Depends on:** WC-EC-32

**Goal:** Fair use and cost visibility.

**Tasks**
- [ ] Per-org limits (sessions, memory, uploads)
- [ ] Usage metering

**Acceptance criteria**
- [ ] Quota breaches return the defined errors

### WC-PLT-03 - Storage lifecycle

**Priority:** medium · **Agent:** B · **Labels:** platform, storage · **Parent:** WC-PLT

**Goal:** Retention and cleanup.

**Tasks**
- [ ] Retention for uploads, results, blobs and B-rep revisions
- [ ] Garbage collection
- [ ] Storage cost reporting

**Acceptance criteria**
- [ ] No orphaned blobs after soak test

### WC-PLT-04 - Backups and disaster recovery

**Priority:** high · **Agent:** C · **Labels:** platform, reliability · **Parent:** WC-PLT

**Goal:** Protect customer data.

**Tasks**
- [ ] Postgres and object-store backups
- [ ] RPO/RTO targets and restore drills

**Acceptance criteria**
- [ ] Restore drill passed

### WC-PLT-05 - SLOs, tracing and alerting

**Priority:** medium · **Agent:** B · **Labels:** platform, observability · **Parent:** WC-PLT · **Depends on:** WC-EC-38

**Goal:** Beyond basic metrics.

**Tasks**
- [ ] SLOs for latency/error budgets
- [ ] End-to-end tracing browser to kernel
- [ ] Alert routing

**Acceptance criteria**
- [ ] Dashboards and alerts live

### WC-PLT-06 - Release engineering: rolling deploys and version skew

**Priority:** high · **Agent:** C · **Labels:** platform, release · **Parent:** WC-PLT · **Depends on:** WC-EC-40, WC-EC-09

**Goal:** Safe upgrades.

**Tasks**
- [ ] Rolling deploys with session drain
- [ ] Protocol version skew policy
- [ ] Canary kernel versions (7.9.3 vs 8.0.x)

**Acceptance criteria**
- [ ] Upgrade rehearsal without data loss

### WC-PLT-07 - Security hardening

**Priority:** high · **Agent:** C · **Labels:** platform, security · **Parent:** WC-PLT · **Depends on:** WC-EC-37

**Goal:** Ongoing hardening.

**Tasks**
- [ ] Dependency and image scanning
- [ ] Secrets rotation
- [ ] External penetration test
- [ ] Kernel sandbox profile review

**Acceptance criteria**
- [ ] Findings tracked to closure


---

## WC-AGT - Automation, Scripting and Agent Access

Expose the command registry to scripts, CI and AI agents (the pattern SolidCraft documents with a headless CLI and MCP server).

**Start after:** WC-EC command registry · **Labels:** backlog, automation

### WC-AGT-01 - Versioned scripting API

**Priority:** high · **Agent:** B · **Labels:** automation, api · **Parent:** WC-AGT · **Depends on:** WC-EC-46

**Goal:** Public JSON script format over the registry.

**Tasks**
- [ ] Script schema and versioning
- [ ] Validation and dry-run
- [ ] Error reporting

**Acceptance criteria**
- [ ] Recorded scripts replay headlessly

### WC-AGT-02 - Headless CLI runner

**Priority:** medium · **Agent:** A · **Labels:** automation, cli · **Parent:** WC-AGT · **Depends on:** WC-AGT-01

**Goal:** Run scripts in CI and batch.

**Tasks**
- [ ] CLI wrapping the session/registry
- [ ] Exit codes and artifacts
- [ ] Use in the oracle/parity suites

**Acceptance criteria**
- [ ] CI job runs a script and compares outputs

### WC-AGT-03 - MCP server for agents

**Priority:** medium · **Agent:** C · **Labels:** automation, agents · **Parent:** WC-AGT · **Depends on:** WC-AGT-01

**Goal:** Expose commands as tools.

**Tasks**
- [ ] Auth, scopes and rate limits
- [ ] Command allowlist; treat tool outputs and document contents as data
- [ ] Audit trail with 'agent' as author

**Acceptance criteria**
- [ ] Security review passed; agent can build a sample part

### WC-AGT-04 - API keys, webhooks and batch jobs

**Priority:** low · **Agent:** B · **Labels:** automation, integration · **Parent:** WC-AGT · **Depends on:** WC-AGT-01

**Goal:** Programmatic integration.

**Tasks**
- [ ] API keys and scopes
- [ ] Webhooks for completed jobs
- [ ] Batch export jobs

**Acceptance criteria**
- [ ] Integration test with a sample client

### WC-AGT-05 - Agent-in-the-loop UX

**Priority:** medium · **Agent:** B · **Labels:** automation, ux · **Parent:** WC-AGT · **Depends on:** WC-EC-51

**Goal:** Safe human oversight.

**Tasks**
- [ ] Group agent actions for undo
- [ ] Preview/confirm destructive operations
- [ ] Attribution in version history

**Acceptance criteria**
- [ ] Agent edits are undoable as one unit

### WC-AGT-06 - Extension/plugin sandbox (evaluate)

**Priority:** low · **Agent:** C · **Labels:** automation, spike · **Parent:** WC-AGT · **Depends on:** WC-AGT-01

**Goal:** Decide whether to allow third-party extensions.

**Tasks**
- [ ] Review SolidCraft's documented plugin sandbox (WASM with resource limits) and alternatives
- [ ] Threat model and decision

**Acceptance criteria**
- [ ] Memo


---

## WC-LIC - Licensing, Compliance and Customer Data

Resolve licence questions raised during design and protect customer CAD data. Not legal advice; items need legal review.

**Start after:** Start early: feeds the kernel ADR · **Labels:** backlog, compliance

### WC-LIC-01 - OCCT licence decision

**Priority:** high · **Agent:** C · **Labels:** compliance, legal · **Parent:** WC-LIC · **Depends on:** WC-EC-05

**Goal:** LGPL-2.1 with exception vs a commercial licence.

**Tasks**
- [ ] Hosted-only vs distributed binaries; static vs dynamic linking
- [ ] Ask Open Cascade about commercial terms (their own demos run under a commercial licence)
- [ ] Legal review and written decision

**Acceptance criteria**
- [ ] Decision recorded in the ADR

### WC-LIC-02 - Third-party inventory and SBOM automation

**Priority:** high · **Agent:** A · **Labels:** compliance, supply-chain · **Parent:** WC-LIC

**Goal:** Know exactly what ships.

**Tasks**
- [ ] SBOM for kernel image, gateway and web app
- [ ] Generate notices page automatically
- [ ] Fail CI on unapproved licences

**Acceptance criteria**
- [ ] SBOM and notices produced in CI

### WC-LIC-03 - Fonts and assets for the text tool

**Priority:** medium · **Agent:** B · **Labels:** compliance, assets · **Parent:** WC-LIC

**Goal:** Licences for fonts served to browsers.

**Tasks**
- [ ] Inventory candidate fonts and licences
- [ ] Attribution and redistribution requirements
- [ ] Choose the shipped set

**Acceptance criteria**
- [ ] Approved font list with notices

### WC-LIC-04 - Code-reuse and clean-room policy

**Priority:** high · **Agent:** C · **Labels:** compliance, policy · **Parent:** WC-LIC · **Depends on:** WC-EC-02

**Goal:** Rules for humans and agents.

**Tasks**
- [ ] Agent guidance in AGENTS.md

**Acceptance criteria**
- [ ] Policy published; PR checklist item added

### WC-LIC-05 - Customer data protection

**Priority:** high · **Agent:** C · **Labels:** compliance, security · **Parent:** WC-LIC

**Goal:** Customer CAD files are sensitive IP.

**Tasks**
- [ ] Encryption in transit/at rest
- [ ] Retention and deletion on request
- [ ] Tenant isolation review
- [ ] Kernel sandbox data-access rules

**Acceptance criteria**
- [ ] Review completed with a gap list
