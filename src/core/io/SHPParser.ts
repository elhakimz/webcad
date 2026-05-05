export interface ShapeCommand {
  type: number;
  params: number[];
}

export interface Shape {
  name: string;
  number: number;
  commands: ShapeCommand[];
}

export function parseSHP(text: string): Map<string, Shape> {
  const shapes = new Map<string, Shape>();
  const lines = text.split("\n");

  let currentShape: Shape | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) continue;

    if (line.startsWith("*")) {
      const parts = line.slice(1).split(",");
      const shapeNum = parseInt(parts[0], 10);
      const shapeName = parts[1]?.trim() || "";

      currentShape = {
        name: shapeName,
        number: shapeNum,
        commands: []
      };

      shapes.set(shapeName, currentShape);
      continue;
    }

    if (!currentShape) continue;

    const tokens = line.split(",").map(t => t.trim());
    const cmdType = parseInt(tokens[0], 10);

    if (cmdType === 0) {
      currentShape = null;
      continue;
    }

    const params = tokens.slice(1).map(t => parseFloat(t) || 0);

    currentShape.commands.push({ type: cmdType, params });
  }

  return shapes;
}

export function executeShape(shape: Shape): { x1: number; y1: number; x2: number; y2: number; isArc?: boolean; cx?: number; cy?: number; r?: number; startAngle?: number; endAngle?: number }[] {
  const segments: { x1: number; y1: number; x2: number; y2: number; isArc?: boolean; cx?: number; cy?: number; r?: number; startAngle?: number; endAngle?: number }[] = [];
  let cursorX = 0;
  let cursorY = 0;
  let scaleFactor = 1;
  let rotationAngle = 0;

  for (const cmd of shape.commands) {
    if (cmd.type === 1) {
      const dx = (cmd.params[0] || 0) * scaleFactor;
      const dy = (cmd.params[1] || 0) * scaleFactor;

      const rad = (rotationAngle * Math.PI) / 180;
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

      const newX = cursorX + rx;
      const newY = cursorY + ry;

      segments.push({ x1: cursorX, y1: cursorY, x2: newX, y2: newY });
      cursorX = newX;
      cursorY = newY;
    } else if (cmd.type === 2) {
      const dx = (cmd.params[0] || 0) * scaleFactor;
      const dy = (cmd.params[1] || 0) * scaleFactor;

      const rad = (rotationAngle * Math.PI) / 180;
      const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
      const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

      cursorX += rx;
      cursorY += ry;
    } else if (cmd.type === 3) {
      const r = (cmd.params[0] || 1) * scaleFactor;
      const angle = (cmd.params[1] || 90) * Math.PI / 180;
      const startAngle = Math.atan2(cursorY, cursorX);
      const endAngle = startAngle + angle;

      const cx = cursorX;
      const cy = cursorY;

      const newX = cx + r * Math.cos(endAngle);
      const newY = cy + r * Math.sin(endAngle);

      segments.push({
        x1: cursorX, y1: cursorY,
        x2: newX, y2: newY,
        isArc: true,
        cx, cy,
        r,
        startAngle,
        endAngle
      });

      cursorX = newX;
      cursorY = newY;
    } else if (cmd.type === 4) {
      scaleFactor = cmd.params[0] || 1;
    } else if (cmd.type === 5) {
      rotationAngle += cmd.params[0] || 0;
    }
  }

  return segments;
}