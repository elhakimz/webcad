export interface PATLine {
  angle: number;
  originX: number;
  originY: number;
  deltaX: number;
  deltaY: number;
  dashPattern: number[];
}

export interface LineFamily {
  angle: number;
  spacing: number;
  offset: [number, number];
  dashPattern: number[];
}

function degToRad(a: number): number {
  return (a * Math.PI) / 180;
}

function normalizeDash(dash: number[]): number[] {
  if (!dash || dash.length === 0) return [];

  // Preserve negative values as they indicate spaces/gaps in PAT format
  return [...dash];
}

export function convertPATLine(line: PATLine): LineFamily {
  const angleRad = degToRad(line.angle);

  const direction: [number, number] = [
    Math.cos(angleRad),
    Math.sin(angleRad)
  ];

  const normal: [number, number] = [
    -direction[1],
    direction[0]
  ];

  const dx = line.deltaX;
  const dy = line.deltaY;
  let spacing = Math.abs(dx * normal[0] + dy * normal[1]);

  if (spacing < 0.001) {
    spacing = 0.001;
  }

  return {
    angle: line.angle,
    spacing,
    offset: [line.originX, line.originY],
    dashPattern: normalizeDash(line.dashPattern)
  };
}

export function convertPATPattern(pat: { name: string; lines: PATLine[] }): { name: string; lines: LineFamily[] } {
  return {
    name: pat.name,
    lines: pat.lines.map(convertPATLine)
  };
}

export function getEnginePattern(name: string, patterns: Map<string, { name: string; lines: LineFamily[] }>): { name: string; lines: LineFamily[] } | undefined {
  return patterns.get(name.toUpperCase()) || patterns.get(name);
}