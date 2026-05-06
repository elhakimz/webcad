import { parseSHP, executeShape } from "./SHPParser";
import type { Shape as SHPShape } from "./SHPParser";
import shpFile from "../../../data/shapes.shp?raw";

const engineShapes = parseSHP(shpFile);

export function getShape(name: string): SHPShape | undefined {
  return engineShapes.get(name.toUpperCase());
}

export function getShapeSegments(name: string) {
  const shape = getShape(name);
  if (!shape) return [];
  return executeShape(shape);
}

export function getAllShapeNames(): string[] {
  return Array.from(engineShapes.keys()).sort();
}
