import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { createZebraMaterial, enableNodeMaterials } from '../../src/render/ZebraMaterial'

function createPane() {
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x0e1216)

  const geometry = new RoundedBoxGeometry(2, 2, 2, 6, 0.35)
  scene.add(new THREE.Mesh(geometry, createZebraMaterial()))

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100)
  camera.position.set(3.4, 2.6, 3.8)
  camera.lookAt(0, 0, 0)

  return { scene, camera }
}

async function main() {
  const glCanvas = document.querySelector<HTMLCanvasElement>('#webgl')!
  const gpuCanvas = document.querySelector<HTMLCanvasElement>('#webgpu')!
  const status = document.querySelector<HTMLElement>('#status')!
  const gpuCaption = document.querySelector<HTMLElement>('#webgpu-caption')!

  const glPane = createPane()
  const glRenderer = new THREE.WebGLRenderer({ canvas: glCanvas, antialias: true })
  glRenderer.outputColorSpace = THREE.SRGBColorSpace
  enableNodeMaterials(glRenderer)

  const gpuPane = createPane()
  const gpuRenderer = new WebGPURenderer({ canvas: gpuCanvas, antialias: true })
  await gpuRenderer.init()
  gpuRenderer.outputColorSpace = THREE.SRGBColorSpace

  const isWebGPU = (gpuRenderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
  gpuCaption.textContent = isWebGPU
    ? 'WebGPURenderer (WebGPU backend)'
    : 'WebGPURenderer (WebGL 2 fallback)'

  const resize = (renderer: THREE.WebGLRenderer | WebGPURenderer, canvas: HTMLCanvasElement) => {
    const width = Math.max(1, canvas.clientWidth)
    const height = Math.max(1, canvas.clientHeight)
    renderer.setPixelRatio(window.devicePixelRatio)
    renderer.setSize(width, height, false)
  }

  const draw = () => {
    resize(glRenderer, glCanvas)
    resize(gpuRenderer, gpuCanvas)

    glPane.camera.aspect = glCanvas.clientWidth / Math.max(1, glCanvas.clientHeight)
    glPane.camera.updateProjectionMatrix()
    gpuPane.camera.aspect = gpuCanvas.clientWidth / Math.max(1, gpuCanvas.clientHeight)
    gpuPane.camera.updateProjectionMatrix()

    glRenderer.render(glPane.scene, glPane.camera)
    void gpuRenderer.renderAsync(gpuPane.scene, gpuPane.camera)
  }

  window.addEventListener('resize', draw)
  draw()

  status.textContent = isWebGPU
    ? 'WebGPU backend active'
    : 'WebGPU unavailable — three fell back to WebGL 2'
  document.body.dataset.parityReady = 'true'
}

main().catch((error) => {
  console.error(error)
  document.querySelector('#status')!.textContent = `failed: ${String(error)}`
})
