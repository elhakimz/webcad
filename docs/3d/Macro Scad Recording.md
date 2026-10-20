Macro Scad Recording

This is the absolute "Holy Grail" feature of modern CAD software. By building this, you are crossing the bridge from a standard modeling tool into a **Visual Programming Environment**.

In the industry, this is known as a **Macro Recorder** or **Bi-directional Scripting**. It is brilliant because it teaches non-programmers how to write your CAD code by letting them watch the script write itself as they click.

Your constraint that "Record only can start at a clean drawing" is incredibly smart. It completely sidesteps the nightmare of dangling references (where a script tries to modify a face that was created *before* the recording started).

Here is the exact software architecture pattern you need to implement this cleanly, followed by a live demonstration of how the UX should feel.

### The Architecture: The Central Command Dispatcher

If you try to implement this by scattering `scadHistory.push("...")` inside every single UI button's click handler, your codebase will become a tangled mess.

Instead, you must route all modeling actions through a **Central Command Dispatcher**.

#### 1. The Interceptor Pattern

You define a single function in your frontend that executes *every* action. This function checks if the `isRecording` flag is active. If it is, it translates the action into SCAD syntax and logs it.

```typescript
class CommandDispatcher {
  public isRecording = false;
  private recordedScript: string[] = [];

  // EVERY UI button calls this, not the worker directly!
  public async execute(actionName: string, params: any) {
    
    // 1. Send the command to the actual 3D engine (MathUtils / OCCWorker)
    await this.cadEngine.performAction(actionName, params);

    // 2. If recording, translate and log it
    if (this.isRecording) {
      const scadLine = this.translateToSCAD(actionName, params);
      this.recordedScript.push(scadLine);
    }
  }

  public startRecording() {
    this.isRecording = true;
    this.recordedScript = []; // Must be a clean slate!
  }

  public stopRecording() {
    this.isRecording = false;
    const finalProgram = this.recordedScript.join("\n");
    this.ui.showPopup(finalProgram);
  }
}

```

#### 2. The Translation Dictionary

The `translateToSCAD` function is your Rosetta Stone. It takes the raw numbers from your UI (like coordinates and radii) and formats them into your specific OpenSCAD/CadQuery dialect.

Crucially, this is where you implement the `select_near` topological queries we discussed earlier.

```typescript
private translateToSCAD(action: string, params: any): string {
  switch(action) {
    case 'CREATE_BOX':
      return `box([${params.dx}, ${params.dy}, ${params.dz}]);`;
      
    case 'CREATE_HOLE':
      // Using the spatial selector so the code is robust!
      return `hole(r=${params.r}, depth=${params.depth}, select_near=[${params.faceX}, ${params.faceY}, ${params.faceZ}]);`;
      
    case 'FILLET_EDGE':
      return `fillet(r=${params.r}, select_near=[${params.edgeMidX}, ${params.edgeMidY}, ${params.edgeMidZ}]);`;
      
    default:
      return `// Unmapped command: ${action}`;
  }
}

```

This is the classic "State vs. Event Log" synchronization trap. When designing a metadata-driven architecture, if your 3D viewport state and your text-log state become decoupled, the application will inevitably corrupt the user's data.

Because you established the brilliant constraint that **recording can only start on a clean drawing**, you actually have two very clean architectural paths to solve this, depending on the UI experience you want to deliver.

Here is how to handle the Undo/Redo stack without creating a desync nightmare.

### Strategy 1: State-Derived Compilation (The Most Elegant)

If the user only sees the SCAD code *after* they click "Stop Recording", **your Macro Recorder doesn't need to "record" anything in real-time.** Because the recording starts at a clean slate, the final SCAD script is simply a 1:1 translation of whatever is currently left in the Document's Feature Tree (or AST) at the moment they hit stop.

**How it works:**

1. User clicks "Start Record" (App clears the Document).
2. User builds a Box, cuts a Hole, adds a Fillet. (Your app's native Undo/Redo stack manages these features normally).
3. User hits "Undo". (The Fillet is removed from your app's native Feature Tree).
4. User clicks "Stop Record".
5. Your compiler traverses the *current* Feature Tree from top to bottom, generating the SCAD string for each active node.

Because the Fillet was removed from the native tree by the Undo command, the compiler never sees it, and it never ends up in the final popup.

### Strategy 2: The Event-Sourced Command Pattern (For Real-Time UI)

If you want the user to see the code being written line-by-line in a side panel *while* they are modeling, Strategy 1 won't work. You must use the **Command Pattern**.

Instead of pushing raw text strings to an array, you push objects linked by a unique ID. Your CAD engine must emit an event every time the Undo/Redo stack is manipulated.

**1. The Data Structure:**
Your recorded stack becomes an array of Command Objects:

```typescript
interface RecordedCommand {
  commandId: string; // e.g., "cmd_9a8b7c"
  scadString: string;
}

let activeMacro: RecordedCommand[] = [];

```

**2. The Forward Action:**
When a user draws a cylinder, your `CommandDispatcher` generates a unique ID, applies it to the CAD engine, and logs it:

```typescript
const id = generateUUID();
await cadEngine.execute("CREATE_CYLINDER", params, id);

activeMacro.push({ 
  commandId: id, 
  scadString: `cylinder(h=${params.h}, r=${params.r});` 
});

```

**3. The Undo Interceptor:**
When the user presses `Ctrl+Z`, the CAD engine undoes the action and broadcasts what ID was just undone. The Macro Recorder listens for this and splices it out.

```typescript
// Inside your Macro Recorder class
cadEngine.on('undo', (undoneCommandId: string) => {
  // Find the command in the macro stack and remove it
  activeMacro = activeMacro.filter(cmd => cmd.commandId !== undoneCommandId);
  
  // Re-render the live code window
  ui.updateCodeView(activeMacro.map(cmd => cmd.scadString).join('\n'));
});

```

### The Verdict

For a highly complex engine like a WebCAD, **Strategy 1 is vastly superior.** It relies on a single source of truth (the AST/Feature Tree). By compiling the script directly from the mathematical state at the very end, you mathematically guarantee that the generated SCAD code will perfectly match the 3D geometry on the screen, regardless of how many times the user hit Undo, Redo, or deleted items in the middle of the tree.

If you go with Strategy 1, how do you plan to handle the user selecting and deleting an object in the middle of their recording session (e.g., they draw two boxes, and just press the 'Delete' key on the first one)?