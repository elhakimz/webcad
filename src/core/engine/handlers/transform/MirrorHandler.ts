import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Insert } from "../../../model/Insert";

export class MirrorHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'mirror';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity } = context;

    if (action.action === 'mirror' && action.ids && action.p1 && action.p2 && action.deleteOriginal !== undefined) {
      const { ids, p1, p2, deleteOriginal } = action;
      const newIds: string[] = [];
      
      // Pre-validate selection to avoid partial mutations
      for (const id of ids) {
        const entity = doc.getEntity(id);
        if (entity && entity instanceof Insert) {
          throw new Error("Mirror on Insert not yet supported — deselect block references and try again.");
        }
      }
      
      if (deleteOriginal) {
        ids.forEach(id => {
          const source = doc.getEntity(id);
          if (source) {
            const before = source.clone(source.id);
            source.mirror(p1, p2);
            doc.recordTransform(before, source);
            addEntity(source, false, false);
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
    const { doc, viewer, selectedEntityIds } = context;
    doc.updateSpatialIndex();
    selectedEntityIds.clear();
    viewer.clearHighlight();
    viewer.setPreview(null);
    viewer.setHelpers(null);
    viewer.setBaseLine(null, null);
    viewer.render();
  }
}
