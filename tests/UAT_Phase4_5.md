# WebCAD Phase 4 & 5 - UAT Test Scenario

## Test Environment
- Browser: Chrome/Edge/Firefox
- URL: http://localhost:5173 (dev server)

## Pre-requisites
1. Start dev server: `npm run dev`
2. Navigate to http://localhost:5173

---

## 1. Productivity Aids (GRID, ORTHO, SNAP)

### TC-101: GRID Toggle and Spacing
**Steps:**
1. Select "1. Begin a NEW drawing" from main menu.
2. Type `GRID` and press Enter.
3. Type `20` and press Enter.
4. Observe the drawing screen.
5. Press **F7**.

**Expected:**
- A grid of dots appears with 20-unit spacing.
- Status bar tag `[GRID]` becomes active (bright).
- Pressing F7 toggles the grid off; `[GRID]` tag becomes dim.

---

### TC-102: SNAP Toggle and Spacing
**Steps:**
1. Type `SNAP` and press Enter.
2. Type `10` and press Enter.
3. Move the mouse across the screen.
4. Press **F9**.

**Expected:**
- Crosshairs "jump" in 10-unit increments.
- Status bar tag `[SNAP]` becomes active.
- Pressing F9 toggles snap off; movement becomes fluid.

---

### TC-103: ORTHO Toggle
**Steps:**
1. Start `LINE` command.
2. Click the first point anywhere.
3. Press **F8** (enable ORTHO).
4. Move the mouse around the base point.
5. Click a second point and finish the line.

**Expected:**
- Rubber-band line is forced to be strictly horizontal or vertical.
- Status bar tag `[ORTHO]` becomes active.
- Resulting line is perfectly straight (aligned to X or Y axis).

---

## 2. Advanced Editing (TRIM, EXTEND, OFFSET, ARRAY)

### TC-201: TRIM Lines
**Steps:**
1. Draw two intersecting lines (an 'X' shape).
2. Type `TRIM` and press Enter.
3. Select both lines as cutting edges (click them or use a box).
4. Press Enter to finish boundary selection.
5. Click one of the "ears" of the 'X' (the part you want to remove).
6. Press Enter to finish.

**Expected:**
- The clicked segment is removed up to the intersection point.
- The command remains active until the final Enter.

---

### TC-202: EXTEND Lines
**Steps:**
1. Draw a vertical line (the boundary).
2. Draw a short horizontal line pointing towards it but not touching.
3. Type `EXTEND` and press Enter.
4. Select the vertical line and press Enter.
5. Click the horizontal line near the end closest to the vertical line.
6. Press Enter to finish.

**Expected:**
- The horizontal line extends perfectly to touch the vertical boundary.

---

### TC-203: OFFSET Entities
**Steps:**
1. Draw a `CIRCLE`.
2. Type `OFFSET` and press Enter.
3. Type `10` (distance) and press Enter.
4. Select the circle.
5. Click outside the circle.
6. Click the original circle again.
7. Click inside the circle.

**Expected:**
- Two new concentric circles are created, one 10 units larger and one 10 units smaller.

---

### TC-204: ARRAY (Rectangular)
**Steps:**
1. Draw a small `POINT` or `CIRCLE`.
2. Type `ARRAY` and press Enter.
3. Select the object and press Enter.
4. Type `R` (Rectangular).
5. Number of rows: `3`.
6. Number of columns: `4`.
7. Distance between rows: `50`.
8. Distance between columns: `50`.

**Expected:**
- A grid of 12 objects (3x4) is created.

---

## 3. File I/O (SAVE, LOAD, Main Menu)

### TC-301: SAVE Drawing to Local Disk
**Steps:**
1. Draw some geometry (Line, Circle, Text).
2. Create a new layer `TEST_LAYER` with color `RED`.
3. Type `SAVE MYDRAW` and press Enter.
4. Check the `./files` folder in your project directory.

**Expected:**
- Message: "Drawing saved to files/MYDRAW.dxf".
- `MYDRAW.dxf` exists in the local folder.

---

### TC-302: Main Menu LOAD Workflow
**Steps:**
1. Type `QUIT` to return to the main menu.
2. Select `2. Edit an EXISTING drawing`.
3. Locate `MYDRAW.dxf` in the list (e.g., type its number).
4. Observe the workspace.

**Expected:**
- The drawing loads with all geometry and layer definitions intact.
- Status bar shows correct current layer.

---

### TC-303: Asynchronous Feedback
**Steps:**
1. Run `LOAD` or `SAVE` on a large file.
2. Observe the command log.

**Expected:**
- The UI remains responsive (not frozen) during the fetch/post operation.
- Success/Failure messages appear in the log after completion.
