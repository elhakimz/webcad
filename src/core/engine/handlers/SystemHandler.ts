import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { OpenCascadeService } from "../../io/OpenCascadeService";

export class SystemHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['undo', 'redo', 'regen', 'delete', 'finish', 'create3d'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, cmd, syncFromDocument, selectedEntityIds } = context;

    if (action.action === 'undo') {
      const actions = doc.undo();
      syncFromDocument();
      viewer.setPreview(null);
      viewer.setHelpers(null);
      viewer.setActivePointMarker(null, null);
      return actions.length > 0 ? "Undo successful." : "Nothing to undo.";
    }

    if (action.action === 'redo') {
      const actions = doc.redo();
      syncFromDocument();
      viewer.setPreview(null);
      viewer.setHelpers(null);
      viewer.setActivePointMarker(null, null);
      return actions.length > 0 ? "Redo successful." : "Nothing to redo.";
    }

    if (action.action === 'regen') {
      syncFromDocument();
      cmd.clearActive();
      return "Regenerating drawing.";
    }

    if (action.action === 'delete') {
      const ids = action.ids || (action.id ? [action.id] : []);
      if (ids.length > 0) {
        ids.forEach(id => {
          doc.removeEntity(id);
          viewer.removeObject(id);
        });
        selectedEntityIds.clear();
        viewer.clearHighlight();
        viewer.setPreview(null);
        viewer.setHelpers(null);
        viewer.render();
        cmd.clearActive();
        return `Entities [${ids.join(', ')}] removed.`;
      }
    }

    if (action.action === 'finish') {
      context.terminateActiveCommand();
      return "Command finished.";
    }

    if (action.action === 'create3d' && action.entity) {
      const ocService = OpenCascadeService.getInstance();
      const entityData = action.entity as { id: string, shape: any };
      let shape: any;

      if (entityData.shape && entityData.shape.type === 'box') {
        const { x, y, h } = entityData.shape;
        // Create a box at insertion point with given height (symmetric for now)
        shape = ocService.createBox(x - h/2, y - h/2, 0, h, h, h);
      } else {
        shape = entityData.shape;
      }

      if (shape) {
        const geometry = ocService.shapeToBufferGeometry(shape);
        viewer.addMesh(geometry, entityData.id);
        viewer.setHelpers(null);
        viewer.render();
      }
      
      cmd.clearActive();
      return `3D Entity ${entityData.id} created using OpenCascade.js.`;
    }

    return undefined;
  }
}
