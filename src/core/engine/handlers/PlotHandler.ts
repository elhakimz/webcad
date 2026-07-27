import { ActionHandler, AppContext } from './types';
import { CommandAction, CommandResponse, PlotSettings } from '../../commands/types';
import { PlotEngine } from '../../plot/PlotEngine';
import { PlotSVGRenderer } from '../../plot/PlotSVGRenderer';

export class PlotHandler implements ActionHandler {

  canHandle(action: CommandAction): boolean {
    return action.action === 'plot' || action.action === 'showPlotDialog';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    if (action.action === 'showPlotDialog') {
      const { PlotDialog } = await import('../../../ui/PlotDialog');
      const { DEFAULT_PLOT_SETTINGS } = await import('../../commands/types');
      
      const dialog = new PlotDialog(DEFAULT_PLOT_SETTINGS, async (settings) => {
        if (settings.areaType === 'WINDOW') {
          const { PlotCommand } = await import('../../commands/PlotCommand');
          PlotCommand.pendingSettings = settings;
          context.cmd.execute('PLOT WINDOW', context.doc.units);
        } else {
          const resp = await this.executePlot(settings, context);
          if (typeof resp === 'string') {
            alert(resp);
          }
        }
      }, () => {
        // Cancelled
      });
      dialog.show();
      return 'Showing plot dialog...';
    }

    if (action.action === 'plot') {
      const settings: PlotSettings = action.plotSettings!;
      return this.executePlot(settings, context);
    }
    return undefined;
  }

  private async executePlot(settings: PlotSettings, context: AppContext): Promise<CommandResponse> {
    const { doc, viewer } = context;
    const engine   = new PlotEngine();
    const renderer = new PlotSVGRenderer();

    // The viewport canvas, for its aspect ratio. Read from the viewer rather than
    // reaching through viewer.renderer.domElement — same object, but it keeps the
    // concrete renderer type from leaking out of src/render (WEBCAD-161).
    const canvas  = viewer.canvas;
    const canvasW = canvas.clientWidth  || canvas.width;
    const canvasH = canvas.clientHeight || canvas.height;

    let result;
    try {
      result = renderer.render(doc, settings, engine, viewer.camera, canvasW, canvasH);
    } catch (e: any) {
      return `PLOT error: ${e.message}`;
    }

    if (!result.success) {
      return `PLOT failed: ${result.error}`;
    }

    // Show non-fatal warnings in command line
    if (result.warnings.length > 0) {
      result.warnings.forEach(w => console.warn('[PLOT]', w));
    }

    // Execute the output
    switch (settings.outputFormat) {
      case 'svg':
        this.downloadBlob(
          new Blob([result.svgString!], { type: 'image/svg+xml' }),
          this.getFilename('svg'),
        );
        break;

      case 'pdf':
        try {
          const pdfBlob = await this.svgToPDF(result.svgString!, settings);
          this.downloadBlob(pdfBlob, this.getFilename('pdf'));
        } catch (e: any) {
          console.error('[PlotHandler] PDF generation failed:', e);
          this.downloadBlob(
            new Blob([result.svgString!], { type: 'image/svg+xml' }),
            this.getFilename('svg'),
          );
          return `PDF generation failed: ${e.message || e}. Saved as SVG instead.`;
        }
        break;

      case 'png':
        const pngBlob = await this.svgToPNG(result.svgString!, settings);
        this.downloadBlob(pngBlob, this.getFilename('png'));
        break;

      case 'print':
        await this.printSVG(result.svgString!, settings);
        break;
    }

    const warnMsg = result.warnings.length > 0
      ? ` (${result.warnings.length} warning(s) — see console)`
      : '';
    return `Plot complete.${warnMsg}`;
  }

  // ── Output methods ────────────────────────────────────────────

  private downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a   = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  private async svgToPDF(svgString: string, settings: PlotSettings): Promise<Blob> {
    // Dynamic import — jsPDF must be in package.json
    const { default: jsPDF } = await import('jspdf');
    await import('svg2pdf.js');
    const { convertTextToPaths } = await import('../../plot/TextToPath');

    const { PAPER_SIZES } = await import('../../commands/types');
    const paper = PAPER_SIZES[settings.paperSizeKey];
    const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
    const ph = settings.orientation === 'landscape' ? paper.height : paper.width;

    // Outline all text before PDF conversion
    let outlinedSVG: string;
    try {
      outlinedSVG = await convertTextToPaths(svgString);
    } catch (e) {
      console.warn('[PlotHandler] Text outlining failed, using original SVG:', e);
      outlinedSVG = svgString;
    }

    const pdf = new jsPDF({
      orientation: settings.orientation,
      unit: 'mm',
      format: [pw, ph],
    });

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(outlinedSVG, 'image/svg+xml');
    await (pdf as any).svg(svgDoc.documentElement, { x: 0, y: 0, width: pw, height: ph });
    return pdf.output('blob');
  }

  private async svgToPNG(svgString: string, settings: PlotSettings): Promise<Blob> {
    const { PAPER_SIZES } = await import('../../commands/types');
    const paper = PAPER_SIZES[settings.paperSizeKey];
    const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
    const ph = settings.orientation === 'landscape' ? paper.height : paper.width;

    const scale  = settings.dpi / 25.4;     // pixels per mm
    const pxW    = Math.round(pw * scale);
    const pxH    = Math.round(ph * scale);

    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const img  = new Image();
    img.src    = url;
    await new Promise<void>((resolve, reject) => {
      img.onload  = () => resolve();
      img.onerror = () => reject(new Error('SVG image load failed'));
    });

    const canvas = document.createElement('canvas');
    canvas.width  = pxW;
    canvas.height = pxH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, pxW, pxH);
    ctx.drawImage(img, 0, 0, pxW, pxH);
    URL.revokeObjectURL(url);

    return new Promise<Blob>((res, rej) =>
      canvas.toBlob(b => b ? res(b) : rej(new Error('Canvas toBlob failed')), 'image/png')
    );
  }

  private async printSVG(svgString: string, settings: PlotSettings): Promise<void> {
    const { PAPER_SIZES } = await import('../../commands/types');
    const paper = PAPER_SIZES[settings.paperSizeKey];
    const pw = settings.orientation === 'landscape' ? paper.width : paper.height;
    const ph = settings.orientation === 'landscape' ? paper.height : paper.width;

    const html = `<!DOCTYPE html><html><head>
      <style>
        @page { size: ${pw}mm ${ph}mm; margin: 0; }
        body  { margin: 0; padding: 0; }
        svg   { display: block; width: 100%; height: 100%; }
      </style>
    </head><body>${svgString}</body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.opacity  = '0';
    iframe.style.pointerEvents = 'none';
    document.body.appendChild(iframe);
    iframe.contentDocument!.open();
    iframe.contentDocument!.write(html);
    iframe.contentDocument!.close();
    iframe.contentWindow!.focus();
    iframe.contentWindow!.print();
    iframe.contentWindow!.onafterprint = () => iframe.remove();
  }

  private getFilename(ext: string): string {
    const ts = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    return `drawing-${ts}.${ext}`;
  }
}
