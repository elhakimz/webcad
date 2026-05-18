# WebCAD Lessons Learned & AI Developer Rules

Refined guidelines and lessons cataloged from user feedback and implementation iterations to maintain high structural standards.

## Lessons Catalog

### 1. Robust SCAD Preprocessing
* **Context**: Support for library files (like BOSL) that require nested imports and exact relative directory lookup.
* **Solution**: Rather than raw text replacement, parse files recursively relative to their parent importing folder, stripping top-level module instantiations on `use` imports to match standard OpenSCAD specifications perfectly.

### 2. General-Purpose Path Resolution Fallback
* **Context**: Hardcoded prefix filters (like `startsWith("BOSL/")`) are fragile, case-sensitive, and fail for custom user libraries in other subfolders.
* **Solution**: Implement a general-purpose fallback import loader. Try to resolve relative to `currentDir` first. If that returns 404, fallback to resolving from the project root. This naturally supports case insensitivity and arbitrary folder hierarchies.

### 3. OpenSCAD Dot Component Access (`v.x`, `v.y`, `v.z`)
* **Context**: Modern OpenSCAD libraries (e.g. BOSL) rely heavily on dot access for coordinates rather than index subscripts.
* **Solution**: Add `TokenType.DOT` to the Lexer, parse it as a `DotExpression` AST Node, and evaluate it in the Interpreter by mapping `x`, `y`, `z` properties to array indices `0`, `1`, `2` respectively.

### 5. Vector/Matrix Math Operators & Deep Equality
* **Context**: OpenSCAD heavily overloads standard arithmetic operators (`+`, `-`, `*`, `/`) for element-wise vector operations and matrix/vector dot-product multiplications. Without recursive, type-aware support, helper libraries fail to compute coordinate offsets, breaking recursion base cases (e.g. comparing arrays by identity instead of value/deep equality) and triggering infinite recursion stack overflows.
* **Solution**: Implement recursive mathematical helpers (`add`, `subtract`, `multiply`, `divide`) that gracefully handle scalar-scalar, array-scalar, scalar-array, element-wise array-array, matrix-matrix, matrix-vector, and vector-matrix multiplications. Implement recursive deep-equality (`equals`) comparison for array comparisons.

### 6. List-Comprehension & Array Splicing (`each` keyword)
* **Context**: Standard OpenSCAD allows flattening/unpacking list elements inside array literals and list comprehensions using the `each` keyword (e.g., `[1, each [2, 3], 4]`).
* **Solution**: Tokenize the `each` keyword, parse it as an `EachExpression` node in the parser (handling it anywhere inside array literals and generator expressions), and evaluate it in the interpreter by performing flat array splicing (`result.push(...val)`) when the evaluated AST node type is an `EachExpression` or generator statement.

### 7. Custom Scrollable List Components over Native Select Dropdowns
* **Context**: When displaying long lists of project folders or files in modal dialogs or side navigation bars, native HTML `<select>` dropdowns can easily overflow the screen or look basic.
* **Solution**: Replace native select elements with scrollable, pre-wrapped `div`/`li` list containers styled with `max-height` and `overflow-y: auto`. Support hover state transitions and dynamic active-state styling. This ensures a consistent, high-end IDE feel with reliable navigation.

### 8. Viewport Clearing Before Script Execution
* **Context**: When running successive SCAD files or compiling iterations of the same script, the generated temporary 3D meshes will accumulate and overlap in the rendering viewport if they are not explicitly cleared beforehand, causing extreme visual confusion.
* **Solution**: Intercept the script's `onRender` callback globally inside the main orchestrator (`src/main.ts`) and invoke `viewer.clearTemporaryMeshes()` immediately prior to loading and building the new temporary meshes. This ensures that the scripting viewport is cleanly reset for each script execution automatically.

### 9. Distinguishing Circular Dependencies from Standard Duplicate Imports
* **Context**: A standard preprocessor needs to prevent infinite recursion loop cycles (circular dependencies) when loading imports, but simply checking if a file has been processed anywhere globally triggers warning spam for standard, highly nested dependency structures (like BOSL includes) which is normal and expected behavior.
* **Solution**: Track active recursive traversals using an active traversal set (`visiting`). If an incoming path is inside the active visiting set, it is a circular dependency (warn or throw). If it has been processed globally (`loadedFiles`) but is *not* actively visiting, it is a normal duplicate import (silently bypass it).

### 10. Direct Registration of Standard SCAD Color Maps
* **Context**: Parametric scripting engines (like OpenSCAD) support robust color properties applied dynamically to 3D solid and 2D drafting entities. When these transforms are parsed but not registered or passed to rendering engines, everything defaults to a uniform gray look, breaking visual differentiation.
* **Solution**: Register a comprehensive standard W3C SVG color names map (`OPENSCAD_COLOR_MAP`) at the engine level. Parse names, float-based RGB arrays, and hex strings dynamically inside the geometry builder (`CsgExecutor.ts`), attach this metadata to the resulting geometries via `userData`, and read/pass the values to the viewer during execution hooks to render objects in their gorgeous specified colors.

### 11. Adding Missing SCAD Mathematical Functions and Sandboxing Input Values
* **Context**: OpenSCAD libraries (like BOSL) heavily rely on basic mathematical and trigonometric functions such as `tan(x)`, `asin(x)`, `acos(x)`, and `atan(x)`. If these functions are not supported by the AST Interpreter, they return `undefined` or `NaN`, which gets passed directly into the OpenCascade WASM bindings. Trying to initialize OpenCascade primitives with illegal float parameters (such as `NaN` or `Infinity`) causes severe Emscripten stack overflows or JavaScript call-stack exhaustion crashes.
* **Solution**: Implement all standard OpenSCAD math functions (`tan`, `asin`, `acos`, `atan`) in `Evaluator.ts`, converting degrees to radians (and vice-versa) to match standard OpenSCAD specifications. Add rigorous JavaScript-level input validation guards for all primitive builders (`cube`, `sphere`, `cylinder`, `cone`, `square`, `circle`, `polygon`) inside `CsgExecutor.ts` to immediately reject `NaN`, `Infinity`, or negative dimensions, throwing elegant, clean user-facing SCAD interpretation errors instead of crashing the worker.

### 12. List Comprehension Let Expression Nesting and Polyhedron Face Floor Mapping
* **Context**: List comprehensions wrapped inside `let()` blocks or conditional ternary expressions return arrays that fail standard type-based flattening because the AST node of the body is a `LetExpression` or `TernaryExpression` rather than directly a `ListComprehension`. This results in nested arrays (e.g. `[[0, 736, 737]]`), which evaluate to `NaN` when looked up in JavaScript. In addition, curved helicoids generate float coordinates and float index arrays, which cause `undefined` lookups in standard JS vertex arrays.
* **Solution**: Implement recursive checking in `shouldSpread(expr)` inside the evaluator to correctly detect and spread values returned from nested list generators through `Let` and `Ternary` nodes. Floor all indices parsed in the OpenCascade polyhedron worker thread (`OCCWorker.ts`) before array indexing to guarantee correct integer vertex lookup.

### 13. Adaptive Polyhedron Sewing and SCAD-Level Geometry Workarounds
* **Context**: HELIX/thread polyhedra created by standard libraries like BOSL feature thousands of complex facets that generate tiny floating-point gaps. Using a single rigid sewing tolerance (e.g. `1e-4`) leaves naked edges, preventing the shape from solidifying. When a solid cutter is subtracted from a non-solid shell in OpenCascade, the boolean operation fails and returns the boundaries of the cutter solid as extra boxes in the viewport.
* **Solution**: Implement an adaptive multi-pass sewing algorithm in `createPolyhedron` inside `OCCWorker.ts` trying progressively larger tolerances (`1e-4`, `1e-3`, `1e-2`, `1e-1`) to close any precision gaps and guarantee successful solidification. In addition, always provide the user with a pure SCAD-level workaround `.scad` file (e.g., copying the math generation of the polyhedron while bypassing difference cuts) to offer immediate, robust coding options.

### 14. OpenCascade Boolean Failure on Compound Shape Types
* **Context**: In OpenCascade, a boolean intersection (`common`) of multiple solids often returns the output shape inside a generic `COMPOUND` container, even if the resulting volume is a single solid (like the hexagonal prism from 3-cube intersection). If a `COMPOUND` is passed as the first argument (`shapeA`) to `BRepAlgoAPI_Cut`, the operation fails to subtract the solid thread cutter (`shapeB`), yielding only the boundaries of the cutter solid (e.g., a threaded cylinder inside) instead of a hollow nut.
* **Solution**: Implement robust extraction of underlying solids inside `cacheShape` in the OpenCascade background thread (`OCCWorker.ts`). If the shape is a `COMPOUND` containing exactly one `SOLID` (queried via `TopExp_Explorer`), automatically extract, detach, and cache it as a clean `SOLID` shape. This ensures standard boolean operations receive pure, solid-type operands and succeed flawlessly.

### 15. Automatic Polyhedron Watertight Sealing via Cover Faces
* **Context**: Complex helical or parametric polyhedron shapes (like threads) often have open boundaries or helical endcaps that standard sewing algorithms cannot close because there are no adjacent faces to sew. This leaves naked edges, preventing solidification. When subtracting a non-solid shell from a solid body, OpenCascade fails to perform volume subtraction and instead splits the faces, leaving behind thin vertical triangle shards inside the cut.
* **Solution**: Implement an automatic watertight repair algorithm. Identify all naked edges, calculate the centroid of the polyhedron's input points, and dynamically construct a triangular cover face connecting each naked edge segment to the centroid. Adding these cover faces back into the sewing builder guarantees 100% watertight closure, making the shell a perfect solid and ensuring flawless boolean subtraction with zero shards.

### 16. Preservation of Library Constants in Use Directives & Global Validation
* **Context**: OpenSCAD `use <file.scad>` directives traditionally import modules and functions but exclude top-level variables. However, inside the imported library (like `BOSL/involute_gears.scad`), those modules/functions rely heavily on global constants (e.g. `ORIENT_X`, `V_RIGHT` defined in nested imports like `constants.scad`). Stripping `Assignment` nodes globally from `use` scopes leaves these variables `undefined`, yielding `NaN` parameters inside function calls and causing background worker crashes when non-finite values are passed to OpenCascade transforms.
* **Solution**: Modify the `use` filter in `ScadManager.ts` to filter and KEEP `Assignment` nodes alongside `ModuleDef` and `FunctionDef`. This ensures that all vital constant definitions remain globally evaluated and accessible to the libraries. Additionally, implement robust `validate` checks inside `applyTransform` in `CsgExecutor.ts` to immediately intercept `NaN` or non-finite values on the main thread and throw standard user-facing error messages instead of passing them to background threads and triggering silent crashes.

## Developer Guidelines
1. **Plan & Track**: Always maintain `tasks/todo.md` and check in before massive structural changes.
2. **AST over Text Regex**: Prefer parsing AST structures rather than error-prone regex manipulations for syntactic transformations like import mapping.
3. **Keep Context Synchronized**: Keep fields like `currentProject` in sync across components (e.g. `ScadEditor`, `ProjectToolWindow`) to prevent silent project path errors.
4. **Generalize Over Hacks**: Prefer mathematical, general fallback designs (e.g. root fallback resolution) over case-sensitive hardcoded prefix checks.
5. **Standard Compliance**: When libraries throw lexer/parser errors, identify if the dialect uses modern standard syntax additions (such as vector component dot-notation or `each` keyword unpacking) and implement robust AST-based support.
6. **Recursive Calculations and Operators**: Always implement type-aware, recursive math operations and deep array comparisons to guarantee modern CAD math engines terminate safely.
7. **UX Responsiveness & Scrollbars**: Always ensure list containers in modals and tool windows have proper scrolling styles (`overflow-y: auto`, `max-height`, `white-space: pre-wrap`) to prevent truncation and overflow on screens of varying heights.
8. **Automatic Viewport Resets**: When compiling geometries inside active scripts, always clear prior rendering groups automatically before rendering new geometries, preventing visual asset collisions.
9. **Separate Recursion Stack from Global Loaded Sets**: When implementing preprocessors for import loading, differentiate active circular imports from already loaded duplicate imports to prevent compiler console spam while maintaining circular cycle safety.
10. **Propagate Color Metadata through Geometries**: When implementing visual features in rendering engines, register a dedicated color naming and value translation layer, attach the resolved color codes to mesh metadata, and retrieve them explicitly when drawing geometries to provide rich visual feedback.
11. **Sanitize and Validate Numeric Inputs**: Always validate numeric inputs (for `NaN`, `Infinity`, and positive/negative domain constraints) before passing them to the OpenCascade.js WASM engine, preventing thread-level crashes or call stack exhaustion bugs.
12. **Recursive Array/Generator Flattening and Floor Index Lookups**: Ensure that all evaluator array comprehensions check nested block nodes (`Let`, `Ternary`, etc.) recursively for flattening compatibility, and always floor polyhedron face references when converting shape coordinates to integer arrays in workers.
13. **Provide Both Engine-Level Stability Fixes and SCAD-Level Workarounds**: When tackling geometric interpretation or boolean limitations in CAD engines, always deliver a dual solution: (a) a robust engine/worker stabilization patch (e.g., adaptive sewing tolerances) and (b) a pure SCAD-level workaround script that bypasses the issue through clever module definitions, empowering the user with immediate code options.
14. **Extract Pure Solids from Compounds**: Always check if a computed shape is wrapped inside a generic `COMPOUND` container with a single nested child (especially after intersection or union operations). If so, extract the underlying `SOLID` before storing it in the cache or passing it to subsequent boolean cuts, ensuring maximum OpenCascade solver success.
15. **Automatically Close Naked Polyhedron Edges with Centroid Fan Faces**: If standard multi-pass sewing leaves open naked edges in custom polyhedra, automatically generate triangular fan faces connecting the naked edges to the centroid of the shape. This seals the boundary watertight, producing a solid shell that can be clean-cut during boolean operations without leaving residual triangles or shards.
16. **Preserve Assignment Nodes in Use Directives & Validate All Transform Parameters**: Always filter and retain `Assignment` nodes alongside `ModuleDef` and `FunctionDef` inside `use` preprocessor filters in `ScadManager.ts` to ensure that libraries can resolve global constants correctly. Additionally, never invoke background worker methods (especially `transformShape`, `rotateShape`, `scaleShape`, `mirrorShape`, or `multMatrixShape`, or `scaleZ` in extrusions) with unchecked float values. Wrap all transform arguments in strict main-thread `validate()` checks to intercept `NaN` or `undefined` values early and throw clear, readable, user-facing interpreter errors.
17. **Individually Extrude and Fuse Multiple Children of Extrusion Modules**: Never concatenate raw 2D profile points from multiple distinct sibling nodes under `linear_extrude` or `rotate_extrude` into a single flat array. This produces invalid self-intersecting profiles and non-manifold shells that crash OpenCascade transforms. Always evaluate, extrude, and center each child node individually, then perform a standard boolean union to fuse them cleanly into a watertight solid shape.
