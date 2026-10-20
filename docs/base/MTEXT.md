# MTEXT — Corrected Pseudocode

## Corrections Applied

| # | Issue Fixed |
|---|---|
| 1 | THREE.Sprite replaced with THREE.Mesh (PlaneGeometry) |
| 2 | Attachment point and text alignment separated |
| 3 | wrapText handles \\P / \\n and flushes final line |
| 4 | layoutMText fully defined |
| 5 | height = 0 auto-expand behavior added |
| 6 | Rich format codes corrected to AutoCAD syntax |
| 7 | Canvas texture DPI / zoom scale added |
| 8 | DXF group codes completed with insertion point |
| 9 | computeBoxOriginY added for vertical attachment |

---

## 1. Data Structures

```
MText {
  id               : String
  layer            : String

  -- Geometry
  insertionPoint   : Point2D
  width            : Float          -- reference box width
  height           : Float          -- 0 = auto-expand to content height
  rotation         : Float          -- radians, applied to mesh.rotation.z

  -- Text properties
  textHeight       : Float
  lineSpacing      : Float          -- ratio: 1.0 = single, 1.5 = one-and-a-half
  contents         : String         -- raw text with inline format codes
  textAlign        : "LEFT" | "CENTER" | "RIGHT"

  -- Attachment: where insertionPoint anchors on the bounding box
  attachmentPoint  : AttachmentPoint

  -- Style reference
  style            : TextStyle

  -- Computed by layoutMText (not stored in DXF)
  layoutLines      : List<LayoutLine>
  bounds           : Rect2D

  -- Three.js render object
  renderObject     : THREE.Mesh
}

AttachmentPoint : Enum {
  TOP_LEFT    TOP_CENTER    TOP_RIGHT
  MID_LEFT    MID_CENTER    MID_RIGHT
  BOT_LEFT    BOT_CENTER    BOT_RIGHT
}

TextStyle {
  name       : String
  fontFamily : String        -- "Arial", "Roboto", etc.
  height     : Float         -- default height (overridden per entity)
}

LayoutLine {
  text       : String
  x          : Float         -- world X of line origin
  y          : Float         -- world Y of line origin
  width      : Float         -- measured pixel width of this line
}

Token {
  type       : "WORD" | "SPACE" | "NEWLINE" | "FORMAT"
  value      : String
}
```

---

## 2. MTEXT Command — State Machine

```
IDLE
  |
  | user types MTEXT
  v
FIRST_CORNER        -- prompt: "Specify first corner:"
  |
  | point picked
  v
SECOND_CORNER       -- prompt: "Specify opposite corner or [Height/Justify/Rotation]:"
  |
  | point picked
  v
TEXT_EDITOR         -- inline editor opens over the bounding box
  |
  | user confirms (Enter / OK)
  v
FINALIZE            -- entity created, added to drawing
  |
  v
IDLE
```

---

## 3. Top-Level Command Function

```
FUNCTION MTEXT_COMMAND():

  firstCorner  = getPoint("Specify first corner:")
  secondCorner = getPoint("Specify opposite corner:")

  boxWidth     = ABS(secondCorner.x - firstCorner.x)
  boxHeight    = ABS(secondCorner.y - firstCorner.y)
                 -- height = 0 when user picks a single horizontal line
                 -- layoutMText will compute actual height in that case

  rawText      = openTextEditor(boxWidth, boxHeight)

  IF rawText = null OR rawText = "" THEN
    RETURN   -- user cancelled
  END IF

  entity                  = new MText()
  entity.insertionPoint   = firstCorner
  entity.width            = boxWidth
  entity.height           = boxHeight    -- may be 0
  entity.contents         = rawText
  entity.textHeight       = currentTextHeight()
  entity.lineSpacing      = 1.0
  entity.textAlign        = "LEFT"
  entity.attachmentPoint  = TOP_LEFT
  entity.style            = currentTextStyle()

  layoutMText(entity)
  buildMTextGeometry(entity)
  addEntity(entity)

END FUNCTION
```

---

## 4. Layout Engine

### 4.1 Entry Point

```
FUNCTION layoutMText(entity):

  tokens      = tokenizeText(entity.contents)
  lines       = wrapText(tokens, entity.width, entity.textHeight, entity.style)
  lineHeight  = entity.textHeight * entity.lineSpacing
  totalHeight = COUNT(lines) * lineHeight

  -- height = 0 means auto-expand
  IF entity.height = 0 THEN
    entity.height = totalHeight
  END IF

  boxOrigin = computeBoxOrigin(
    entity.insertionPoint,
    entity.width,
    entity.height,
    entity.attachmentPoint
  )

  entity.layoutLines = []

  FOR i = 0 TO COUNT(lines) - 1:

    lineText  = lines[i]
    lineWidth = measureLine(lineText, entity.textHeight, entity.style)

    x = boxOrigin.x + computeAlignedX(lineWidth, entity.width, entity.textAlign)
    y = boxOrigin.y - (i * lineHeight)    -- Y decreases downward in CAD coords

    entity.layoutLines.ADD(
      LayoutLine{ text:lineText, x:x, y:y, width:lineWidth }
    )

  END FOR

  entity.bounds = Rect2D{
    x      : boxOrigin.x,
    y      : boxOrigin.y - entity.height,
    width  : entity.width,
    height : entity.height
  }

END FUNCTION
```

---

### 4.2 Tokenizer

```
FUNCTION tokenizeText(raw):

  tokens = []
  i      = 0

  WHILE i < LENGTH(raw):

    ch = raw[i]

    -- Explicit paragraph break (AutoCAD MTEXT code)
    IF ch = '\\' AND raw[i+1] = 'P' THEN
      tokens.ADD( Token{ type:"NEWLINE", value:"\\P" } )
      i += 2
      CONTINUE
    END IF

    -- Newline character
    IF ch = '\n' THEN
      tokens.ADD( Token{ type:"NEWLINE", value:"\n" } )
      i += 1
      CONTINUE
    END IF

    -- Inline format block: {\b text} {\i text} {\H2.5; text}
    IF ch = '{' THEN
      block = readFormatBlock(raw, i)
      tokens.ADD( Token{ type:"FORMAT", value:block.text, format:block.format } )
      i += block.length
      CONTINUE
    END IF

    -- Space
    IF ch = ' ' THEN
      tokens.ADD( Token{ type:"SPACE", value:" " } )
      i += 1
      CONTINUE
    END IF

    -- Word: read until space, newline, or format block
    word = ""
    WHILE i < LENGTH(raw)
      AND raw[i] != ' '
      AND raw[i] != '\n'
      AND raw[i] != '{'
      AND NOT (raw[i] = '\\' AND raw[i+1] = 'P'):
        word += raw[i]
        i += 1
    END WHILE
    tokens.ADD( Token{ type:"WORD", value:word } )

  END WHILE

  RETURN tokens

END FUNCTION
```

---

### 4.3 Word Wrap

```
FUNCTION wrapText(tokens, maxWidth, textHeight, style):

  lines        = []
  currentLine  = ""
  currentWidth = 0.0

  FOR EACH token IN tokens:

    -- Explicit line break: flush current line unconditionally
    IF token.type = "NEWLINE" THEN
      lines.ADD(currentLine)
      currentLine  = ""
      currentWidth = 0.0
      CONTINUE
    END IF

    tokenWidth = measureWord(token.value, textHeight, style)

    -- Overflow: current token does not fit on this line
    IF currentWidth + tokenWidth > maxWidth AND currentLine != "" THEN

      -- Do not break mid-word on SPACE — discard leading space on new line
      IF token.type = "SPACE" THEN
        lines.ADD(currentLine)
        currentLine  = ""
        currentWidth = 0.0
      ELSE
        lines.ADD(currentLine)
        currentLine  = token.value
        currentWidth = tokenWidth
      END IF

    ELSE
      currentLine  += token.value
      currentWidth += tokenWidth
    END IF

  END FOR

  -- Flush last line (was missing in original)
  IF currentLine != "" THEN
    lines.ADD(currentLine)
  END IF

  RETURN lines

END FUNCTION
```

---

### 4.4 Text Measurement

```
FUNCTION measureWord(word, textHeight, style):
  -- Uses Canvas2D for accurate font metrics
  ctx = getSharedMeasureCanvas()
  ctx.font = buildFontString(textHeight, style)
  RETURN ctx.measureText(word).width

END FUNCTION

FUNCTION measureLine(line, textHeight, style):
  ctx = getSharedMeasureCanvas()
  ctx.font = buildFontString(textHeight, style)
  RETURN ctx.measureText(line).width

END FUNCTION

FUNCTION buildFontString(textHeight, style):
  -- Convert CAD text height to CSS px (depends on viewport scale)
  px = worldUnitsToPx(textHeight)
  RETURN px + "px " + style.fontFamily

END FUNCTION
```

---

## 5. Attachment Point & Alignment

### 5.1 Box Origin from Attachment Point

```
-- Computes the TOP-LEFT corner of the bounding box in world coords,
-- given that insertionPoint anchors at attachmentPoint.

FUNCTION computeBoxOrigin(insertionPoint, boxWidth, boxHeight, attachmentPoint):

  x = insertionPoint.x
  y = insertionPoint.y

  -- Horizontal offset
  SWITCH attachmentPoint.column:
    CASE LEFT:   x = x
    CASE CENTER: x = x - boxWidth / 2
    CASE RIGHT:  x = x - boxWidth
  END SWITCH

  -- Vertical offset (Y axis points up in CAD)
  SWITCH attachmentPoint.row:
    CASE TOP:    y = y           -- box extends downward from insertion
    CASE MIDDLE: y = y + boxHeight / 2
    CASE BOTTOM: y = y + boxHeight
  END SWITCH

  RETURN Point2D{ x:x, y:y }   -- this is the TOP-LEFT of the box

END FUNCTION
```

### 5.2 Text Alignment Inside Box

```
-- These are independent of attachment point.
-- Alignment controls how lines sit inside the box width.

FUNCTION computeAlignedX(lineWidth, boxWidth, alignment):

  SWITCH alignment:
    CASE "LEFT":   RETURN 0
    CASE "CENTER": RETURN (boxWidth - lineWidth) / 2
    CASE "RIGHT":  RETURN  boxWidth - lineWidth
  END SWITCH

END FUNCTION
```

---

## 6. Rendering

### 6.1 Canvas Texture with DPI Scale

```
FUNCTION renderTextToCanvas(entity):

  -- Scale up canvas resolution to prevent blur at zoom
  -- Minimum 2x; can be tied to current viewport zoom level
  scale  = MAX(2.0, currentViewportZoom() / baseZoom())

  cw     = entity.width  * scale
  ch     = entity.height * scale

  canvas = createOffscreenCanvas(cw, ch)
  ctx    = canvas.getContext("2d")

  -- Scale all drawing operations
  ctx.scale(scale, scale)

  -- Transparent background (background mask handled separately)
  ctx.clearRect(0, 0, entity.width, entity.height)

  ctx.font      = buildFontString(entity.textHeight, entity.style)
  ctx.fillStyle = resolveColor(entity.layer)
  ctx.textBaseline = "top"

  lineHeight = entity.textHeight * entity.lineSpacing

  FOR EACH layoutLine IN entity.layoutLines:

    -- layoutLine.x / y are in world coords relative to box origin
    ctx.fillText(layoutLine.text, layoutLine.x, -(layoutLine.y - entity.bounds.y))

  END FOR

  RETURN new THREE.CanvasTexture(canvas)

END FUNCTION
```

---

### 6.2 Three.js Mesh — NOT Sprite

```
-- CORRECT: Mesh lies flat in drawing plane; rotation.z applies cleanly.
-- WRONG was: THREE.Sprite (always faces camera — billboard, breaks CAD view).

FUNCTION buildMTextGeometry(entity):

  texture  = renderTextToCanvas(entity)

  material = new THREE.MeshBasicMaterial({
    map         : texture,
    transparent : true,
    depthWrite  : false,
    side        : THREE.DoubleSide
  })

  geometry = new THREE.PlaneGeometry(entity.width, entity.height)

  mesh     = new THREE.Mesh(geometry, material)

  -- Position: PlaneGeometry is centered, so offset to box origin
  mesh.position.x = entity.bounds.x + entity.width  / 2
  mesh.position.y = entity.bounds.y + entity.height / 2
  mesh.position.z = 0

  -- Apply MTEXT rotation around Z axis
  mesh.rotation.z = entity.rotation

  entity.renderObject = mesh
  scene.add(mesh)

END FUNCTION
```

---

### 6.3 Background Mask (Optional)

```
FUNCTION buildBackgroundMask(entity, color, offsetFactor):

  -- offsetFactor: typically 1.1 (box is 10% larger than text bounds)
  padW = entity.width  * offsetFactor
  padH = entity.height * offsetFactor

  geometry = new THREE.PlaneGeometry(padW, padH)
  material = new THREE.MeshBasicMaterial({ color: color })
  mask     = new THREE.Mesh(geometry, material)

  mask.position.copy(entity.renderObject.position)
  mask.position.z = -0.001    -- render just behind text mesh

  scene.add(mask)

END FUNCTION
```

---

## 7. Editing

### 7.1 Double-Click to Edit

```
FUNCTION onDoubleClick(entity):

  IF entity.type != "MTEXT" THEN RETURN

  newText = openTextEditor(entity.width, entity.height, entity.contents)

  IF newText = null THEN RETURN    -- user cancelled

  entity.contents = newText
  rebuildMText(entity)

END FUNCTION
```

### 7.2 Rebuild Pipeline

```
FUNCTION rebuildMText(entity):

  -- Remove old render object from scene
  scene.remove(entity.renderObject)
  entity.renderObject.geometry.dispose()
  entity.renderObject.material.map.dispose()
  entity.renderObject.material.dispose()

  -- Re-layout and re-render
  layoutMText(entity)
  buildMTextGeometry(entity)

END FUNCTION
```

---

## 8. Rich Inline Formatting (Corrected Syntax)

AutoCAD MTEXT inline format codes — wrapped in `{ }` blocks:

```
{\b1 bold text}           -- bold on
{\b0 normal text}         -- bold off
{\i1 italic text}         -- italic on
{\i0 normal text}         -- italic off
{\H2.5; large text}       -- height override (2.5 units)
{\C1; red text}           -- color by ACI index
\P                        -- paragraph break (new line)
\~                        -- non-breaking space
\\                       -- literal backslash
```

### Format Block Parser (MVP Subset)

```
FUNCTION readFormatBlock(raw, startIndex):

  -- Reads from '{' to matching '}'
  i      = startIndex + 1    -- skip opening '{'
  format = {}
  text   = ""

  -- Read format codes before ';'
  IF raw[i] = '\\' THEN
    code = raw[i+1]

    SWITCH code:
      CASE 'b': format.bold   = (raw[i+2] = '1')
      CASE 'i': format.italic = (raw[i+2] = '1')
      CASE 'H': format.height = parseFloat(raw, i+2)
      CASE 'C': format.color  = parseInt(raw, i+2)
    END SWITCH

    -- Advance past code + value + ';'
    i = indexOfSemicolon(raw, i) + 1
  END IF

  -- Read text content until '}'
  WHILE raw[i] != '}':
    text += raw[i]
    i += 1
  END WHILE

  RETURN { text:text, format:format, length:(i - startIndex + 1) }

END FUNCTION
```

---

## 9. DXF Serialization

### 9.1 Writer (Corrected — insertion point group codes added)

```
FUNCTION writeMTextDXF(entity):

  WRITE  0, "MTEXT"
  WRITE  5, entity.id            -- handle
  WRITE  8, entity.layer
  WRITE 10, entity.insertionPoint.x
  WRITE 20, entity.insertionPoint.y
  WRITE 30, 0.0                  -- Z (always 0 for 2D)
  WRITE 40, entity.textHeight
  WRITE 41, entity.width
  WRITE 71, attachmentPointCode(entity.attachmentPoint)
                                 -- 1=TL 2=TC 3=TR
                                 -- 4=ML 5=MC 6=MR
                                 -- 7=BL 8=BC 9=BR
  WRITE 72, 1                    -- drawing direction: 1 = left-to-right
  WRITE  1, entity.contents      -- text string (group 3 for continuation >250 chars)
  WRITE  7, entity.style.name
  WRITE 50, entity.rotation
  WRITE 73, 1                    -- line spacing style: 1 = at least, 2 = exact
  WRITE 44, entity.lineSpacing   -- line spacing factor

END FUNCTION
```

### 9.2 Parser

```
FUNCTION parseMText(groupCodes):

  entity = new MText()

  FOR EACH (code, value) IN groupCodes:

    SWITCH code:

      CASE 10: entity.insertionPoint.x = value
      CASE 20: entity.insertionPoint.y = value
      CASE 40: entity.textHeight       = value
      CASE 41: entity.width            = value
      CASE  1: entity.contents        += value   -- append (may repeat for long strings)
      CASE  3: entity.contents        += value   -- continuation chunk
      CASE 71: entity.attachmentPoint  = decodeAttachmentPoint(value)
      CASE 50: entity.rotation         = value
      CASE  7: entity.style.name       = value
      CASE 44: entity.lineSpacing      = value
      CASE 73: -- line spacing style (store if needed)

    END SWITCH

  END FOR

  layoutMText(entity)

  RETURN entity

END FUNCTION
```

---

## 10. Selection & Hit Testing

```
FUNCTION hitTestMText(point, entity):

  -- Rotate the test point into the MTEXT local frame
  localPoint = rotatePointAround(point, entity.insertionPoint, -entity.rotation)

  RETURN pointInRect(localPoint, entity.bounds)

END FUNCTION

FUNCTION pointInRect(p, rect):

  RETURN p.x >= rect.x
    AND  p.x <= rect.x + rect.width
    AND  p.y >= rect.y - rect.height
    AND  p.y <= rect.y

END FUNCTION
```

---

## 11. Snap Points

```
FUNCTION getMTextSnapPoints(entity):

  b = entity.bounds

  RETURN [
    -- Attachment point positions on the bounding box
    { type:"INSERT",      point: entity.insertionPoint },
    { type:"CORNER",      point: Point2D{ x:b.x,           y:b.y          } },   -- TL
    { type:"CORNER",      point: Point2D{ x:b.x+b.width,   y:b.y          } },   -- TR
    { type:"CORNER",      point: Point2D{ x:b.x,           y:b.y-b.height } },   -- BL
    { type:"CORNER",      point: Point2D{ x:b.x+b.width,   y:b.y-b.height } },   -- BR
    { type:"MID_TOP",     point: Point2D{ x:b.x+b.width/2, y:b.y          } },
    { type:"MID_BOTTOM",  point: Point2D{ x:b.x+b.width/2, y:b.y-b.height } }
  ]

END FUNCTION
```

---

## 12. Full Pipeline Summary

```
MTEXT_COMMAND()
      |
      v
  tokenizeText()          -- raw string -> tokens (WORD / SPACE / NEWLINE / FORMAT)
      |
      v
  wrapText()              -- tokens -> lines[], respecting \P and width overflow
      |
      v
  computeBoxOrigin()      -- attachmentPoint + insertionPoint -> box top-left
      |
      v
  computeAlignedX()       -- per-line horizontal offset inside box (LEFT/CENTER/RIGHT)
      |
      v
  layoutMText()           -- assembles layoutLines[] with world x,y per line
      |
      v
  renderTextToCanvas()    -- Canvas2D at 2x+ DPI scale -> CanvasTexture
      |
      v
  buildMTextGeometry()    -- THREE.Mesh(PlaneGeometry) at correct world position
      |                   -- rotation.z = entity.rotation
      v
  scene.add(mesh)
```
