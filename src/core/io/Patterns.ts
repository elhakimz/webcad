import { parsePAT } from "./PatternParser";
import { convertPATPattern } from "../engine/PATConverter";
import type { LineFamily } from "../engine/PATConverter";

import patFile from "../../../data/webcad.pat?raw";

const parsedPatterns = parsePAT(patFile);

const enginePatterns = new Map<string, { name: string; lines: LineFamily[] }>();

for (const pat of parsedPatterns) {
  const converted = convertPATPattern(pat);
  enginePatterns.set(pat.name.toUpperCase(), converted);
  enginePatterns.set(pat.name, converted);
}

export function getPattern(name: string): { name: string; lines: LineFamily[] } | undefined {
  return enginePatterns.get(name.toUpperCase()) || enginePatterns.get(name);
}

export function getAllPatternNames(): string[] {
  const names = new Set<string>();
  for (const pat of enginePatterns.values()) {
    names.add(pat.name);
  }
  return Array.from(names).sort();
}