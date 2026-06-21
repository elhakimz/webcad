import { ActionHandler, AppContext }       from './types'
import { CommandAction, CommandResponse }  from '../../commands/types'
import { SvgImporter }                    from '../../io/SvgImporter'
import { GeneratorProgressModal }         from '../../../ui/GeneratorProgressModal'

export class SvgImportHandler implements ActionHandler {
  canHandle(action:CommandAction): boolean {
    return action.action==='svg_import' || action.action==='svg_import_file'
  }

  async handle(action:CommandAction, ctx:AppContext): Promise<CommandResponse|undefined> {
    const { doc, viewer, addEntity, syncFromDocument } = ctx

    let file: File | null = null

    if (action.action === 'svg_import') {
      file = await pickFile()
      if (!file) return 'SVG import cancelled.'
    } else {
      file = (action as any).svgFile ?? null
      if (!file) return 'SVG import: no file provided.'
    }

    const progress = new GeneratorProgressModal("Importing SVG")
    progress.show()
    progress.update(10, "Parsing SVG structure...")

    let svgLayers: Awaited<ReturnType<SvgImporter['fromFile']>>
    try {
      svgLayers = await new SvgImporter().fromFile(file)
    } catch (e:any) {
      progress.close()
      return `SVG import failed: ${e.message}`
    }

    const totalEntities = svgLayers.reduce((n,l) => n+l.entities.length, 0)
    if (totalEntities === 0) {
      progress.close()
      return 'SVG import: no geometry found.'
    }

    progress.update(30, `Importing ${totalEntities} entities...`)

    doc.history.startTransaction()

    let processed = 0
    for (const svgLayer of svgLayers) {
      // Ensure layer exists
      if (!doc.layers.getLayer(svgLayer.name)) {
        doc.layers.createLayer(svgLayer.name, svgLayer.color, 'CONTINUOUS', svgLayer.lw)
      }
      for (const entity of svgLayer.entities) {
        entity.layer = svgLayer.name
        addEntity(entity, false, false)
        processed++
        if (processed % 100 === 0) {
           progress.update(30 + (processed / totalEntities) * 60, `Adding entity ${processed}/${totalEntities}...`)
        }
      }
    }

    doc.history.commitTransaction()
    progress.update(95, "Refreshing view...")
    
    // Final scene re-sync to ensure everything is visible
    syncFromDocument()
    viewer.zoomAll(Array.from(doc.entities.values()))
    progress.close()

    const layerNames = svgLayers.map(l=>l.name).join(', ')
    return `SVG import: ${totalEntities} entities on ${layerNames} (from '${file.name}')`
  }
}

async function pickFile(): Promise<File|null> {
  return new Promise(res => {
    const inp = document.createElement('input')
    inp.type='file'; inp.accept='.svg,image/svg+xml'
    inp.onchange = () => res(inp.files?.[0]??null)
    inp.click()
  })
}
