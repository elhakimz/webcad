import { Command, CommandAction, CommandResponse } from './types'
import { UnitsConfig } from '../model/Document'

/**
 * SVGIMPORT triggers the system file picker to import an SVG file.
 */
export class SvgImportCommand implements Command {
  getPrompt() { return 'SVGIMPORT — press Enter to pick file:' }

  onInput(_text:string, _id:string, _u:UnitsConfig): CommandResponse|undefined {
    return { action:'svg_import' } as CommandAction
  }

  onPoint(): CommandResponse {
    return { action:'svg_import' } as CommandAction
  }
}
