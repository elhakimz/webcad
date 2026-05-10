import { Command, CommandResponse, CommandAction,
         PlotSettings, DEFAULT_PLOT_SETTINGS, SelectionBoxPreview } from './types';
import { UnitsConfig, IDocument } from '../model/Document';

export class PlotCommand implements Command {
  step = 0;
  private windowP1: { x: number; y: number } | null = null;
  static pendingSettings: PlotSettings | null = null;

  getPrompt(): string {
    if (this.step === 0) return 'PLOT [Enter=dialog / WINDOW / EXTENTS / DISPLAY]:';
    if (this.step === 1) return 'First corner of plot window:';
    if (this.step === 2) return 'Other corner:';
    return '';
  }

  // Enter key or keyword
  onInput(text: string, _id: string, _units: UnitsConfig): CommandResponse | undefined {
    if (this.step !== 0) return undefined;
    const val = text.trim().toUpperCase();

    if (val === '' || val === 'DIALOG') {
      return { action: 'showPlotDialog' } as CommandAction;
    }
    if (val === 'WINDOW') {
      this.step = 1;
      return 'First corner of plot window:';
    }
    if (val === 'EXTENTS') {
      return { action: 'plot', plotSettings: { ...DEFAULT_PLOT_SETTINGS, areaType: 'EXTENTS' } } as CommandAction;
    }
    if (val === 'DISPLAY') {
      return { action: 'plot', plotSettings: { ...DEFAULT_PLOT_SETTINGS, areaType: 'DISPLAY' } } as CommandAction;
    }
    return 'Unknown option. Enter to open dialog, or WINDOW / EXTENTS / DISPLAY:';
  }

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    if (this.step === 0) {
      // First click → open dialog
      return { action: 'showPlotDialog' } as CommandAction;
    }
    if (this.step === 1) {
      this.windowP1 = { x, y };
      this.step = 2;
      return 'Other corner:';
    }
    if (this.step === 2 && this.windowP1) {
      const x1 = Math.min(this.windowP1.x, x);
      const y1 = Math.min(this.windowP1.y, y);
      const x2 = Math.max(this.windowP1.x, x);
      const y2 = Math.max(this.windowP1.y, y);
      if (x2 - x1 < 1e-6 || y2 - y1 < 1e-6) {
        this.windowP1 = null;
        this.step = 1;
        return 'Window too small. First corner:';
      }
      const settings: PlotSettings = {
        ...(PlotCommand.pendingSettings || DEFAULT_PLOT_SETTINGS),
        areaType: 'WINDOW',
        areaWindow: { x1, y1, x2, y2 },
      };
      PlotCommand.pendingSettings = null; // Clear it
      return { action: 'plot', plotSettings: settings } as CommandAction;
    }
    return '';
  }

  getPreview(x: number, y: number): SelectionBoxPreview | null {
    if (this.step === 2 && this.windowP1) {
      return {
        type: 'selection_box',
        x1: this.windowP1.x, y1: this.windowP1.y,
        x2: x, y2: y,
        isCrossing: false,
      };
    }
    return null;
  }
}
