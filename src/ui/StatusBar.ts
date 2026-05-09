import { Layer } from "../core/model/Layer";

export interface DraftingStatus {
  snap: boolean;
  grid: boolean;
  ortho: boolean;
  xyz: boolean;
}

export class StatusBar {
  private layerEl: HTMLElement;
  private coordsEl: HTMLElement;
  private snapTag: HTMLElement;
  private gridTag: HTMLElement;
  private orthoTag: HTMLElement;

  constructor() {
    this.layerEl = document.getElementById('layer-info')!;
    this.coordsEl = document.getElementById('coords-info')!;
    this.snapTag = document.getElementById('tag-snap')!;
    this.gridTag = document.getElementById('tag-grid')!;
    this.orthoTag = document.getElementById('tag-ortho')!;
  }

  updateLayer(layer: Layer) {
    const status = layer.isVisible ? "ON" : "OFF";
    this.layerEl.textContent = `Layer ${layer.name} [${status}] C:${layer.color} L:${layer.linetype}`;
  }

  updateCoordinates(x: number, y: number) {
    this.coordsEl.textContent = `${x.toFixed(4)}, ${y.toFixed(4)}`;
  }

  updateDraftingStatus(status: DraftingStatus) {
    this.updateTag(this.snapTag, status.snap);
    this.updateTag(this.gridTag, status.grid);
    this.updateTag(this.orthoTag, status.ortho);
  }

  private updateTag(el: HTMLElement, active: boolean) {
    if (active) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }

  onTagClick(type: 'snap' | 'grid' | 'ortho', callback: () => void) {
    const el = type === 'snap' ? this.snapTag : (type === 'grid' ? this.gridTag : this.orthoTag);
    el.addEventListener('click', callback);
  }
}
