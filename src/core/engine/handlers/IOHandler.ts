import { ActionHandler, AppContext } from "./types";
import { CommandAction, CommandResponse } from "../../commands/types";
import { DXFExporter } from "../../io/dxfExport";
import { DXFImporter } from "../../io/dxfImport";

export class IOHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return ['save', 'load'].includes(action.action);
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, syncFromDocument, terminateActiveCommand } = context;

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
          doc.entities.clear();
          doc.history.clear();
          
          const importer = new DXFImporter();
          importer.import(dxfText, doc);
          
          syncFromDocument();
          terminateActiveCommand();
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
}
