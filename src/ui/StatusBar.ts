import { Layer } from "../core/model/Layer";

export interface DraftingStatus {
  snap: boolean;
  grid: boolean;
  ortho: boolean;
  otrack: boolean;
  xyz: boolean;
  mode3d: boolean;
  axis: boolean;
}

export class StatusBar {
  private layerEl: HTMLElement;
  private coordsEl: HTMLElement;
  private snapTag: HTMLElement;
  private gridTag: HTMLElement;
  private orthoTag: HTMLElement;
  private osnapTag: HTMLElement;
  private otrackTag: HTMLElement;

  constructor() {
    this.layerEl = document.getElementById('layer-info')!;
    this.coordsEl = document.getElementById('coords-info')!;
    this.snapTag = document.getElementById('tag-snap')!;
    this.gridTag = document.getElementById('tag-grid')!;
    this.orthoTag = document.getElementById('tag-ortho')!;
    this.osnapTag = document.getElementById('tag-osnap')!;
    this.otrackTag = document.getElementById('tag-otrack')!;
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
    this.updateTag(this.osnapTag, status.osnap);
    this.updateTag(this.otrackTag, status.otrack);
  }

  private updateTag(el: HTMLElement, active: boolean) {
    if (active) {
      el.classList.add('active');
    } else {
      el.classList.remove('active');
    }
  }

  onTagClick(type: 'snap' | 'grid' | 'ortho' | 'osnap' | 'otrack', callback: () => void) {
    const el = type === 'snap' ? this.snapTag : (type === 'grid' ? this.gridTag : (type === 'ortho' ? this.orthoTag : (type === 'osnap' ? this.osnapTag : this.otrackTag)));
    el.addEventListener('click', callback);
  }
}
