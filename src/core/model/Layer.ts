export class Layer {
  name: string
  color: number
  linetype: string
  lineWeight: number
  isVisible: boolean
  isFrozen: boolean
  isLocked: boolean

  constructor(name: string, color = 7, linetype = "CONTINUOUS", lineWeight = -1) {
    this.name = name
    this.color = color
    this.linetype = linetype
    this.lineWeight = lineWeight
    this.isVisible = true
    this.isFrozen = false
    this.isLocked = false
  }

  clone(): Layer {
    const layer = new Layer(this.name, this.color, this.linetype, this.lineWeight)
    layer.isVisible = this.isVisible
    layer.isFrozen = this.isFrozen
    layer.isLocked = this.isLocked
    return layer
  }
}

export class LayerManager {
  layers: Map<string, Layer> = new Map()
  currentLayerName: string = "0"

  constructor() {
    this.layers.set("0", new Layer("0", 7, "CONTINUOUS", -1))
  }

  getCurrentLayer(): Layer {
    return this.layers.get(this.currentLayerName) || this.layers.get("0")!
  }

  setCurrentLayer(name: string): Layer | null {
    const layer = this.layers.get(name)
    if (!layer) return null
    if (layer.isFrozen) return null
    this.currentLayerName = name
    return layer
  }

  createLayer(name: string, color = 7, linetype = "CONTINUOUS", lineWeight = -1): Layer {
    let layer = this.layers.get(name);
    if (layer) {
        layer.color = color;
        layer.linetype = linetype;
        layer.lineWeight = lineWeight;
    } else {
        layer = new Layer(name, color, linetype, lineWeight);
        this.layers.set(name, layer);
    }
    return layer;
  }

  deleteLayer(name: string): boolean {
    if (name === "0") return false
    if (name === this.currentLayerName) return false
    return this.layers.delete(name)
  }

  getLayer(name: string): Layer | null {
    return this.layers.get(name) || null
  }

  listLayers(): Layer[] {
    return Array.from(this.layers.values())
  }
}