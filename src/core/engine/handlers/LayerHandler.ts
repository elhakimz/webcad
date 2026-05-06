import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { LINETYPES } from "../MathUtils";

export class LayerHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    const layerActions = [
      'layerList', 'layerNew', 'layerSetCurrent', 'layerOn', 'layerOff',
      'layerFreeze', 'layerThaw', 'layerLock', 'layerUnlock', 'layerColor',
      'layerLinetype', 'layerDelete', 'linetypeList', 'linetypeSet'
    ];
    return layerActions.includes(action.action);
  }

  handle(action: CommandAction, context: AppContext): CommandResponse | undefined {
    const { doc, cmd, updateLayerVisibility, onStatusBarUpdate } = context;

    if (action.action === 'layerList') {
      const layers = doc.layers.listLayers();
      let output = "Layer list:\n";
      for (const layer of layers) {
        const current = layer.name === doc.layers.currentLayerName ? " <Current>" : "";
        const frozen = layer.isFrozen ? " Frozen" : "";
        const locked = layer.isLocked ? " Locked" : "";
        const visible = !layer.isVisible ? " Hidden" : "";
        output += `  ${layer.name} Color:${layer.color} ${layer.linetype}${current}${frozen}${locked}${visible}\n`;
      }
      cmd.clearActive();
      return output;
    }

    if (action.action === 'layerNew') {
      const name = action.name as string;
      const layer = doc.layers.createLayer(name);
      if (layer) {
        doc.layers.setCurrentLayer(name);
        onStatusBarUpdate(layer);
        return `Layer "${name}" created and set as current.`;
      }
      return `Layer "${name}" already exists.`;
    }

    if (action.action === 'layerSetCurrent') {
      const name = action.name as string;
      const layer = doc.layers.setCurrentLayer(name);
      if (layer) {
        onStatusBarUpdate(layer);
        return `Layer "${name}" is now current.`;
      }
      return `Cannot set layer "${name}" as current (not found or frozen).`;
    }

    if (['layerOn', 'layerOff', 'layerFreeze', 'layerThaw', 'layerLock', 'layerUnlock'].includes(action.action)) {
      const names = (action.names as string).split(/[,\s]+/);
      for (const name of names) {
        const layer = doc.layers.getLayer(name);
        if (layer) {
          switch (action.action) {
            case 'layerOn': layer.isVisible = true; break;
            case 'layerOff': layer.isVisible = false; break;
            case 'layerFreeze': layer.isFrozen = true; break;
            case 'layerThaw': layer.isFrozen = false; break;
            case 'layerLock': layer.isLocked = true; break;
            case 'layerUnlock': layer.isLocked = false; break;
          }
        }
      }
      updateLayerVisibility();
      onStatusBarUpdate(doc.layers.getCurrentLayer());
      
      const msgMap: Record<string, string> = {
        'layerOn': "Layers turned ON.",
        'layerOff': "Layers turned OFF.",
        'layerFreeze': "Layers frozen.",
        'layerThaw': "Layers thawed.",
        'layerLock': "Layers locked.",
        'layerUnlock': "Layers unlocked."
      };
      return msgMap[action.action];
    }

    if (action.action === 'layerColor') {
      const color = action.color as number;
      const names = (action.names as string).split(/[,\s]+/);
      for (const name of names) {
        const layer = doc.layers.getLayer(name);
        if (layer) layer.color = color;
      }
      onStatusBarUpdate(doc.layers.getCurrentLayer());
      return `Layer color set to ${color}.`;
    }

    if (action.action === 'layerLinetype') {
      const linetype = action.linetype as string;
      const names = (action.names as string).split(/[,\s]+/);
      for (const name of names) {
        const layer = doc.layers.getLayer(name);
        if (layer) layer.linetype = linetype;
      }
      onStatusBarUpdate(doc.layers.getCurrentLayer());
      return `Layer linetype set to ${linetype}.`;
    }

    if (action.action === 'layerDelete') {
      const names = (action.names as string).split(/[,\s]+/);
      let deleted = 0;
      for (const name of names) {
        if (doc.layers.deleteLayer(name)) deleted++;
      }
      return `Deleted ${deleted} layer(s).`;
    }

    if (action.action === 'linetypeList') {
      let output = "Available linetypes:\n  CONTINUOUS\n";
      for (const lt of Object.keys(LINETYPES)) {
        output += `  ${lt}\n`;
      }
      cmd.clearActive();
      return output;
    }

    if (action.action === 'linetypeSet') {
      const lt = action.linetype as string;
      cmd.clearActive();
      return `Current linetype set to ${lt} (Note: entities currently inherit from Layer).`;
    }

    return undefined;
  }
}
