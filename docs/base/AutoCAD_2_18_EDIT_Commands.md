# AutoCAD 2.18 (DOS) EDIT Commands: Reference & Pseudocode

AutoCAD 2.18 (released in 1985) featured a core set of editing commands that form the foundation of any CAD system. If you are building a JavaScript clone, implementing these functions requires basic linear algebra (translation, rotation, scaling matrices) and entity management.

Below is the list of primary EDIT commands from that era, along with descriptions and JavaScript pseudocode to help you structure your clone.

---

## 1. ERASE
**Description:** Removes selected entities from the drawing database.
**JS Clone Concept:** Filter the main entity array or flag entities as `deleted` (useful for UNDO functionality).
pseudocode:
```javascript
function cmdErase(selectedEntities, drawingDatabase) {
    selectedEntities.forEach(entity => {
        // Option A: Hard delete
        // drawingDatabase.remove(entity.id);
        
        // Option B: Soft delete (better for UNDO/REDO support)
        entity.isDeleted = true;
    });
    renderCanvas();
}
```

## 2. MOVE
**Description:** Displaces selected objects by a specified distance in a specified direction (using a base point and a second point of displacement).
**JS Clone Concept:** Calculate the delta (dx, dy) between the two points and apply a translation matrix to all vertices of the selected entities.
pseudocode:
```javascript
function cmdMove(selectedEntities, basePoint, targetPoint) {
    const dx = targetPoint.x - basePoint.x;
    const dy = targetPoint.y - basePoint.y;

    selectedEntities.forEach(entity => {
        entity.vertices.forEach(vertex => {
            vertex.x += dx;
            vertex.y += dy;
        });
        entity.updateBoundingBox();
    });
    renderCanvas();
}
```

## 3. COPY
**Description:** Functions exactly like MOVE, but leaves the original objects intact and applies the displacement to a cloned set of objects.
**JS Clone Concept:** Deep clone the entities, apply the translation, and push them to the drawing database.
pseudocode:
```javascript
function cmdCopy(selectedEntities, basePoint, targetPoint, drawingDatabase) {
    const dx = targetPoint.x - basePoint.x;
    const dy = targetPoint.y - basePoint.y;

    selectedEntities.forEach(entity => {
        // Deep clone the entity to sever references
        let newEntity = entity.clone(); 
        
        newEntity.vertices.forEach(vertex => {
            vertex.x += dx;
            vertex.y += dy;
        });
        
        drawingDatabase.add(newEntity);
    });
    renderCanvas();
}
```

## 4. ROTATE
**Description:** Rotates existing objects around a specified base point by a specified angle.
**JS Clone Concept:** Apply a 2D rotation matrix relative to the base point.
pseudocode:
```javascript
function cmdRotate(selectedEntities, basePoint, angleDegrees) {
    const angleRad = angleDegrees * (Math.PI / 180);
    const cosA = Math.cos(angleRad);
    const sinA = Math.sin(angleRad);

    selectedEntities.forEach(entity => {
        entity.vertices.forEach(vertex => {
            // Translate point back to origin
            let tempX = vertex.x - basePoint.x;
            let tempY = vertex.y - basePoint.y;

            // Apply rotation matrix
            let rotatedX = (tempX * cosA) - (tempY * sinA);
            let rotatedY = (tempX * sinA) + (tempY * cosA);

            // Translate back to basePoint
            vertex.x = rotatedX + basePoint.x;
            vertex.y = rotatedY + basePoint.y;
        });
    });
    renderCanvas();
}
```

## 5. SCALE
**Description:** Enlarges or reduces selected objects equally in the X and Y directions, relative to a base point.
**JS Clone Concept:** Multiply the distance of each vertex from the base point by the scale factor.

pseudocode:
```javascript
function cmdScale(selectedEntities, basePoint, scaleFactor) {
    selectedEntities.forEach(entity => {
        entity.vertices.forEach(vertex => {
            let dx = vertex.x - basePoint.x;
            let dy = vertex.y - basePoint.y;

            vertex.x = basePoint.x + (dx * scaleFactor);
            vertex.y = basePoint.y + (dy * scaleFactor);
        });
        
        // Handle specific attributes like circle radius or text height
        if (entity.type === 'CIRCLE') {
            entity.radius *= scaleFactor;
        }
    });
    renderCanvas();
}
```

## 6. MIRROR
**Description:** Creates a reversed (mirrored) copy of objects across a specified axis line. AutoCAD 2.18 asked if you wanted to delete the original objects.
**JS Clone Concept:** Calculate the reflection of each point across the line defined by `p1` and `p2`.

pseudocode:
```javascript
function cmdMirror(selectedEntities, axisP1, axisP2, deleteOriginal, drawingDatabase) {
    // Calculate line angle
    const dx = axisP2.x - axisP1.x;
    const dy = axisP2.y - axisP1.y;
    const angle = Math.atan2(dy, dx);

    selectedEntities.forEach(entity => {
        let targetEntity = deleteOriginal ? entity : entity.clone();

        targetEntity.vertices.forEach(vertex => {
            // Translate to origin (axisP1)
            let tx = vertex.x - axisP1.x;
            let ty = vertex.y - axisP1.y;

            // Rotate axis to align with X-axis
            let rx = tx * Math.cos(-angle) - ty * Math.sin(-angle);
            let ry = tx * Math.sin(-angle) + ty * Math.cos(-angle);

            // Reflect across X-axis
            ry = -ry;

            // Rotate back
            let finalX = rx * Math.cos(angle) - ry * Math.sin(angle);
            let finalY = rx * Math.sin(angle) + ry * Math.cos(angle);

            vertex.x = finalX + axisP1.x;
            vertex.y = finalY + axisP1.y;
        });

        if (!deleteOriginal) {
            drawingDatabase.add(targetEntity);
        }
    });
    renderCanvas();
}
```

## 7. ARRAY (Rectangular & Polar)
**Description:** Creates multiple copies of objects in a rectangular grid (rows/columns) or a circular pattern (around a center point).
**JS Clone Concept:** Use loops to repeatedly call the `cmdCopy` or `cmdRotate` logic.

pseudocode:
```javascript
function cmdArrayRectangular(selectedEntities, rows, cols, rowSpacing, colSpacing, drawingDatabase) {
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (r === 0 && c === 0) continue; // Skip the original
            
            let offsetX = c * colSpacing;
            let offsetY = r * rowSpacing;

            selectedEntities.forEach(entity => {
                let clone = entity.clone();
                clone.translate(offsetX, offsetY); // Helper method abstracting the Move logic
                drawingDatabase.add(clone);
            });
        }
    }
    renderCanvas();
}
```

## 8. BREAK
**Description:** Erases parts of objects (lines, arcs, circles) between two specified points, or splits an object into two.
**JS Clone Concept:** For a line, modifying the endpoint of the original and creating a new line entity starting from the second break point to the original end point.

pseudocode:
```javascript
function cmdBreakLine(lineEntity, breakPoint1, breakPoint2, drawingDatabase) {
    // Assuming the points actually lie on the line
    // 1. Create the second part of the broken line
    let newLine = new Line(breakPoint2, lineEntity.endPoint);
    
    // 2. Modify the original line to stop at the first break point
    lineEntity.endPoint = breakPoint1;
    
    // 3. Add the new segment to the database
    drawingDatabase.add(newLine);
    
    renderCanvas();
}
```

## 9. CHANGE
**Description:** Modifies properties of entities (like layer, color, linetype) or alters geometry (like forcing lines to share a common endpoint).
**JS Clone Concept:** A generic property setter in JavaScript.
pseudocode:
```javascript
function cmdChange(selectedEntities, property, newValue) {
    selectedEntities.forEach(entity => {
        if (entity.hasOwnProperty(property)) {
            entity[property] = newValue;
        }
    });
    renderCanvas();
}
```

## Implementation Notes for JS:
* **Entities as Objects:** Treat your Lines, Circles, and Arcs as classes/objects with a `.clone()` method and standard matrix transformation methods.
* **Math Libraries:** Consider using a library like `gl-matrix` for handling 2x3 or 3x3 transformation matrices natively rather than manually writing the trig for every command.
* **Floating Point Errors:** JavaScript numbers are double-precision floats. You will need an `epsilon` threshold (e.g., `0.000001`) when checking if points intersect or lie on a line
```


### Overview of Included Commands
AutoCAD 2.18 established the standard workflows for geometry manipulation. In the provided file, I've outlined the classic behaviors and how to approach them in a modern JavaScript application:

* **ERASE:** Object removal (with notes on soft-deletions for UNDO).
* **MOVE & COPY:** Vector translations and deep cloning.
* **SCALE & ROTATE:** Matrix transformations relative to a base point.
* **MIRROR:** Reflections calculated across an axis angle.
* **ARRAY:** Nested looping and translations for polar/rectangular duplication.
* **BREAK:** Splitting vector segments.
* **CHANGE:** Property mutations.

