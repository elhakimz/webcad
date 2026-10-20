// @vitest-environment jsdom
import * as THREE from 'three'
import { describe, expect, it, vi } from 'vitest'
import { WebGLNodesHandler } from 'three/examples/jsm/tsl/WebGLNodesHandler.js'
import { createZebraMaterial, enableNodeMaterials } from './ZebraMaterial'

describe('createZebraMaterial', () => {
  it('builds an unlit node material with a colour node', () => {
    const material = createZebraMaterial()

    expect(material.isMeshBasicNodeMaterial).toBe(true)
    expect(material.side).toBe(THREE.DoubleSide)
    expect(material.name).toBe('ZebraSurface')
    expect(material.colorNode).toBeTruthy()
  })
})

describe('enableNodeMaterials', () => {
  it('installs a WebGL nodes handler on the renderer', () => {
    const setNodesHandler = vi.fn()
    const renderer = { setNodesHandler } as unknown as THREE.WebGLRenderer

    enableNodeMaterials(renderer)

    expect(setNodesHandler).toHaveBeenCalledTimes(1)
    expect(setNodesHandler.mock.calls[0][0]).toBeInstanceOf(WebGLNodesHandler)
  })
})
