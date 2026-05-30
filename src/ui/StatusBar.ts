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
    this.layerEl.innerHTML = `<span class="bp6-ui-text bp6-text-muted">Layer:</span> <span class="bp6-monospace-text">${layer.name}</span> <span class="bp6-text-muted">[${status}] C:${layer.color} L:${layer.linetype}</span>`;
  }

  updateCoordinates(x: number, y: number) {
    this.coordsEl.innerHTML = `<span class="bp6-monospace-text">${x.toFixed(4)}, ${y.toFixed(4)}</span>`;
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
