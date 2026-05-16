import { RibbonBar } from "./RibbonBar";
import { Layer } from "../core/model/Layer";
import { aciToRgb } from "../core/engine/MathUtils";

export class LayerInfoRibbonBar extends RibbonBar {
  private layerNameEl: HTMLElement;
  private layerColorEl: HTMLElement;
  private layerColorBoxEl: HTMLElement;
  private layerLtypeEl: HTMLElement;
  private layerStatusEl: HTMLElement;

  constructor() {
    super("Layer Info");

    this.content.innerHTML = `
      <div class="ribbon-item">
        <span class="ribbon-label">L:</span>
        <span class="ribbon-value" id="ribbon-layer-name">0</span>
      </div>
      <div class="ribbon-item">
        <span class="ribbon-label">C:</span>
        <span class="ribbon-value" id="ribbon-layer-color">7</span>
        <span id="ribbon-layer-color-box" style="display:inline-block; width:12px; height:12px; margin-left:4px; border:1px solid #555; vertical-align:middle;"></span>
      </div>
      <div class="ribbon-item">
        <span class="ribbon-label">LT:</span>
        <span class="ribbon-value" id="ribbon-layer-ltype">CONTINUOUS</span>
      </div>
      <div class="ribbon-item">
        <span class="ribbon-value" id="ribbon-layer-status">ON</span>
      </div>
    `;

    this.layerNameEl = this.content.querySelector('#ribbon-layer-name')!;
    this.layerColorEl = this.content.querySelector('#ribbon-layer-color')!;
    this.layerColorBoxEl = this.content.querySelector('#ribbon-layer-color-box')!;
    this.layerLtypeEl = this.content.querySelector('#ribbon-layer-ltype')!;
    this.layerStatusEl = this.content.querySelector('#ribbon-layer-status')!;
  }

  public updateLayer(layer: Layer) {
    this.layerNameEl.textContent = layer.name;
    this.layerColorEl.textContent = layer.color.toString();
    
    // Convert ACI color to hex string for background color
    const hexColor = aciToRgb(layer.color);
    this.layerColorBoxEl.style.backgroundColor = `#${hexColor.toString(16).padStart(6, '0')}`;
    
    this.layerLtypeEl.textContent = layer.linetype;
    this.layerStatusEl.textContent = layer.isVisible ? "ON" : "OFF";
  }
}
