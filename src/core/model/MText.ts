import { Entity, BoundingBox } from "./Entity";

export enum AttachmentPoint {
  TOP_LEFT = 1,
  TOP_CENTER = 2,
  TOP_RIGHT = 3,
  MID_LEFT = 4,
  MID_CENTER = 5,
  MID_RIGHT = 6,
  BOT_LEFT = 7,
  BOT_CENTER = 8,
  BOT_RIGHT = 9
}

export interface LayoutLine {
  text: string;
  x: number;
  y: number;
  width: number;
}

export class MText extends Entity {
  insertionPoint: { x: number; y: number };
  width: number;
  height: number;
  rotation: number; // in radians
  contents: string;
  textHeight: number;
  lineSpacing: number;
  textAlign: "LEFT" | "CENTER" | "RIGHT";
  attachmentPoint: AttachmentPoint;

  layoutLines: LayoutLine[] = [];
  bounds: { x: number; y: number; width: number; height: number } = { x: 0, y: 0, width: 0, height: 0 };

  constructor(id: string, insertionPoint: { x: number; y: number }, width: number, height: number, contents: string) {
    super(id);
    this.insertionPoint = insertionPoint;
    this.width = width;
    this.height = height;
    this.contents = contents;
    this.textHeight = 2.5; // Default height
    this.lineSpacing = 1.0;
    this.textAlign = "LEFT";
    this.attachmentPoint = AttachmentPoint.TOP_LEFT;
    this.rotation = 0;
  }

  private static measureCanvas: HTMLCanvasElement | null = null;
  private static getMeasureContext(): CanvasRenderingContext2D {
    if (!MText.measureCanvas) {
      MText.measureCanvas = document.createElement('canvas');
    }
    return MText.measureCanvas.getContext('2d')!;
  }

  tokenizeText(raw: string): { type: string, value: string }[] {
    const tokens: { type: string, value: string }[] = [];
    let i = 0;

    while (i < raw.length) {
      const ch = raw[i];

      if (ch === '\\' && raw[i+1] === 'P') {
        tokens.push({ type: "NEWLINE", value: "\\P" });
        i += 2;
        continue;
      }

      if (ch === '\n') {
        tokens.push({ type: "NEWLINE", value: "\n" });
        i += 1;
        continue;
      }

      if (ch === ' ') {
        tokens.push({ type: "SPACE", value: " " });
        i += 1;
        continue;
      }

      let word = "";
      while (i < raw.length && raw[i] !== ' ' && raw[i] !== '\n' && !(raw[i] === '\\' && raw[i+1] === 'P')) {
        word += raw[i];
        i += 1;
      }
      tokens.push({ type: "WORD", value: word });
    }

    return tokens;
  }

  wrapText(tokens: { type: string, value: string }[], maxWidth: number, textHeight: number): string[] {
    const lines: string[] = [];
    let currentLine = "";
    let currentWidth = 0;

    for (const token of tokens) {
      if (token.type === "NEWLINE") {
        lines.push(currentLine);
        currentLine = "";
        currentWidth = 0;
        continue;
      }

      const tokenWidth = this.measureWord(token.value, textHeight);

      if (currentWidth + tokenWidth > maxWidth && currentLine !== "") {
        if (token.type === "SPACE") {
          lines.push(currentLine);
          currentLine = "";
          currentWidth = 0;
        } else {
          lines.push(currentLine);
          currentLine = token.value;
          currentWidth = tokenWidth;
        }
      } else {
        currentLine += token.value;
        currentWidth += tokenWidth;
      }
    }

    if (currentLine !== "") {
      lines.push(currentLine);
    }

    return lines;
  }

  measureWord(word: string, textHeight: number): number {
    const ctx = MText.getMeasureContext();
    const scale = 10; // Use a fixed scale for layout measurement to avoid font size limits
    ctx.font = `${textHeight * scale}px Arial`;
    return ctx.measureText(word).width / scale;
  }

  computeBoxOrigin(insertionPoint: { x: number, y: number }, boxWidth: number, boxHeight: number, attachmentPoint: AttachmentPoint): { x: number, y: number } {
    let x = insertionPoint.x;
    let y = insertionPoint.y;

    // Horizontal offset
    switch (attachmentPoint) {
      case AttachmentPoint.TOP_LEFT:
      case AttachmentPoint.MID_LEFT:
      case AttachmentPoint.BOT_LEFT:
        x = x;
        break;
      case AttachmentPoint.TOP_CENTER:
      case AttachmentPoint.MID_CENTER:
      case AttachmentPoint.BOT_CENTER:
        x = x - boxWidth / 2;
        break;
      case AttachmentPoint.TOP_RIGHT:
      case AttachmentPoint.MID_RIGHT:
      case AttachmentPoint.BOT_RIGHT:
        x = x - boxWidth;
        break;
    }

    // Vertical offset
    switch (attachmentPoint) {
      case AttachmentPoint.TOP_LEFT:
      case AttachmentPoint.TOP_CENTER:
      case AttachmentPoint.TOP_RIGHT:
        y = y;
        break;
      case AttachmentPoint.MID_LEFT:
      case AttachmentPoint.MID_CENTER:
      case AttachmentPoint.MID_RIGHT:
        y = y + boxHeight / 2;
        break;
      case AttachmentPoint.BOT_LEFT:
      case AttachmentPoint.BOT_CENTER:
      case AttachmentPoint.BOT_RIGHT:
        y = y + boxHeight;
        break;
    }

    return { x, y };
  }

  computeAlignedX(lineWidth: number, boxWidth: number, alignment: string): number {
    switch (alignment) {
      case "LEFT": return 0;
      case "CENTER": return (boxWidth - lineWidth) / 2;
      case "RIGHT": return boxWidth - lineWidth;
      default: return 0;
    }
  }

  layoutMText() {
    const tokens = this.tokenizeText(this.contents);
    const lines = this.wrapText(tokens, this.width, this.textHeight);
    const lineHeight = this.textHeight * this.lineSpacing;
    const totalHeight = lines.length * lineHeight;

    if (this.height === 0) {
      this.height = totalHeight;
    }

    const boxOrigin = this.computeBoxOrigin(
      this.insertionPoint,
      this.width,
      this.height,
      this.attachmentPoint
    );

    this.layoutLines = [];

    for (let i = 0; i < lines.length; i++) {
      const lineText = lines[i];
      const lineWidth = this.measureWord(lineText, this.textHeight);

      const x = boxOrigin.x + this.computeAlignedX(lineWidth, this.width, this.textAlign);
      const y = boxOrigin.y - (i * lineHeight);

      this.layoutLines.push({ text: lineText, x, y, width: lineWidth });
    }

    this.bounds = {
      x: boxOrigin.x,
      y: boxOrigin.y - this.height,
      width: this.width,
      height: this.height
    };
  }

  move(dx: number, dy: number) {
    this.insertionPoint.x += dx;
    this.insertionPoint.y += dy;
    this.bounds.x += dx;
    this.bounds.y += dy;
    this.layoutLines.forEach(line => {
      line.x += dx;
      line.y += dy;
    });
  }

  rotate(baseX: number, baseY: number, angleRad: number) {
    // Basic rotation of insertion point
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const rx = this.insertionPoint.x - baseX;
    const ry = this.insertionPoint.y - baseY;
    this.insertionPoint.x = baseX + (rx * cos - ry * sin);
    this.insertionPoint.y = baseY + (rx * sin + ry * cos);
    
    this.rotation += angleRad;
    // We will need to re-layout or re-transform layout lines in a full implementation
  }

  scale(baseX: number, baseY: number, factor: number) {
    this.insertionPoint.x = baseX + (this.insertionPoint.x - baseX) * factor;
    this.insertionPoint.y = baseY + (this.insertionPoint.y - baseY) * factor;
    this.width *= factor;
    this.height *= factor;
    this.textHeight *= factor;
    // Re-layout would be needed here too
  }

  mirror(_p1: { x: number; y: number }, _p2: { x: number; y: number }) {
    // Mirroring text usually keeps it readable but flips insertion point
    // For now, minimal implementation
  }

  getBoundingBox(): BoundingBox {
    return {
      minX: this.bounds.x,
      minY: this.bounds.y - this.bounds.height,
      maxX: this.bounds.x + this.bounds.width,
      maxY: this.bounds.y
    };
  }

  clone(newId: string): MText {
    const copy = new MText(newId, { ...this.insertionPoint }, this.width, this.height, this.contents);
    copy.layer = this.layer;
    copy.textHeight = this.textHeight;
    copy.lineSpacing = this.lineSpacing;
    copy.textAlign = this.textAlign;
    copy.attachmentPoint = this.attachmentPoint;
    copy.rotation = this.rotation;
    copy.properties = JSON.parse(JSON.stringify(this.properties));
    return copy;
  }
}
