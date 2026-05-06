import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";

export class TransformHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['move', 'rotate', 'scale', 'copy', 'mirror'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, cmd, selectedEntityIds, addEntity } = context;

    if (action.action === 'move' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          entity.move(action.dx!, action.dy!);
          viewer.moveObject(id, action.dx!, action.dy!);
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] moved.`;
    }

    if (action.action === 'rotate' && (action.id || action.ids) && action.angle !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          entity.rotate(action.baseX!, action.baseY!, action.angle!);
          addEntity(entity, true, false); // Keep existing layer
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] rotated.`;
    }

    if (action.action === 'scale' && (action.id || action.ids) && action.factor !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      ids.forEach(id => {
        const entity = doc.getEntity(id);
        if (entity) {
          entity.scale(action.baseX!, action.baseY!, action.factor!);
          addEntity(entity, true, false); // Keep existing layer
        }
      });
      this.cleanup(context);
      return `Entities [${ids.join(', ')}] scaled.`;
    }

    if (action.action === 'copy' && (action.id || action.ids) && action.dx !== undefined) {
      const ids = action.ids || (action.id ? [action.id] : []);
      const newIds: string[] = [];
      ids.forEach(id => {
        const source = doc.getEntity(id);
        if (source) {
          const newId = source.id + "_COPY_" + Math.random().toString(36).substr(2, 5);
          const copy = source.clone(newId);
          copy.move(action.dx!, action.dy!);
          addEntity(copy, true, false); // Keep source layer
          newIds.push(newId);
        }
      });
      this.cleanup(context);
      return `Entities copied to [${newIds.join(', ')}].`;
    }

    if (action.action === 'mirror' && action.ids && action.p1 && action.p2 && action.deleteOriginal !== undefined) {
      const { ids, p1, p2, deleteOriginal } = action;
      const newIds: string[] = [];
      
      if (deleteOriginal) {
        ids.forEach(id => {
          const source = doc.getEntity(id);
          if (source) {
            source.mirror(p1, p2);
            addEntity(source, true, false);
          }
        });
      } else {
        ids.forEach(id => {
          const source = doc.getEntity(id);
          if (source) {
            const target = source.clone(source.id + "_MIRROR_" + Math.random().toString(36).substr(2, 5));
            target.mirror(p1, p2);
            addEntity(target, true, false);
            newIds.push(target.id);
          }
        });
      }
      this.cleanup(context);
      return deleteOriginal 
        ? `Entities mirrored and originals deleted.`
        : `Entities mirrored to [${newIds.join(', ')}].`;
    }

    return undefined;
  }

  private cleanup(context: AppContext) {
    const { viewer, cmd, selectedEntityIds } = context;
    selectedEntityIds.clear();
    viewer.clearHighlight();
    viewer.setPreview(null);
    viewer.setHelpers(null);
    viewer.setBaseLine(null, null);
    viewer.render();
    cmd.clearActive();
  }
}
