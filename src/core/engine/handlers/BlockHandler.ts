import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { Insert } from "../../model/Insert";
import { Entity } from "../../model/Entity";

export class BlockHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['block', 'insert', 'blockList'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, addEntity, terminateActiveCommand } = context;

    if (action.action === 'blockList') {
        const blocks = doc.blocks.listBlocks();
        if (blocks.length === 0) return "No blocks defined in this drawing.";
        
        let msg = "Defined blocks:\n";
        blocks.forEach((name, idx) => {
            msg += `${idx + 1}. ${name}\n`;
        });
        return msg + "Block name (or ?):";
    }

    if (action.action === 'block' && action.name && action.basePoint && action.ids) {
        const { name, basePoint, ids } = action;
        
        const blockEntities = ids.map(id => {
            const e = doc.getEntity(id);
            if (e) {
                // Remove from document but keep in block definition
                doc.recordRemove(e);
                doc.removeEntity(id);
                context.viewer.removeObject(id);
                return e;
            }
            return null;
        }).filter((e): e is Entity => e !== null);

        if (blockEntities.length > 0) {
            doc.blocks.addBlock(name, basePoint, blockEntities);
            context.selectedEntityIds.clear();
            terminateActiveCommand();
            return `Block "${name}" defined with ${blockEntities.length} objects.`;
        }
        return "No objects selected for block definition.";
    }

    if (action.action === 'insert' && action.name && action.point) {
        const { name, point, scaleX, scaleY, rotation } = action;
        const block = doc.blocks.getBlock(name);
        
        if (block) {
            const id = doc.getNextId("I");
            const insert = new Insert(id, name, point.x, point.y, scaleX, scaleY, rotation);
            addEntity(insert, true, true);
            context.selectedEntityIds.clear();
            terminateActiveCommand();
            return `Block "${name}" inserted at (${point.x.toFixed(2)}, ${point.y.toFixed(2)}).`;
        }
        return `Block "${name}" not found.`;
    }

    return undefined;
  }
}
