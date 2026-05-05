# WebCAD LAYER Command - UAT Test Scenario

## Test Environment
- Browser: Chrome/Edge/Firefox
- URL: http://localhost:5173 (dev server)

## Pre-requisites
1. Start dev server: `npm run dev`
2. Navigate to http://localhost:5173
3. Select "1. Begin Drawing" from main menu

---

## Test Cases

### TC-001: List Layers (Default Layer 0)
**Steps:**
1. Type `LAYER` or `LA` in command line
2. Press Enter
3. Type `?` and press Enter

**Expected:** Display layer list showing only "0" layer (default)

---

### TC-002: Create New Layer
**Steps:**
1. Type `LAYER N MYLAYER` and press Enter

**Expected:** 
- Message: "Layer "MYLAYER" created and set as current."
- Status bar shows "Layer MYLAYER"

---

### TC-003: Switch Current Layer
**Steps:**
1. Type `LAYER N LAYER2` (creates second layer)
2. Type `LAYER S 0` (switch back to layer 0)

**Expected:**
- After step 1: Status bar shows "Layer LAYER2"
- After step 2: Status bar shows "Layer 0"

---

### TC-004: Turn Layer ON/OFF
**Steps:**
1. Create a circle first: `CIRCLE` → click center → type `50` → Enter
2. Type `LAYER N HIDDENLAYER` → Enter
3. Type `LAYER OFF HIDDENLAYER` → Enter

**Expected:** "Layers turned OFF." message (note: actual entity visibility requires viewer integration)

---

### TC-005: Freeze/Thaw Layer
**Steps:**
1. Type `LAYER N FROZENLAYER` → Enter
2. Type `LAYER F FROZENLAYER` → Enter
3. Type `LAYER T FROZENLAYER` → Enter

**Expected:**
- "Layers frozen." after step 2
- "Layers thawed." after step 3

---

### TC-006: Lock/Unlock Layer
**Steps:**
1. Type `LAYER N LOCKEDLAYER` → Enter
2. Type `LAYER L LOCKEDLAYER` → Enter (lock)
3. Type `LAYER U LOCKEDLAYER` → Enter (unlock)

**Expected:**
- "Layers locked." after step 2
- "Layers unlocked." after step 3

---

### TC-007: Set Layer Color
**Steps:**
1. Type `LAYER N COLORTEST` → Enter
2. Type `LAYER C` → Enter (prompts for color)
3. Type `1` → Enter (red color)
4. Type `COLORTEST` → Enter

**Expected:** "Layer color set to 1."

---

### TC-008: Set Layer Linetype
**Steps:**
1. Type `LAYER N LINETYPETEST` → Enter
2. Type `LAYER LT` → Enter (prompts for linetype)
3. Type `DASHED` → Enter
4. Type `LINETYPETEST` → Enter

**Expected:** "Layer linetype set to DASHED."

---

### TC-009: Delete Layer
**Steps:**
1. Type `LAYER N TODELETE` → Enter
2. Type `LAYER D TODELETE` → Enter
3. Type `LAYER S 0` → Enter (try to delete current layer)
4. Type `LAYER D 0` → Enter (try to delete layer 0)

**Expected:**
- Step 2: "Deleted 1 layer(s)."
- Step 3: "Cannot set layer "0" as current (not found or frozen)." (actually succeeds)
- Step 4: "Deleted 0 layer(s)." (cannot delete current or layer 0)

---

### TC-010: Layer Command Shortcuts
**Steps:**
1. Type `LA` → Enter (shortcut for LAYER)
2. Type `N TEST1` → Enter
3. Type `S TEST1` → Enter
4. Type `N TEST2` → Enter

**Expected:**
- All shortcuts work the same as full commands
- TEST1 becomes current after step 3

---

## Edge Cases

### EC-001: Create Duplicate Layer
**Steps:**
1. Type `LAYER N MYLAYER` → Enter
2. Type `LAYER N MYLAYER` → Enter

**Expected:** "Layer "MYLAYER" already exists."

### EC-002: Set Frozen Layer as Current
**Steps:**
1. Type `LAYER N FROZEN` → Enter
2. Type `LAYER F FROZEN` → Enter
3. Type `LAYER S FROZEN` → Enter

**Expected:** "Cannot set layer "FROZEN" as current (not found or frozen)."

### EC-003: Invalid Option
**Steps:**
1. Type `LAYER Z` → Enter

**Expected:** "Invalid option. Enter option [?/N/S/ON/OFF/F/T/L/U/C/LT/D]:"

---

## Keyboard Shortcuts (Post-Command)
After entering a layer command:
- **Escape**: Cancel command
- **?**: Show help/options
- **Enter**: Confirm/accept current input