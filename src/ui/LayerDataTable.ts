import { DataTable } from "./DataTable";
import { aciToRgb } from "../core/engine/MathUtils";

export class LayerDataTable extends DataTable {
  constructor(parent: HTMLElement) {
    super(parent);
    this.headers = ['Name', 'Color', 'Ltype', 'LWeight', 'On', 'Freeze'];
  }

  protected onColorRightClickCallback: ((layerName: string, x: number, y: number) => void) | null = null;
  protected onLtypeRightClickCallback: ((layerName: string, x: number, y: number) => void) | null = null;
  protected onLineweightRightClickCallback: ((layerName: string, x: number, y: number) => void) | null = null;
  protected onVisibilityToggleCallback: ((layerName: string) => void) | null = null;
  protected onFreezeToggleCallback: ((layerName: string) => void) | null = null;

  public onColorRightClick(callback: (layerName: string, x: number, y: number) => void) {
    this.onColorRightClickCallback = callback;
  }

  public onLtypeRightClick(callback: (layerName: string, x: number, y: number) => void) {
    this.onLtypeRightClickCallback = callback;
  }

  public onLineweightRightClick(callback: (layerName: string, x: number, y: number) => void) {
    this.onLineweightRightClickCallback = callback;
  }

  public onVisibilityToggle(callback: (layerName: string) => void) {
    this.onVisibilityToggleCallback = callback;
  }

  public onFreezeToggle(callback: (layerName: string) => void) {
    this.onFreezeToggleCallback = callback;
  }

  public setLayers(layers: Array<{ name: string, visible: boolean, frozen: boolean, color: number, linetype: string, lineweight: number }>) {
    const rows = layers.map(layer => {
      // Color Swatch
      const colorSwatch = document.createElement('div');
      colorSwatch.style.width = '14px';
      colorSwatch.style.height = '14px';
      const hexColor = aciToRgb(layer.color);
      colorSwatch.style.backgroundColor = `#${hexColor.toString(16).padStart(6, '0')}`;
      colorSwatch.style.border = '1px solid var(--border-color)';
      colorSwatch.style.margin = 'auto';
      colorSwatch.style.cursor = 'pointer';

      colorSwatch.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onColorRightClickCallback) {
          this.onColorRightClickCallback(layer.name, e.clientX, e.clientY);
        }
      });

      // Visibility Icon (On/Off)
      const visIcon = document.createElement('span');
      visIcon.textContent = layer.visible ? '👁' : '🕶';
      visIcon.style.cursor = 'pointer';
      visIcon.title = layer.visible ? 'On' : 'Off';
      
      const triggerVisibility = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onVisibilityToggleCallback) {
          this.onVisibilityToggleCallback(layer.name);
        }
      };
      visIcon.onclick = triggerVisibility;
      visIcon.addEventListener('contextmenu', triggerVisibility);

      // Freeze Icon (Thaw/Freeze)
      const freezeIcon = document.createElement('span');
      freezeIcon.textContent = layer.frozen ? '❄️' : '☀️';
      freezeIcon.style.cursor = 'pointer';
      freezeIcon.title = layer.frozen ? 'Frozen' : 'Thawed';
      
      const triggerFreeze = (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onFreezeToggleCallback) {
          this.onFreezeToggleCallback(layer.name);
        }
      };
      freezeIcon.onclick = triggerFreeze;
      freezeIcon.addEventListener('contextmenu', triggerFreeze);

      const ltypeSpan = document.createElement('span');
      ltypeSpan.textContent = layer.linetype;
      ltypeSpan.style.cursor = 'pointer';
      ltypeSpan.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onLtypeRightClickCallback) {
          this.onLtypeRightClickCallback(layer.name, e.clientX, e.clientY);
        }
      });

      const lwSpan = document.createElement('span');
      lwSpan.textContent = layer.lineweight && layer.lineweight > 0 ? `${layer.lineweight}mm` : "Default";
      lwSpan.style.cursor = 'pointer';
      lwSpan.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (this.onLineweightRightClickCallback) {
          this.onLineweightRightClickCallback(layer.name, e.clientX, e.clientY);
        }
      });

      return [layer.name, colorSwatch, ltypeSpan, lwSpan, visIcon, freezeIcon];
    });

    this.setData(this.headers, rows);
  }
}
