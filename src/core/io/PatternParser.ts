export interface PatternLine {
  angle: number;
  originX: number;
  originY: number;
  deltaX: number;
  deltaY: number;
  dashPattern: number[];
}

export interface HatchPattern {
  name: string;
  description: string;
  lines: PatternLine[];
}

export function parsePAT(text: string): HatchPattern[] {
  const lines = text.split("\n");
  const patterns: HatchPattern[] = [];

  let current: HatchPattern | null = null;

  for (const raw of lines) {
    const line = raw.trim();

    if (!line || line.startsWith(";")) continue;

    if (line.startsWith("*")) {
      const content = line.slice(1);
      const parts = content.split(",");

      current = {
        name: parts[0].trim(),
        description: parts.slice(1).join(",").trim(),
        lines: []
      };

      patterns.push(current);
      continue;
    }

    if (!current) continue;

    const parts = line.split(",").map(p => parseFloat(p.trim()));
    if (parts.length < 5 || isNaN(parts[0])) continue;

    const [angle, ox, oy, dx, dy, ...dash] = parts;

    const dashPattern: number[] = [];
    for (const d of dash) {
      if (!isNaN(d)) {
        dashPattern.push(d);
      }
    }

    current.lines.push({
      angle,
      originX: ox,
      originY: oy,
      deltaX: dx,
      deltaY: dy,
      dashPattern
    });
  }

  return patterns;
}

export function getPatternByName(text: string, name: string): HatchPattern | undefined {
  const patterns = parsePAT(text);
  return patterns.find(p => p.name.toUpperCase() === name.toUpperCase());
}