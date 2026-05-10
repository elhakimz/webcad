import { PlotSettings, PlotAreaType, PlotColorMode, PLOT_SCALES } from '../core/commands/types';

export class PlotDialog {
  private overlay: HTMLElement;
  private container: HTMLElement;

  constructor(
    private currentSettings: PlotSettings,
    private onPlot: (settings: PlotSettings) => void,
    private onCancel: () => void
  ) {
    this.overlay = document.createElement('div');
    this.overlay.className = 'plot-dialog-overlay';
    this.overlay.style.position = 'fixed';
    this.overlay.style.top = '0';
    this.overlay.style.left = '0';
    this.overlay.style.width = '100%';
    this.overlay.style.height = '100%';
    this.overlay.style.backgroundColor = 'rgba(0,0,0,0.5)';
    this.overlay.style.display = 'flex';
    this.overlay.style.justifyContent = 'center';
    this.overlay.style.alignItems = 'center';
    this.overlay.style.zIndex = '2000';

    this.container = document.createElement('div');
    this.container.className = 'plot-dialog';
    this.container.style.backgroundColor = 'var(--panel-bg)';
    this.container.style.border = '1px solid var(--border-color)';
    this.container.style.padding = '20px';
    this.container.style.color = 'var(--text-color)';
    this.container.style.fontFamily = 'var(--font-mono)';
    this.container.style.width = '400px';
    this.container.style.boxShadow = '0 4px 20px rgba(0,0,0,0.5)';

    this.createUI();
    this.overlay.appendChild(this.container);
  }

  private createUI() {
    const title = document.createElement('h2');
    title.textContent = 'Plot';
    title.style.marginTop = '0';
    title.style.marginBottom = '15px';
    title.style.borderBottom = '1px solid var(--border-color)';
    title.style.paddingBottom = '5px';
    this.container.appendChild(title);

    // Form
    const form = document.createElement('div');
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '10px';

    // Paper Size
    const paperRow = this.createRow('Paper Size:');
    const paperSelect = document.createElement('select');
    ['A4', 'A3', 'A2', 'A1', 'A0', 'Letter'].forEach(size => {
      const option = document.createElement('option');
      option.value = size;
      option.textContent = size;
      if (size === this.currentSettings.paperSizeKey) option.selected = true;
      paperSelect.appendChild(option);
    });
    paperRow.appendChild(paperSelect);
    form.appendChild(paperRow);

    // Orientation
    const orientRow = this.createRow('Orientation:');
    const orientSelect = document.createElement('select');
    ['landscape', 'portrait'].forEach(o => {
      const option = document.createElement('option');
      option.value = o;
      option.textContent = o.charAt(0).toUpperCase() + o.slice(1);
      if (o === this.currentSettings.orientation) option.selected = true;
      orientSelect.appendChild(option);
    });
    orientRow.appendChild(orientSelect);
    form.appendChild(orientRow);

    // Plot Area
    const areaRow = this.createRow('Plot Area:');
    const areaSelect = document.createElement('select');
    ['EXTENTS', 'DISPLAY', 'WINDOW'].forEach(area => {
      const option = document.createElement('option');
      option.value = area;
      option.textContent = area;
      if (area === this.currentSettings.areaType) option.selected = true;
      areaSelect.appendChild(option);
    });
    areaRow.appendChild(areaSelect);
    form.appendChild(areaRow);

    // Scale
    const scaleRow = this.createRow('Scale:');
    const scaleSelect = document.createElement('select');
    PLOT_SCALES.forEach(scale => {
      const option = document.createElement('option');
      option.value = scale.label;
      option.textContent = scale.label;
      if (scale.label === this.currentSettings.scale.label) option.selected = true;
      scaleSelect.appendChild(option);
    });
    scaleRow.appendChild(scaleSelect);
    form.appendChild(scaleRow);

    // Color Mode
    const colorRow = this.createRow('Color Mode:');
    const colorSelect = document.createElement('select');
    ['as_displayed', 'monochrome', 'grayscale'].forEach(mode => {
      const option = document.createElement('option');
      option.value = mode;
      option.textContent = mode === 'as_displayed' ? 'As Displayed' : mode.charAt(0).toUpperCase() + mode.slice(1);
      if (mode === this.currentSettings.colorMode) option.selected = true;
      colorSelect.appendChild(option);
    });
    colorRow.appendChild(colorSelect);
    form.appendChild(colorRow);

    // Output Format
    const outputRow = this.createRow('Output Format:');
    const outputSelect = document.createElement('select');
    ['svg', 'pdf'].forEach(format => {
      const option = document.createElement('option');
      option.value = format;
      option.textContent = format.toUpperCase();
      if (format === this.currentSettings.outputFormat) option.selected = true;
      outputSelect.appendChild(option);
    });
    outputRow.appendChild(outputSelect);
    form.appendChild(outputRow);

    this.container.appendChild(form);

    // Buttons
    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '10px';
    actions.style.marginTop = '20px';

    const plotBtn = document.createElement('button');
    plotBtn.textContent = 'Plot';
    plotBtn.style.padding = '5px 15px';
    plotBtn.style.backgroundColor = 'var(--panel-bg)';
    plotBtn.style.border = '1px solid var(--border-color)';
    plotBtn.style.color = 'var(--text-color)';
    plotBtn.style.cursor = 'pointer';
    plotBtn.addEventListener('click', () => {
      const selectedScaleLabel = scaleSelect.value;
      const selectedScale = PLOT_SCALES.find(s => s.label === selectedScaleLabel) || PLOT_SCALES[0];

      const settings: PlotSettings = {
        ...this.currentSettings, // Keep defaults for centered, offsets, etc.
        paperSizeKey: paperSelect.value,
        orientation: orientSelect.value as 'landscape' | 'portrait',
        areaType: areaSelect.value as PlotAreaType,
        scale: selectedScale,
        colorMode: colorSelect.value as PlotColorMode,
        outputFormat: outputSelect.value as 'svg' | 'pdf',
      };
      this.onPlot(settings);
      this.close();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '5px 15px';
    cancelBtn.style.backgroundColor = 'var(--panel-bg)';
    cancelBtn.style.border = '1px solid var(--border-color)';
    cancelBtn.style.color = 'var(--text-color)';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.addEventListener('click', () => {
      this.onCancel();
      this.close();
    });

    actions.appendChild(plotBtn);
    actions.appendChild(cancelBtn);
    this.container.appendChild(actions);

    // Apply styles to selects to match current design
    [paperSelect, orientSelect, areaSelect, scaleSelect, colorSelect, outputSelect].forEach(sel => {
      sel.style.backgroundColor = 'var(--bg-color)';
      sel.style.border = '1px solid var(--border-color)';
      sel.style.color = 'var(--text-color)';
      sel.style.fontFamily = 'var(--font-mono)';
      sel.style.padding = '2px';
      sel.style.flex = '1';
    });
  }

  private createRow(labelText: string): HTMLElement {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.gap = '10px';

    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.flex = '1';
    row.appendChild(label);

    return row;
  }

  public show() {
    document.body.appendChild(this.overlay);
  }

  public close() {
    this.overlay.remove();
  }
}
