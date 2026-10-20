Below is a **clean Markdown spec with pseudocode** for **UTILITY commands** inspired by **AutoCAD 2.x (2.18 / 2.6 era)**, adapted for your **WebCAD (Three.js + OpenCascade DXF pipeline)**.

I’ve aligned it with a realistic browser-based architecture (local storage, file picker, WASM/OpenCascade bridge, etc.).

---

# 📄 WebCAD UTILITY Commands (Pseudocode)

## Scope: SAVE, QUIT, FILES

### Backend: OpenCascade (DXF read/write)

### Frontend: Three.js

---

# 🧩 Overview

| Command | Purpose                                |
| ------- | -------------------------------------- |
| SAVE    | Write current drawing to DXF           |
| QUIT    | Exit application (with prompt)         |
| FILES   | Manage file settings (paths, defaults) |

---

# 🧠 Core Architecture

```pseudo
AppState:
  currentDrawing
  isDirty (bool)
  currentFileName
  fileSettings
  storageProvider (local / cloud / indexedDB)

DXFService:
  exportToDXF(drawing) → blob
  importFromDXF(file) → drawing

SceneManager:
  serializeScene() → drawing
  loadScene(drawing)
```

---

# 💾 COMMAND: SAVE

## 📌 Description

Exports current drawing into a DXF file using OpenCascade and saves it.

---

## 🔧 Inputs

```text
- filename (optional)
```

---

## 🧪 Pseudocode

```pseudo
COMMAND SAVE:

  IF AppState.currentDrawing IS NULL THEN
      ERROR "No drawing to save"
      RETURN
  ENDIF

  IF filename NOT PROVIDED THEN
      IF AppState.currentFileName EXISTS THEN
          filename ← AppState.currentFileName
      ELSE
          PROMPT "Enter file name:"
          filename ← USER_INPUT()
      ENDIF
  ENDIF

  drawingData ← SceneManager.serializeScene()

  TRY:
      dxfBlob ← DXFService.exportToDXF(drawingData)

      FileSystem.saveFile(filename + ".dxf", dxfBlob)

      AppState.currentFileName ← filename
      AppState.isDirty ← FALSE

      PRINT "Drawing saved successfully"

  CATCH error:
      ERROR "Failed to save file: " + error.message
```

---

## 🌐 Browser File Save Strategy

```pseudo
FileSystem.saveFile(name, blob):

  IF browserSupportsFilePicker THEN
      fileHandle ← showSaveFilePicker(name)
      WRITE blob TO fileHandle
  ELSE
      CREATE downloadLink(blob, name)
      TRIGGER download
```

---

---

# 🚪 COMMAND: QUIT

## 📌 Description

Exits the application safely, ensuring unsaved work is handled.

---

## 🧪 Pseudocode

```pseudo
COMMAND QUIT:

  IF AppState.isDirty == TRUE THEN

      PROMPT "Save changes before exiting? (Yes/No/Cancel)"

      choice ← USER_INPUT()

      SWITCH choice:

          CASE "Yes":
              CALL COMMAND SAVE
              EXIT_APPLICATION()

          CASE "No":
              EXIT_APPLICATION()

          CASE "Cancel":
              RETURN

  ELSE
      EXIT_APPLICATION()
```

---

## 🌐 Browser Exit Handling

```pseudo
FUNCTION EXIT_APPLICATION():

  IF runningInBrowser THEN
      PROMPT "Close tab or navigate away?"
      // cannot fully close tab programmatically
  ELSE
      TERMINATE_PROCESS()
```

---

---

# 📁 COMMAND: FILES

## 📌 Description

Manages file paths, default directories, and system-level file settings.

---

## 🔧 Configurable Settings

```pseudo
FileSettings:
  defaultSavePath
  defaultOpenPath
  autosaveEnabled
  autosaveInterval
  lastOpenedFiles[]
```

---

## 🧪 Pseudocode

```pseudo
COMMAND FILES:

  LOOP:

    PRINT "File Settings Menu:"
    PRINT "1. Set Default Save Path"
    PRINT "2. Set Default Open Path"
    PRINT "3. Toggle Autosave"
    PRINT "4. Set Autosave Interval"
    PRINT "5. View Recent Files"
    PRINT "6. Exit"

    choice ← USER_INPUT()

    SWITCH choice:

        CASE 1:
            path ← PROMPT_PATH()
            AppState.fileSettings.defaultSavePath ← path

        CASE 2:
            path ← PROMPT_PATH()
            AppState.fileSettings.defaultOpenPath ← path

        CASE 3:
            current ← AppState.fileSettings.autosaveEnabled
            AppState.fileSettings.autosaveEnabled ← NOT current

        CASE 4:
            interval ← PROMPT_NUMBER()
            AppState.fileSettings.autosaveInterval ← interval

        CASE 5:
            DISPLAY(AppState.fileSettings.lastOpenedFiles)

        CASE 6:
            BREAK

    SAVE_SETTINGS(AppState.fileSettings)

  ENDLOOP
```

---

## 💾 Persist Settings

```pseudo
FUNCTION SAVE_SETTINGS(settings):

  IF storageProvider == localStorage THEN
      localStorage.setItem("webcad.settings", JSON.stringify(settings))

  ELSE IF storageProvider == indexedDB THEN
      indexedDB.save("settings", settings)
```

---

---

# ⏱️ AUTOSAVE SYSTEM (Important)

## 🧪 Background Process

```pseudo
FUNCTION INIT_AUTOSAVE():

  IF AppState.fileSettings.autosaveEnabled == FALSE THEN RETURN

  EVERY AppState.fileSettings.autosaveInterval SECONDS:

      IF AppState.isDirty == TRUE THEN

          drawingData ← SceneManager.serializeScene()

          dxfBlob ← DXFService.exportToDXF(drawingData)

          FileSystem.saveTemp("autosave.dxf", dxfBlob)

          PRINT "Autosaved..."
```

---

---

# 📂 COMMAND: OPEN (Bonus - implied by FILES)

## 🧪 Pseudocode

```pseudo
COMMAND OPEN:

  file ← FileSystem.openFileDialog(".dxf")

  IF file IS NULL THEN RETURN

  TRY:
      drawing ← DXFService.importFromDXF(file)

      SceneManager.loadScene(drawing)

      AppState.currentDrawing ← drawing
      AppState.currentFileName ← file.name
      AppState.isDirty ← FALSE

      ADD_TO_RECENT_FILES(file.name)

  CATCH error:
      ERROR "Failed to open DXF"
```

---

---

# 🔄 Dirty State Tracking

```pseudo
ON any geometry change:
  AppState.isDirty ← TRUE
```

---

---

# ⚡ Integration with OpenCascade

## Export

```pseudo
DXFService.exportToDXF(drawing):

  ocDoc ← OpenCascade.createDocument()

  FOR EACH entity IN drawing:
      ocEntity ← CONVERT_TO_OC(entity)
      ocDoc.add(ocEntity)

  RETURN OpenCascade.writeDXF(ocDoc)
```

---

## Import

```pseudo
DXFService.importFromDXF(file):

  ocDoc ← OpenCascade.readDXF(file)

  drawing ← []

  FOR EACH ocEntity IN ocDoc:
      entity ← CONVERT_FROM_OC(ocEntity)
      drawing.ADD(entity)

  RETURN drawing
```

---

# 🧠 UX Enhancements (Recommended)

* Command line (AutoCAD-style prompt)
* Drag-drop DXF import
* Versioned autosave (autosave_001.dxf, etc.)
* Cloud sync (later phase)

---

# 🚀 Summary

| Feature  | Status                       |
| -------- | ---------------------------- |
| SAVE     | ✅ DXF export via OpenCascade |
| QUIT     | ✅ Safe exit with prompt      |
| FILES    | ✅ Settings + paths           |
| AUTOSAVE | ⚡ Strongly recommended       |

---

