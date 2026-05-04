export class StatusBar {
  private layerEl: HTMLElement;
  private coordsEl: HTMLElement;

  constructor() {
    this.layerEl = document.getElementById('layer-info')!;
    this.coordsEl = document.getElementById('coords-info')!;
  }

  updateLayer(name: string) {
    this.layerEl.textContent = `Layer ${name}`;
  }

  updateCoordinates(x: number, y: number) {
    this.coordsEl.textContent = `${x.toFixed(4)}, ${y.toFixed(4)}`;
  }
}
