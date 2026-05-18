import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { Solid3D } from "../../model/Solid3D";
import { Entity } from "../../model/Entity";
import { ScadManager } from "../../../scad/ScadManager";
import { PersistenceService } from "../../persistence/PersistenceService";
import { OpenCascadeService } from "../../io/OpenCascadeService";
import { GeneratorProgressModal } from "../../../ui/GeneratorProgressModal";

export class GeneratorHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return (action as any).action === "generator_placed";
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity, terminateActiveCommand } = context;
    const act = action as any;

    if (act.action === "generator_placed" && act.generator && act.point) {
      const generatorName = act.generator as string;
      const pt = act.point as { x: number; y: number };
      const params = (act.params || {}) as Record<string, any>;

      // Create and show modal progress dialog
      const progress = new GeneratorProgressModal("Parametric Generation");
      progress.show();

      try {
        // Step 1: Loading script
        progress.update(10, `Loading generator "${generatorName}"...`);
        const url = `/api/files/scad/generators/${generatorName}`;
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to load generator script "${generatorName}": ${response.statusText}`);
        }
        const code = await response.text();

        // Step 2: Running SCAD Manager
        progress.update(30, "Compiling parametric design with ScadManager...");
        const manager = new ScadManager();
        // Pass "../../generators" as the project context so that internal relative imports inside files/scad/generators/ resolve perfectly!
        const result = await manager.execute(code, params, undefined, "../../generators");

        if (!result.success) {
          throw new Error(`SCAD compilation failed: ${result.error}`);
        }

        const entities = result.entities || [];
        if (entities.length === 0) {
          return "Generator executed successfully but produced no geometries.";
        }

        // 3. Separate Solid3D shapes and 2D entities (convert THREE.BufferGeometry to Solid3D)
        progress.update(50, "Casting compiled geometries into CAD shapes...");
        const solids3D: Solid3D[] = [];
        const otherEntities: Entity[] = [];

        entities.forEach((geo: any) => {
          if (geo instanceof Entity) {
            otherEntities.push(geo);
          } else if (geo && geo.getAttribute && geo.getAttribute('position')) {
            const positions = Array.from(geo.getAttribute('position').array) as number[];
            const indices = geo.index ? Array.from(geo.index.array) as number[] : [];
            const faceMapping = geo.userData?.faceMapping;
            const edgeLines = geo.userData?.edgeLines;
            const brepSnapshot = geo.userData?.brepSnapshot;

            const entityId = doc.getNextId("SOLID");
            const solid = new Solid3D(entityId, positions, indices, faceMapping, edgeLines);
            solid.brepSnapshot = brepSnapshot;
            solids3D.push(solid);
          }
        });

        let finalSolid: Solid3D | null = null;

        if (solids3D.length > 0) {
          if (solids3D.length === 1) {
            finalSolid = solids3D[0];
          } else {
            // Fuse them together using OpenCascade worker
            progress.update(70, `Fusing ${solids3D.length} sub-solids with OpenCascade kernel...`);
            const occ = OpenCascadeService.getInstance();
            
            // Generate a temp ID for our final shape and load the children into the worker cache
            let currentBaseId = doc.getNextId("S");
            
            // Let's cache each individual child shape in the worker
            for (let i = 0; i < solids3D.length; i++) {
              const child = solids3D[i];
              const childId = `${currentBaseId}_child_${i}`;
              
              // Register it in worker cache
              if (child.brepSnapshot) {
                await occ.importBRep(childId, child.brepSnapshot);
              }
            }

            // Chain fuse operations together
            let currentShapeId = `${currentBaseId}_child_0`;
            for (let i = 1; i < solids3D.length; i++) {
              const nextShapeId = `${currentBaseId}_child_${i}`;
              const fusedId = `${currentBaseId}_fused_${i}`;
              
              try {
                const fusePercent = 70 + Math.round((i / solids3D.length) * 15);
                progress.update(fusePercent, `Boolean fusing component ${i + 1}/${solids3D.length}...`);
                const geom = await occ.createBoolean("fuse", currentShapeId, nextShapeId, fusedId);
                currentShapeId = fusedId;
              } catch (err) {
                console.warn(`[GeneratorHandler] Sibling fuse step ${i} failed, falling back to compound:`, err);
              }
            }

            // Retrieve final fused shape snapshot from worker
            try {
              progress.update(85, "Exporting fused solid geometry snapshot...");
              const brepSnapshot = await occ.exportBRep(currentShapeId);
              
              // Re-import to construct clean geometry
              const finalGeomData = await occ.importBRep(`${currentBaseId}_final`, brepSnapshot);
              
              if (finalGeomData && finalGeomData.positions) {
                finalSolid = new Solid3D(
                  currentBaseId,
                  finalGeomData.positions,
                  finalGeomData.indices,
                  finalGeomData.faceMapping,
                  finalGeomData.edgeLines
                );
                finalSolid.brepSnapshot = brepSnapshot;
              }
            } catch (err) {
              console.error(`[GeneratorHandler] Failed to compound/fuse siblings:`, err);
            }

            // Cleanup temp shape caches in worker
            const tempIds = [`${currentBaseId}_final`];
            for (let i = 0; i < solids3D.length; i++) {
              tempIds.push(`${currentBaseId}_child_${i}`);
              tempIds.push(`${currentBaseId}_fused_${i}`);
            }
            try {
              await occ.releaseShapes(tempIds);
            } catch (e) {}
          }
        }

        // Add the final solid to the document
        progress.update(90, "Applying translation and committing to CAD database...");
        if (finalSolid) {
          // Move the solid to the desired insertion point!
          finalSolid.move3D(pt.x, pt.y, 0);
          
          // Add to document
          addEntity(finalSolid, true, true);
          
          // Persist it immediately
          if (finalSolid.brepSnapshot) {
            await PersistenceService.getInstance().persistBRepNow(finalSolid, doc);
          }
        }

        // Translate and add any other entities (like 2D Lines, Circles etc)
        otherEntities.forEach(ent => {
          if ('move' in ent && typeof ent.move === 'function') {
            ent.move(pt.x, pt.y);
          }
          addEntity(ent, true, true);
        });

        // Clear selection and terminate placement mode
        context.selectedEntityIds.clear();
        terminateActiveCommand();

        // Trigger workspace viewport synchronization
        context.syncFromDocument();

        progress.update(100, "Successfully completed!");
        // Keep progress bar visible for a moment so the user sees 100% complete
        await new Promise(resolve => setTimeout(resolve, 300));

        return `Generator "${generatorName}" successfully placed at (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}).`;

      } catch (err: any) {
        progress.update(0, `Error: ${err.message || err}`);
        await new Promise(resolve => setTimeout(resolve, 1500)); // Show error status briefly before closing
        throw err;
      } finally {
        progress.close();
      }
    }

    return undefined;
  }
}
