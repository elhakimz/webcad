import { RibbonBar } from "./RibbonBar";
import { Layer } from "../core/model/Layer";

export class LayerInfoRibbonBar extends RibbonBar {
  private layerNameEl: HTMLElement;
  private layerColorEl: HTMLElement;
  private layerLtypeEl: HTMLElement;
  private layerStatusEl: HTMLElement;

  constructor() {
    super("Layer Info");

    this.content.innerHTML = `
      <div class="ribbon-item">
        <span class="ribbon-label">Layer:</span>
        <span class="ribbon-value" id="ribbon-layer-name">0</span>
      </div>
      <div class="ribbon-item">
        <span class="ribbon-label">Color:</span>
        <span class="ribbon-value" id="ribbon-layer-color">7</span>
      </div>
      <div class="ribbon-item">
        <span class="ribbon-label">Ltype:</span>
        <span class="ribbon-value" id="ribbon-layer-ltype">CONTINUOUS</span>
      </div>
      <div class="ribbon-item">
        <span class="ribbon-label">Status:</span>
        <span class="ribbon-value" id="ribbon-layer-status">ON</span>
      </div>
    `;

    this.layerNameEl = this.content.querySelector('#ribbon-layer-name')!;
    this.layerColorEl = this.content.querySelector('#ribbon-layer-color')!;
    this.layerLtypeEl = this.content.querySelector('#ribbon-layer-ltype')!;
    this.layerStatusEl = this.content.querySelector('#ribbon-layer-status')!;
  }

  public updateLayer(layer: Layer) {
    this.layerNameEl.textContent = layer.name;
    this.layerColorEl.textContent = layer.color.toString();
    this.layerLtypeEl.textContent = layer.linetype;
    this.layerStatusEl.textContent = layer.isVisible ? "ON" : "OFF";
  }
}
