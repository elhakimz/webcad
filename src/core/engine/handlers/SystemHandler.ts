import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { OpenCascadeService } from "../../io/OpenCascadeService";

export class SystemHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['undo', 'redo', 'regen', 'delete', 'finish', 'create3d'].includes(action.action);
  }

  handle(action: CommandAction, context: AppContext): CommandResponse | undefined {
    const { doc, viewer, cmd, syncFromDocument, selectedEntityIds } = context;

    if (action.action === 'undo') {
      const actions = doc.undo();
      syncFromDocument();
      viewer.setPreview(null);
      viewer.setHelpers(null);
      return actions.length > 0 ? "Undo successful." : "Nothing to undo.";
    }

    if (action.action === 'redo') {
      const actions = doc.redo();
      syncFromDocument();
      viewer.setPreview(null);
      viewer.setHelpers(null);
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
      viewer.setPreview(null);
      viewer.setHelpers(null);
      viewer.setBaseLine(null, null);
      viewer.clearBoundaryMarkers();
      cmd.clearActive();
      return "Command finished.";
    }

    if (action.action === 'create3d' && action.entity) {
      const ocService = OpenCascadeService.getInstance();
      const geometry = ocService.shapeToBufferGeometry((action.entity as { id: string, shape: unknown }).shape);
      viewer.addMesh(geometry, action.entity.id);
      viewer.setHelpers(null);
      viewer.render();
      cmd.clearActive();
      return `3D Entity ${action.entity.id} created using OpenCascade.js.`;
    }

    return undefined;
  }
}
