# SCAD Interpreter for WebCAD

This directory contains the implementation of an OpenSCAD-compatible interpreter that targets the OpenCascade.js rendering engine.

## Architecture

- **`parser/`**: Lexical analysis and grammar (e.g., using a parser generator or custom recursive descent). Converts `.scad` text into an AST.
- **`ast/`**: Type definitions for the Abstract Syntax Tree.
- **`interpreter/`**: Logic for evaluating the AST. Handles:
    - Scopes and variables.
    - Control flow (`if`, `for`).
    - Module and function calls.
- **`core/`**: Implementation of built-in functions (e.g., `sin`, `cos`, `lookup`) and constants.
- **`bridge/`**: The mapping layer between evaluated SCAD primitives (e.g., `cube`, `sphere`, `union`) and `OpenCascadeService` calls.
- **`ScadManager.ts`**: The public API for parsing and executing SCAD code within the WebCAD environment.

## Workflow

1. **Parse**: Text $\to$ AST.
2. **Evaluate**: AST + Context $\to$ Geometry Tree.
3. **Render**: Geometry Tree $\to$ OpenCascade B-Rep $\to$ Three.js BufferGeometry.
