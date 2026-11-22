import * as fs from 'node:fs';
import { Document } from '../model/Document';
import { DXFImporter } from '../io/dxfImport';
import { Solid3D } from '../model/Solid3D';
import { Script, ScriptStep } from '../harness/kernel-adapter';

/**
 * Reads a DXF file, parses it with DXFImporter, and converts Solid3D entities
 * into kernel script steps (create_polyhedron) for benchmarking.
 *
 * Each Solid3D (with positions + indices from 3DFACE/SOLID entities) becomes
 * a create_polyhedron step. If no Solid3D entities are found, falls back to
 * the provided fallback script steps.
 */
export function dxfToScript(dxfPath: string, scriptName: string, fallbackSteps: ScriptStep[] = []): Script {
  const dxfText = fs.readFileSync(dxfPath, 'utf8');
  const doc = new Document();
  const importer = new DXFImporter();
  importer.import(dxfText, doc);

  const solid3Ds = doc.getAllEntities().filter((e): e is Solid3D => e instanceof Solid3D);

  const steps: ScriptStep[] = [];

  let solidIndex = 0;
  for (const solid of solid3Ds) {
    const positions = solid.positions;
    const indices = solid.indices;
    if (!positions || !indices || positions.length === 0 || indices.length === 0) {
      continue;
    }

    const pointsInLine: { x: number; y: number; z: number }[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      pointsInLine.push({ x: positions[i], y: positions[i + 1], z: positions[i + 2] });
    }

    const faces: { vertex_indices: number[] }[] = [];
    for (let i = 0; i < indices.length; i += 3) {
      faces.push({ vertex_indices: [indices[i], indices[i + 1], indices[i + 2]] });
    }

    steps.push({
      name: 'create_polyhedron',
      parameters: {
        points_inline: pointsInLine,
        faces,
        entity_id: `turbine_solid_${solidIndex}`,
        deflection: 0.1,
        include_brep: false,
      },
    });
    solidIndex++;
  }

  // If no Solid3D entities were found, use fallback steps
  if (steps.length === 0 && fallbackSteps.length > 0) {
    steps.push(...fallbackSteps);
  }

  return {
    name: scriptName,
    tolerances: { volume: 1e-4, surface: 1e-4, surfaceArea: 1e-4, bbox: 1e-3, counts: 0 },
    steps,
  };
}
