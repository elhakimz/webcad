import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { OpenCascadeService } from "../../io/OpenCascadeService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { Solid3D } from "../../model/Solid3D";
import { Solid3DReevaluator } from "../Solid3DReevaluator";
import { GeneratorProgressModal } from "../../../ui/GeneratorProgressModal";

export class SystemHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['finish', 'undo', 'redo', 'regen', 'delete', 'close', 'unitsSet', 'rebuild', 'rebuild_all', 'elevationSet', 'thicknessSet'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, terminateActiveCommand, syncFromDocument, addEntity } = context;

    if (action.action === 'thicknessSet') {
      const val = Number(action.value ?? 0);
      doc.currentThickness = val;
      terminateActiveCommand();
      return `Current thickness set to ${val}.`;
    }

    if (action.action === 'elevationSet') {
      const val = Number(action.value ?? 0);
      doc.currentElevation = val;
      if (context.onElevationChange) {
        context.onElevationChange(val);
      }
      terminateActiveCommand();
      return `Current elevation set to ${val}.`;
    }

    if (action.action === 'unitsSet') {
      doc.units.type = action.type as 'decimal' | 'architectural' | 'metric';
      doc.units.precision = action.precision || 4;
      terminateActiveCommand();
      return `Units set to ${doc.units.type} with precision ${doc.units.precision}.`;
    }

    if (action.action === 'finish' || action.action === 'close') {
      terminateActiveCommand();
      return "Command finished.";
    }

    if (action.action === 'undo') {
      if (doc.canUndo()) {
        doc.undo();
        context.syncFromDocument(); 
        return "Undo performed.";
      }
      return "Nothing to undo.";
    }

    if (action.action === 'redo') {
      if (doc.canRedo()) {
        doc.redo();
        context.syncFromDocument(); 
        return "Redo performed.";
      }
      return "Nothing to redo.";
    }

    if (action.action === 'regen') {
      await OpenCascadeService.getInstance().rehydrate(doc);
      context.syncFromDocument(); 
      const msg = (action as any)._echo ? `${(action as any)._echo}\nRegenerating drawing...` : "Regenerating drawing...";
      return msg;
    }

    if (action.action === 'delete' && action.ids) {
      const solidIds: string[] = [];
      for (const id of action.ids) {
        const entity = doc.getEntity(id);
        if (entity) {
          doc.recordRemove(entity);
          doc.removeEntity(id);
          viewer.removeObject(id);
          await PersistenceService.getInstance().onEntityErased(id, entity);
          if ((entity as any).type === "Solid3D" || entity.constructor.name === "Solid3D") {
            solidIds.push(id);
          }
        }
      }
      
      if (solidIds.length > 0) {
        try {
          await OpenCascadeService.getInstance().releaseShapes(solidIds);
          console.log(`[SystemHandler] Released shapes from worker:`, solidIds);
        } catch (err) {
          console.error(`[SystemHandler] Failed to release shapes from worker:`, err);
        }
      }
      
      doc.updateSpatialIndex();
      if (context.onEntitiesChange) {
        context.onEntitiesChange();
      }
      return `Deleted ${action.ids.length} objects.`;
    }

    if (action.action === 'rebuild' && action.id) {
      const entity = doc.getEntity(action.id);
      if (!entity) {
        return `ERROR: Object "${action.id}" not found.`;
      }
      
      if (!(entity instanceof Solid3D)) {
        return `ERROR: Object "${action.id}" is not a Solid3D entity. Only Solid3D objects can be rebuilt.`;
      }

      const progress = new GeneratorProgressModal("Rebuilding Parametric Solid");
      progress.show();
      progress.update(20, `Evaluating features for "${action.id}"...`);

      const before = entity.clone(entity.id) as Solid3D;
      
      try {
        const facetres = doc.facetres || 5.0;
        const geom = await Solid3DReevaluator.reevaluate(entity, facetres, doc);
        
        progress.update(60, "Updating mesh geometry data...");
        entity.positions = Array.from(geom.getAttribute('position').array) as number[];
        entity.indices = geom.getIndex() ? Array.from(geom.getIndex()!.array) : [];
        if (geom.userData) {
          entity.faceMapping = geom.userData.faceMapping;
          entity.edgeLines = geom.userData.edgeLines;
          entity.brepSnapshot = geom.userData.brepSnapshot;
        }
        entity.updateAbsolutePosition();
        
        progress.update(80, "Rehydrating persistence cache...");
        // Save tessellation cache for fast loading
        const deflection = 0.1 / facetres;
        if (entity.positions.length > 0) {
          PersistenceService.getInstance().cache.saveTessellation(entity.id, PersistenceService.getInstance().activeProjectId || "default", entity.positions, entity.indices, deflection);
        }

        // Persist the BRep snapshots so modelling operations work immediately
        if (entity.brepSnapshot) {
          try {
            await PersistenceService.getInstance().persistBRepNow(entity, doc);
          } catch (e) {
            console.warn('[Rebuild] persistBRepNow failed for solid', entity.id, e);
          }
        }
        
        doc.history.startTransaction(doc.constraints);
        doc.recordTransform(before, entity);
        doc.history.commitTransaction(doc.constraints);
        
        addEntity(entity, false, false);
        syncFromDocument();
        terminateActiveCommand();
        
        progress.update(100, "Rebuild complete.");
        await new Promise(resolve => setTimeout(resolve, 500));
        progress.close();

        return `Object "${action.id}" successfully rebuilt and cache rehydrated.`;
      } catch (err: any) {
        progress.close();
        console.error("Parametric rebuild failed:", err);
        syncFromDocument();
        return `ERROR: Rebuild failed - ${err.message || err.toString()}`;
      }
    }

    if (action.action === 'rebuild_all') {
      const solids = Array.from(doc.entities.values()).filter(e => e instanceof Solid3D) as Solid3D[];
      if (solids.length === 0) {
        return "No Solid3D entities found to rebuild.";
      }

      const progress = new GeneratorProgressModal("Rebuilding All Solids");
      progress.show();

      let successCount = 0;
      let failCount = 0;
      const facetres = doc.facetres || 5.0;

      for (let i = 0; i < solids.length; i++) {
        const solid = solids[i];
        progress.update((i / solids.length) * 100, `Rebuilding ${solid.id} (${i + 1}/${solids.length})...`);

        const before = solid.clone(solid.id) as Solid3D;
        try {
          const geom = await Solid3DReevaluator.reevaluate(solid, facetres, doc);
          
          solid.positions = Array.from(geom.getAttribute('position').array) as number[];
          solid.indices = geom.getIndex() ? Array.from(geom.getIndex()!.array) : [];
          if (geom.userData) {
            solid.faceMapping = geom.userData.faceMapping;
            solid.edgeLines = geom.userData.edgeLines;
            solid.brepSnapshot = geom.userData.brepSnapshot;
          }
          solid.updateAbsolutePosition();
          
          // Save tessellation cache
          const deflection = 0.1 / facetres;
          if (solid.positions.length > 0) {
            PersistenceService.getInstance().cache.saveTessellation(solid.id, PersistenceService.getInstance().activeProjectId || "default", solid.positions, solid.indices, deflection);
          }

          // Persist BRep
          if (solid.brepSnapshot) {
            try {
              await PersistenceService.getInstance().persistBRepNow(solid, doc);
            } catch (e) {}
          }
          
          doc.history.startTransaction(doc.constraints);
          doc.recordTransform(before, solid);
          doc.history.commitTransaction(doc.constraints);
          
          addEntity(solid, false, false);
          successCount++;
        } catch (err) {
          console.error(`Rebuild failed for ${solid.id}:`, err);
          failCount++;
        }
      }

      progress.update(100, "Rebuild All complete.");
      await new Promise(resolve => setTimeout(resolve, 500));
      progress.close();
      syncFromDocument();
      terminateActiveCommand();

      return `Rebuild All finished. Success: ${successCount}, Failed: ${failCount}.`;
    }

    return undefined;
  }
}
