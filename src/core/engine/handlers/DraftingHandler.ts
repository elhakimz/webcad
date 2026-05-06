import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";

export class DraftingHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['ortho', 'orthoToggle', 'grid', 'gridToggle', 'gridSet', 'snap', 'snapToggle', 'snapSet'].includes(action.action);
  }

  handle(action: CommandAction, context: AppContext): CommandResponse | undefined {
    const { drafting } = (context as any); // DraftingState is on App, which holds context

    if (action.action === 'ortho') {
      if (action.value !== undefined) {
        drafting.orthoEnabled = action.value;
        drafting.notify();
      }
      return `Ortho ${drafting.orthoEnabled ? "ON" : "OFF"}`;
    }

    if (action.action === 'orthoToggle') {
      drafting.toggleOrtho();
      return `Ortho ${drafting.orthoEnabled ? "ON" : "OFF"}`;
    }

    if (action.action === 'grid') {
      if (action.value !== undefined) {
        drafting.gridEnabled = action.value;
        drafting.notify();
      }
      return `Grid ${drafting.gridEnabled ? "ON" : "OFF"}`;
    }

    if (action.action === 'gridToggle') {
      drafting.toggleGrid();
      return `Grid ${drafting.gridEnabled ? "ON" : "OFF"}`;
    }

    if (action.action === 'gridSet') {
      if (action.spacing !== undefined) {
          drafting.setGridSpacing(action.spacing);
          drafting.gridEnabled = true;
          drafting.notify();
      }
      return `Grid spacing set to ${drafting.gridSpacing}`;
    }

    if (action.action === 'snap') {
      if (action.value !== undefined) {
        drafting.snapEnabled = action.value;
        drafting.notify();
      }
      return `Snap ${drafting.snapEnabled ? "ON" : "OFF"}`;
    }

    if (action.action === 'snapToggle') {
      drafting.toggleSnap();
      return `Snap ${drafting.snapEnabled ? "ON" : "OFF"}`;
    }

    if (action.action === 'snapSet') {
      if (action.spacing !== undefined) {
          drafting.setSnapSpacing(action.spacing);
          drafting.snapEnabled = true;
          drafting.notify();
      }
      return `Snap spacing set to ${drafting.snapSpacing}`;
    }

    return undefined;
  }
}
