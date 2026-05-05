export class Layer {
  name: string
  color: number
  linetype: string
  isVisible: boolean
  isFrozen: boolean
  isLocked: boolean

  constructor(name: string, color = 7, linetype = "CONTINUOUS") {
    this.name = name
    this.color = color
    this.linetype = linetype
    this.isVisible = true
    this.isFrozen = false
    this.isLocked = false
  }

  clone(): Layer {
    const layer = new Layer(this.name, this.color, this.linetype)
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
    this.layers.set("0", new Layer("0", 7, "CONTINUOUS"))
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

  createLayer(name: string): Layer | null {
    if (this.layers.has(name)) return null
    const layer = new Layer(name)
    this.layers.set(name, layer)
    return layer
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