import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { DXFExporter } from "../../io/dxfExport";
import { DXFImporter } from "../../io/dxfImport";
import { Solid3D } from "../../model/Solid3D";
import { Document } from "../../model/Document";
import { OpenCascadeService } from "../../io/OpenCascadeService";
import { PersistenceService } from "../../persistence/PersistenceService";
import { rebuildSweepGeometry } from "./transform/SweepGeometryUtil";
import { GeneratorProgressModal } from "../../../ui/GeneratorProgressModal";
import { Solid3DReevaluator } from "../Solid3DReevaluator";


export class IOHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['save', 'load', 'listFiles', 'new', 'dbsave', 'dblistFiles', 'dbload'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, syncFromDocument, terminateActiveCommand, onLayersChange, onFilesChange } = context;

    if (action.action === 'new') {
      doc.entities.clear();
      doc.history.clear();
      doc.layers.layers.clear();
      doc.layers.createLayer("0", 7, "CONTINUOUS");
      doc.layers.currentLayerName = "0";
      
      // Reset settings to default
      doc.facetres = 1.0;
      doc.currentElevation = 0;
      viewer.setCameraView('TOP');

      // Ensure persistence service knows we have a new project ID
      PersistenceService.getInstance().newProject(doc);
      
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

    if (action.action === 'dbsave' && action.projectName) {
      try {
        await PersistenceService.getInstance().saveProject(doc, action.projectName);
        terminateActiveCommand();
        if (onFilesChange) onFilesChange();
        return `Project "${action.projectName}" successfully saved to database.`;
      } catch (err) {
        console.error("Failed to save project to database:", err);
        return `ERROR: Failed to save project to database: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (action.action === 'dblistFiles') {
      try {
        const history = await PersistenceService.getInstance().getHistory();
        if (history.length === 0) {
          return "No database projects available.\nLoad project from database:";
        }
        let msg = "Available database projects:\n";
        history.forEach((h: any, i: number) => {
          msg += `${i+1}. ${h.name}\n`;
        });
        return msg + "Load project from database (name or ?):";
      } catch (e) {
        return `Error listing database projects: ${e}`;
      }
    }

    if (action.action === 'dbload' && action.projectName) {
      const progress = new GeneratorProgressModal("Loading Database Project");
      progress.show();
      try {
        progress.update(10, `Searching for "${action.projectName}" in database...`);
        const history = await PersistenceService.getInstance().getHistory();
        const project = history.find(h => h.name.toLowerCase() === action.projectName.toLowerCase());
        if (!project) {
          progress.close();
          return `ERROR: Project "${action.projectName}" not found in database.`;
        }

        progress.update(20, "Clearing current workspace...");
        // Clear document and layers to prevent other drawing data from lingering
        doc.clear();
        doc.layers.layers.clear();
        doc.layers.createLayer("0", 7, "CONTINUOUS");
        doc.layers.currentLayerName = "0";

        progress.update(40, "Clearing 3D engine cache...");
        // Clear OpenCascade WASM worker cache to prevent solid cache infusion
        const occService = OpenCascadeService.getInstance();
        await occService.clearCache();

        progress.update(50, "Loading project data from database...");
        await PersistenceService.getInstance().loadProject(project.id, doc, context, (percent, status) => {
          const mappedPercent = 50 + Math.round((percent / 100) * 45);
          progress.update(mappedPercent, status);
        });

        // Trigger UI updates
        syncFromDocument();
        terminateActiveCommand();
        onLayersChange();
        if (onFilesChange) onFilesChange();

        progress.update(100, "Load complete.");
        await new Promise(resolve => setTimeout(resolve, 500));
        progress.close();

        return `Project "${project.name}" successfully loaded from database.`;
      } catch (err) {
        progress.close();
        console.error("Failed to load project from database:", err);
        return `ERROR: Failed to load project from database: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    if (action.action === 'load' && action.filename) {
      const progress = new GeneratorProgressModal("Loading DXF Drawing");
      progress.show();
      try {
        progress.update(10, `Fetching "${action.filename}"...`);
        const response = await fetch(`/api/files/${action.filename}`);
        if (response.ok) {
          progress.update(20, "Reading file content...");
          const dxfText = await response.text();
          
          progress.update(30, "Clearing current workspace...");
          // Clear current document before loading
          doc.clear();
          
          // Clean all layer records
          doc.layers.layers.clear();
          doc.layers.createLayer("0", 7, "CONTINUOUS");
          doc.layers.currentLayerName = "0";
          
          progress.update(40, "Clearing 3D engine cache...");
          // Clear worker cache to prevent memory leaks!
          const occService = OpenCascadeService.getInstance();
          await occService.clearCache();
          
          progress.update(50, "Parsing DXF data...");
          const importer = new DXFImporter();
          importer.import(dxfText, doc);
          
          // Rebuild worker cache for Solid3D entities
          await this.rebuildWorkerCache(doc, (percent, status) => {
            const mappedPercent = 60 + Math.round((percent / 100) * 35);
            progress.update(mappedPercent, status);
          });
          
          progress.update(96, "Updating absolute solid positions...");
          for (const ent of doc.entities.values()) {
            if (ent instanceof Solid3D) {
              ent.updateAbsolutePosition();
            }
          }
          progress.update(98, "Updating spatial indexing...");
          doc.updateSpatialIndex();
          
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
          
          progress.update(100, "Successfully loaded!");
          return `Drawing loaded from files/${action.filename}`;
        } else {
          return `File not found: ${action.filename}`;
        }
      } catch (e) {
        return `Network error loading file: ${e}`;
      } finally {
        if (typeof document !== 'undefined') {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        progress.close();
      }
    }

    return undefined;
  }

  private updateEntityGeometry(entity: Solid3D, geoData: any) {
    if (geoData) {
      const attr = geoData.getAttribute('position') as any;
      entity.positions = Array.from(attr.array);
      entity.indices = Array.from(geoData.getIndex()!.array);
      entity.faceMapping = geoData.userData?.faceMapping;
      entity.edgeLines = geoData.userData?.edgeLines;
      if (geoData.userData?.brepSnapshot) {
        entity.brepSnapshot = geoData.userData.brepSnapshot;
      }
    }
  }

  private async rebuildWorkerCache(doc: Document, onProgress?: (percent: number, status: string) => void) {
    const occService = OpenCascadeService.getInstance();
    const facetres = doc.facetres || 5.0;
    const deflection = 0.1 / facetres;

    const solidEntities = Array.from(doc.entities.values()).filter(ent => ent instanceof Solid3D);
    const total = solidEntities.length;

    for (let i = 0; i < total; i++) {
      const entity = solidEntities[i] as Solid3D;
      const cp = entity.creationParams;
      const entityName = cp ? `${cp.type} (${entity.id})` : `CSG Operation (${entity.id})`;

      if (onProgress) {
        const percent = Math.round((i / total) * 100);
        onProgress(percent, `Loading solid ${i + 1}/${total}: ${entityName}...`);
      }

      if (entity.brepSnapshot) {
        try {
          await occService.importBRep(entity.id, entity.brepSnapshot, deflection);
          console.log(`Rehydrated from B-Rep snapshot worker cache for ${entity.id}`);
          continue;
        } catch (err) {
          console.error(`Failed to import B-Rep snapshot cache for ${entity.id}:`, err);
        }
      }

      if (cp) {
        try {
          let geoData: any = null;
          if (cp.type === 'box') {
            geoData = await occService.createBox(cp.params.x, cp.params.y, cp.params.z, cp.params.dx, cp.params.dy, cp.params.dz, deflection, entity.id);
          } else if (cp.type === 'cylinder') {
            geoData = await occService.createCylinder(cp.params.x, cp.params.y, cp.params.z, cp.params.radius, cp.params.height, deflection, entity.id);
          } else if (cp.type === 'extrude') {
            geoData = await occService.createExtrude(cp.params.points, cp.params.height, cp.params.thickness, deflection, cp.params.isClosed, entity.id);
          } else if (cp.type === 'sphere') {
            geoData = await occService.createSphere(cp.params.x, cp.params.y, cp.params.z, cp.params.r, deflection, entity.id);
          } else if (cp.type === 'cone') {
            geoData = await occService.createCone(cp.params.x, cp.params.y, cp.params.z, cp.params.r, cp.params.h, deflection, entity.id);
          } else if (cp.type === 'torus') {
            geoData = await occService.createTorus(cp.params.x, cp.params.y, cp.params.z, cp.params.r1, cp.params.r2, deflection, entity.id);
          } else if (cp.type === 'polyhedron') {
            geoData = await occService.createPolyhedron(cp.params.points, cp.params.faces, deflection, entity.id);
          } else if (cp.type === 'hull') {
            geoData = await occService.createConvexHull(cp.params.points, cp.params.shapeIds, deflection, entity.id);
          } else if (cp.type === 'revolve') {
            geoData = await occService.createRevolve(
              cp.params.points, cp.params.axisPoint, cp.params.axisDir,
              cp.params.angle, cp.params.thickness, deflection, cp.params.isClosed, entity.id
            );
          } else if (cp.type === 'sweep') {
            const profileEntity = doc.getEntity(cp.params.profileId);
            const spineEntity = doc.getEntity(cp.params.spineId);
            if (profileEntity && spineEntity) {
              const geomData = await rebuildSweepGeometry(
                profileEntity,
                spineEntity,
                cp.params.isSolid,
                facetres,
                deflection,
                entity.id,
                cp.params.cornerMode
              );
              entity.positions = geomData.positions;
              entity.indices = geomData.indices;
              entity.faceMapping = geomData.faceMapping;
              entity.edgeLines = geomData.edgeLines;
              if (geomData.brepSnapshot) {
                entity.brepSnapshot = geomData.brepSnapshot;
              }
            }
          }

          if (geoData) {
            this.updateEntityGeometry(entity, geoData);
          }

          console.log(`Rebuilt worker cache for ${entity.id} (${cp.type})`);
        } catch (err) {
          console.error(`Failed to rebuild cache for ${entity.id}:`, err);
        }
      } else if (entity instanceof Solid3D) {
        // Reconstruct loaded CSG / Boolean operation shapes from mesh vertices and indices!
        try {
          const points: [number, number, number][] = [];
          for (let i = 0; i < entity.positions.length; i += 3) {
            points.push([entity.positions[i], entity.positions[i + 1], entity.positions[i + 2]]);
          }

          const faces: number[][] = [];
          for (let i = 0; i < entity.indices.length; i += 3) {
            faces.push([entity.indices[i], entity.indices[i + 1], entity.indices[i + 2]]);
          }

          const geoData = await occService.createPolyhedron(points, faces, deflection, entity.id);
          if (geoData) {
            this.updateEntityGeometry(entity, geoData);
          }
          console.log(`Rebuilt CSG/Boolean worker shape for ${entity.id} from mesh vertices`);
        } catch (err) {
          console.error(`Failed to rebuild CSG shape for ${entity.id}:`, err);
        }
      }
    }
  }
}
