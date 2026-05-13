import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { DXFExporter } from "../../io/dxfExport";
import { DXFImporter } from "../../io/dxfImport";
import { Solid3D } from "../../model/Solid3D";
import { OpenCascadeService } from "../../io/OpenCascadeService";

export class IOHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['save', 'load', 'listFiles', 'new'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, syncFromDocument, terminateActiveCommand, onLayersChange } = context;

    if (action.action === 'new') {
      doc.entities.clear();
      doc.history.clear();
      doc.layers.layers.clear();
      doc.layers.createLayer("0", 7, "CONTINUOUS");
      doc.layers.currentLayerName = "0";
      
      // Reset settings to default
      doc.facetres = 5.0;
      doc.currentElevation = 0;
      viewer.setCameraView('TOP');
      
      syncFromDocument();
      terminateActiveCommand();
      onLayersChange();
      return "New drawing started.";
    }

    if (action.action === 'listFiles') {
      try {
        const response = await fetch('/api/files');
        if (response.ok) {
          const files = await response.json();
          if (files.length === 0) return "No files available in the files directory.\nLoad drawing (filename.dxf or ?):";
          
          let msg = "Available files:\n";
          files.forEach((f: string, i: number) => {
            msg += `${i+1}. ${f}\n`;
          });
          return msg + "Load drawing (filename.dxf or ?):";
        }
        return "Error listing files.";
      } catch (e) {
        return `Network error listing files: ${e}`;
      }
    }

    if (action.action === 'save' && action.filename) {
      const exporter = new DXFExporter();
      const dxfText = exporter.export(doc);
      
      try {
        const response = await fetch(`/api/files/${action.filename}`, {
          method: 'POST',
          body: dxfText
        });
        if (response.ok) {
          terminateActiveCommand();
          return `Drawing saved to files/${action.filename}`;
        } else {
          return `Error saving file: ${response.statusText}`;
        }
      } catch (e) {
        return `Network error saving file: ${e}`;
      }
    }

    if (action.action === 'load' && action.filename) {
      try {
        const response = await fetch(`/api/files/${action.filename}`);
        if (response.ok) {
          const dxfText = await response.text();
          
          // Clear current document before loading
          doc.clear();
          
          // Clean all layer records
          doc.layers.layers.clear();
          doc.layers.createLayer("0", 7, "CONTINUOUS");
          doc.layers.currentLayerName = "0";
          
          const importer = new DXFImporter();
          importer.import(dxfText, doc);
          
          // Rebuild worker cache for Solid3D entities
          await this.rebuildWorkerCache(doc);
          
          syncFromDocument();
          terminateActiveCommand();
          onLayersChange();
          
          // Pan view to the element position, default zoom
          const entities = Array.from(doc.entities.values());
          if (entities.length > 0) {
            viewer.zoomAll(entities);
          } else {
            viewer.camera.zoom = 1;
            viewer.camera.position.set(viewer.camera.right, viewer.camera.top, 500);
            viewer.camera.updateProjectionMatrix();
          }
          viewer.render();
          
          return `Drawing loaded from files/${action.filename}`;
        } else {
          return `File not found: ${action.filename}`;
        }
      } catch (e) {
        return `Network error loading file: ${e}`;
      }
    }

    return undefined;
  }

  private async rebuildWorkerCache(doc: any) {
    const occService = OpenCascadeService.getInstance();
    const facetres = doc.facetres || 5.0;
    const deflection = 0.1 / facetres;

    for (const entity of doc.entities.values()) {
      if (entity instanceof Solid3D && entity.creationParams) {
        const { type, params } = entity.creationParams;
        try {
          if (type === 'box') {
            await occService.createBox(params.x, params.y, params.z, params.dx, params.dy, params.dz, deflection, entity.id);
          } else if (type === 'cylinder') {
            await occService.createCylinder(params.x, params.y, params.z, params.radius, params.height, deflection, entity.id);
          } else if (type === 'extrude') {
            await occService.createExtrude(params.points, params.height, params.thickness, deflection, params.isClosed, entity.id);
          } else if (type === 'sphere') {
            await occService.createSphere(params.x, params.y, params.z, params.r, deflection, entity.id);
          } else if (type === 'cone') {
            await occService.createCone(params.x, params.y, params.z, params.r, params.h, deflection, entity.id);
          } else if (type === 'torus') {
            await occService.createTorus(params.x, params.y, params.z, params.r1, params.r2, deflection, entity.id);
          } else if (type === 'revolve') {
            await occService.createRevolve(
              params.points, params.axisPoint, params.axisDir,
              params.angle, params.thickness, deflection, params.isClosed, entity.id
            );
          }
          console.log(`Rebuilt worker cache for ${entity.id} (${type})`);
        } catch (err) {
          console.error(`Failed to rebuild cache for ${entity.id}:`, err);
        }
      } else if (entity instanceof Solid3D) {
        console.warn(`[IOHandler] Cannot rebuild worker cache for ${entity.id} - no creationParams. Boolean operations will fail on this entity.`);
      }
    }
  }
}
