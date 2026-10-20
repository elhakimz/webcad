You’ve hit on one of the most fundamental differences between vintage CAD software and modern text rendering. 

In AutoCAD 2.18, text wasn’t rendered as pixels or bitmaps using the operating system's fonts. Instead, it used **Shape Files (`.SHP` / `.SHX`)**. These files defined every single alphanumeric character as a sequence of raw vector plotter instructions (e.g., "pen up, move to X/Y, pen down, draw to X/Y, draw arc"). This was necessary so that pen plotters could literally draw the letters onto paper using ink.

To replicate this in a modern JavaScript clone, you have two choices:
1. **The Authentic Route:** Write a parser for vintage Autodesk `.SHP` files.
2. **The Modern Route:** Use a library to parse modern `.TTF` (TrueType) or `.OTF` (OpenType) fonts and extract their vector paths.

For a web-based clone, **Option 2** is vastly superior and much easier to implement.

### The Best Library for the Job: `opentype.js`
In the JavaScript ecosystem, [**opentype.js**](https://opentype.js.org/) is the absolute gold standard for this. It parses font files in the browser and allows you to generate a "Path" for any string of text. This path is simply an array of vector commands (Move To, Line To, Bezier Curve To).

Another great option is **Maker.js**, which is specifically designed for 2D CAD and uses `opentype.js` under the hood to generate text outlines as CAD-friendly lines and arcs.

### How Text-to-Vector Works (The Concept)
Modern fonts are made of Bezier curves. If you want true AutoCAD 2.18 style (which only knew straight lines and circular arcs, not complex Beziers), you have to "tessellate" or "flatten" those curves into short, straight line segments. `opentype.js` gives you the raw curves, and you can either draw them directly to an HTML5 Canvas or flatten them into standard `LINE` entities for your CAD database.

---

### Pseudocode Implementation using `opentype.js`

Here is how you would implement a vectorized `TEXT` command in your JS clone. 

```javascript
// 1. First, load the font asynchronously (do this when your app boots)
let myCadFont;
opentype.load('fonts/Roboto-Regular.ttf', function(err, font) {
    if (err) {
        console.error('Font could not be loaded: ' + err);
    } else {
        myCadFont = font;
    }
});

// 2. The Command Execution
function cmdText(textString, insertPoint, fontSize, drawingDatabase) {
    if (!myCadFont) return; // Make sure font is loaded

    // Get the vector path from the font
    // Parameters: x, y, text, size
    const path = myCadFont.getPath(textString, insertPoint.x, insertPoint.y, fontSize);

    // 3. Process the Vector Commands
    // The path contains a list of commands: 'M' (move), 'L' (line), 
    // 'Q' (quadratic curve), 'C' (bezier curve), 'Z' (close path)
    
    let currentX = 0;
    let currentY = 0;
    let startX = 0;
    let startY = 0;

    path.commands.forEach(cmd => {
        switch (cmd.type) {
            case 'M': // Move To (Pen Up)
                currentX = cmd.x;
                currentY = cmd.y;
                startX = cmd.x;
                startY = cmd.y;
                break;
                
            case 'L': // Line To (Pen Down)
                // Create a literal Line entity in your CAD database
                drawingDatabase.add(new CadLine(
                    { x: currentX, y: currentY }, 
                    { x: cmd.x, y: cmd.y }
                ));
                currentX = cmd.x;
                currentY = cmd.y;
                break;
                
            case 'C': // Cubic Bezier Curve To
            case 'Q': // Quadratic Bezier Curve To
                // NOTE: Old AutoCAD plotters couldn't do Beziers. 
                // You would need to "flatten" this curve into 
                // multiple short CAD lines. 
                
                let flattenedLines = flattenBezier(currentX, currentY, cmd);
                flattenedLines.forEach(line => {
                     drawingDatabase.add(new CadLine(line.start, line.end));
                });
                
                currentX = cmd.x;
                currentY = cmd.y;
                break;
                
            case 'Z': // Close Path
                drawingDatabase.add(new CadLine(
                    { x: currentX, y: currentY }, 
                    { x: startX, y: startY }
                ));
                break;
        }
    });

    renderCanvas();
}

// 4. Helper function to flatten curves into straight lines (Tessellation)
function flattenBezier(startX, startY, curveCommand) {
    const segments = [];
    const resolution = 10; // Number of straight lines to approximate the curve
    
    // (You would implement standard Bezier interpolation math here 
    // to step from t=0 to t=1, generating line segments along the curve).
    
    return segments; 
}
```

### Important implementation notes for your clone:
*   **Coordinate System Inversion:** HTML5 Canvas has the Y-axis pointing *down* (Y=0 is top). AutoCAD has the Y-axis pointing *up* (Y=0 is bottom). When you extract paths from a font, you will likely need to flip the Y coordinates using a transformation matrix before injecting them into your drawing database.
*   **Text as Blocks:** Instead of inserting hundreds of individual line segments into your main drawing database (which makes them individually selectable), you should wrap the generated text lines into a grouped entity (similar to AutoCAD's `BLOCK` or a specific `TEXT` object container) so the user can select and move the whole word at once.