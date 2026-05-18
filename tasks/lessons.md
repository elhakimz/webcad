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


