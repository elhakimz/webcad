import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";

export class DraftingHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['ortho', 'orthoToggle', 'grid', 'gridToggle', 'gridSet', 'snap', 'snapToggle', 'snapSet'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { drafting, terminateActiveCommand } = context;

    if (action.action === 'ortho') {
      drafting.orthoEnabled = !!action.value; drafting.notify();
      return `Ortho ${action.value ? 'ON' : 'OFF'}`;
    }
    if (action.action === 'orthoToggle') {
      drafting.toggleOrtho();
      return `Ortho ${drafting.orthoEnabled ? 'ON' : 'OFF'}`;
    }

    if (action.action === 'grid') {
        drafting.gridEnabled = !!action.value; drafting.notify();
        return `Grid ${action.value ? 'ON' : 'OFF'}`;
    }
    if (action.action === 'gridToggle') {
        drafting.toggleGrid();
        return `Grid ${drafting.gridEnabled ? 'ON' : 'OFF'}`;
    }
    if (action.action === 'gridSet') {
        drafting.setGridSpacing(action.spacing || 10);
        drafting.gridEnabled = true; drafting.notify();
        terminateActiveCommand();
        return `Grid spacing set to ${action.spacing}.`;
    }

    if (action.action === 'snap') {
        drafting.snapEnabled = !!action.value; drafting.notify();
        return `Snap ${action.value ? 'ON' : 'OFF'}`;
    }
    if (action.action === 'snapToggle') {
        drafting.toggleSnap();
        return `Snap ${drafting.snapEnabled ? 'ON' : 'OFF'}`;
    }
    if (action.action === 'snapSet') {
        drafting.setSnapSpacing(action.spacing || 10);
        drafting.snapEnabled = true; drafting.notify();
        terminateActiveCommand();
        return `Snap spacing set to ${action.spacing}.`;
    }

    return undefined;
  }
}
