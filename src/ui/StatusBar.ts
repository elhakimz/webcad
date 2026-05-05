import { Layer } from "../core/model/Layer";

export class StatusBar {
  private layerEl: HTMLElement;
  private coordsEl: HTMLElement;

  constructor() {
    this.layerEl = document.getElementById('layer-info')!;
    this.coordsEl = document.getElementById('coords-info')!;
  }

  updateLayer(layer: Layer) {
    const status = layer.isVisible ? "ON" : "OFF";
    this.layerEl.textContent = `Layer ${layer.name} [${status}] C:${layer.color} L:${layer.linetype}`;
  }

  updateCoordinates(x: number, y: number) {
    this.coordsEl.textContent = `${x.toFixed(4)}, ${y.toFixed(4)}`;
  }
}
