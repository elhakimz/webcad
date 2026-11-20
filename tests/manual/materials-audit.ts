import * as THREE from 'three'
import { WebGPURenderer } from 'three/webgpu'
import { Viewer } from '../../src/render/Viewer'
import { GizmoRenderer } from '../../src/render/GizmoRenderer'
import { Dimension } from '../../src/core/model/Dimension'
import { Note } from '../../src/core/model/Note'
import { Point } from '../../src/core/model/Point'
import { SnapType } from '../../src/core/engine/SnapEngine'
import type { UnitsConfig } from '../../src/core/model/Document'
import type { RendererBackend, RendererSelection } from '../../src/render/RendererBackend'

type CaseName =
  | 'grid'
  | 'snap-endpoint'
  | 'snap-midpoint'
  | 'snap-center'
  | 'snap-intersection'
  | 'snap-perpendicular'
  | 'gizmo'
  | 'dimensions'
  | 'selection'
  | 'lines'
  | 'points-sprites'
  | 'shading'
  | 'note-dashed'

const CASES: CaseName[] = [
  'grid',
  'snap-endpoint',
  'snap-midpoint',
  'snap-center',
  'snap-intersection',
  'snap-perpendicular',
  'gizmo',
  'dimensions',
  'selection',
  'lines',
  'points-sprites',
  'shading',
  'note-dashed',
]

const params = new URLSearchParams(location.search)
const caseName = (params.get('case') ?? 'grid') as CaseName
if (!CASES.includes(caseName)) throw new Error(`Unknown audit case: ${caseName}`)

const errors: string[] = []
window.addEventListener('error', (event) => errors.push(String(event.error ?? event.message)))
window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)))
const originalConsoleError = console.error
console.error = (...args: unknown[]) => {
  errors.push(args.map(String).join(' '))
  originalConsoleError(...args)
}

const statusEl = document.querySelector<HTMLElement>('#status')!
document.querySelector<HTMLElement>('#case')!.textContent = caseName

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitForFont(viewer: Viewer): Promise<void> {
  for (let i = 0; i < 60; i++) {
    if (viewer.font) return
    await sleep(50)
  }
  throw new Error('font did not load')
}

function setZoom(viewer: Viewer, zoom: number): void {
  viewer.camera.zoom = zoom
  viewer.camera.updateProjectionMatrix()
}

function addLights(viewer: Viewer): void {
  viewer.scene.add(new THREE.AmbientLight(0xffffff, 0.45))
  const light = new THREE.DirectionalLight(0xffffff, 1.4)
  light.position.set(100, 100, 200)
  viewer.scene.add(light)
}

function addSelectionSolid(viewer: Viewer): void {
  const geometry = new THREE.BoxGeometry(36, 36, 6)
  const material = new THREE.MeshPhongMaterial({
    color: 0xebf2ff,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData = {
    type: 'Solid3D',
    faceMapping: [0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5],
    originalColor: 0xebf2ff,
  }

  const group = new THREE.Group()
  group.name = 'audit-solid'
  group.add(mesh)
  viewer.scene.add(group)

  const edgeGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-18, -18, 4),
    new THREE.Vector3(18, -18, 4),
    new THREE.Vector3(18, -18, 4),
    new THREE.Vector3(18, 18, 4),
  ])
  const edge = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0 }),
  )
  edge.userData = { entityId: 'audit-solid', edgeIndex: 0 }
  group.add(edge)

  viewer.highlightFace('audit-solid', 0)
  viewer.highlightEdge('audit-solid', 0)
  viewer.setSelectionBox({ x: -24, y: -24 }, { x: 24, y: 24 })
}

function seedSnap(viewer: Viewer, type: SnapType, x: number, y: number): void {
  viewer.addLine(-60, 0, 60, 0)
  viewer.addLine(-60, 20, 60, 20)
  viewer.addCircle(0, 0, 25)
  viewer.addLine(-40, -40, 40, 40)
  viewer.setCursor(x, y)
  viewer.setSnapMarker({ x, y, type })
  setZoom(viewer, 3)
}

function seedCase(viewer: Viewer): void {
  viewer.setTheme('dark')
  viewer.updateGrid(20, true)
  addLights(viewer)

  switch (caseName) {
    case 'grid':
      viewer.setAxesVisible(true)
      setZoom(viewer, 1.7)
      break

    case 'snap-endpoint':
      seedSnap(viewer, SnapType.ENDPOINT, -60, 0)
      break

    case 'snap-midpoint':
      seedSnap(viewer, SnapType.MIDPOINT, 0, 20)
      break

    case 'snap-center':
      seedSnap(viewer, SnapType.CENTER, 0, 0)
      break

    case 'snap-intersection':
      seedSnap(viewer, SnapType.INTERSECTION, 0, 0)
      break

    case 'snap-perpendicular':
      seedSnap(viewer, SnapType.PERPENDICULAR, 20, 0)
      break

    case 'gizmo': {
      const gizmo = new GizmoRenderer()
      const root = gizmo.build()
      gizmo.translateGroup.position.x = -35
      gizmo.rotateGroup.position.x = 35
      root.scale.setScalar(0.8)
      viewer.scene.add(root)
      setZoom(viewer, 2.2)
      break
    }

    case 'dimensions': {
      const units: UnitsConfig = { type: 'decimal', precision: 2, scale: 1 }
      const linear = new Dimension('dim-linear', 'LINEAR', -70, -30, 10, -30, 22)
      const aligned = new Dimension('dim-aligned', 'ALIGNED', 15, -25, 65, 15, 16)
      const angular = new Dimension('dim-angular', 'ANGULAR', -40, 10, -10, 40, 0)
      angular.properties = { vertex: { x: -20, y: 0 } }
      angular.dimLineLocation = { x: 20, y: 20 }
      const radius = new Dimension('dim-radius', 'RADIUS', 40, 25, 55, 25, 0)
      const diameter = new Dimension('dim-diameter', 'DIAMETER', -55, 35, -35, 35, 0)
      for (const dim of [linear, aligned, angular, radius, diameter]) {
        viewer.addDimension(dim, units)
      }
      setZoom(viewer, 1.8)
      break
    }

    case 'selection':
      addSelectionSolid(viewer)
      setZoom(viewer, 2.4)
      break

    case 'lines': {
      viewer.addLine(-60, -30, 60, -30)
      viewer.addLine(-60, -10, 60, -10, 'dash', undefined, undefined, true, 'DASHED')
      viewer.addCircle(0, 20, 15)
      const overlayGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-60, 40, 0),
        new THREE.Vector3(60, 40, 0),
      ])
      const overlay = new THREE.Line(
        overlayGeometry,
        new THREE.LineBasicMaterial({
          color: 0xffaa00,
          transparent: true,
          opacity: 0.45,
          depthTest: false,
          depthWrite: false,
        }),
      )
      overlay.renderOrder = 5
      viewer.scene.add(overlay)
      setZoom(viewer, 1.8)
      break
    }

    case 'points-sprites':
      viewer.addPoint(40, 20, 'audit-point')
      viewer.addTemporaryEntity(new Point('audit-preview-point', -20, 20))
      setZoom(viewer, 4)
      break

    case 'shading': {
      const modes = [
        { mode: 'SHADED', color: 0x4499ff },
        { mode: 'BLINN', color: 0x44ff99 },
        { mode: 'WIREFRAME', color: 0xff9944 },
      ] as const
      const meshes: THREE.Mesh[] = []
      modes.forEach(({ mode, color }) => {
        viewer.setShadingMode(mode)
        // Build before adding: setShadingMode() rewrites every mesh in the scene,
        // so adding each sphere immediately would convert the earlier ones too.
        meshes.push(
          new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), viewer.getMeshMaterial(color)),
        )
      })
      meshes.forEach((mesh, index) => {
        mesh.position.set((index - 1) * 30, 0, 0)
        viewer.scene.add(mesh)
      })
      setZoom(viewer, 2.5)
      break
    }

    case 'note-dashed':
      viewer.addNote(
        new Note('audit-note-free', null, { x: -40, y: -20 }, { x: 20, y: 20 }, 'Free note', 4),
      )
      viewer.addNote(
        new Note('audit-note-target', 'audit-solid', { x: 0, y: -10 }, { x: 40, y: 30 }, 'Target note', 4),
      )
      setZoom(viewer, 2)
      break
  }

  viewer.render()
}

function sceneCounts(viewer: Viewer) {
  const counts = { lineLoops: 0, lines: 0, points: 0, sprites: 0, meshes: 0 }
  viewer.scene.traverse((object) => {
    const candidate = object as THREE.Object3D & { isLineLoop?: boolean; isLine?: boolean; isPoints?: boolean; isSprite?: boolean; isMesh?: boolean }
    if (candidate.isLineLoop) counts.lineLoops++
    if (candidate.isLine) counts.lines++
    if (candidate.isPoints) counts.points++
    if (candidate.isSprite) counts.sprites++
    if (candidate.isMesh) counts.meshes++
  })
  return counts
}

function mergeCounts(a: ReturnType<typeof sceneCounts>, b: ReturnType<typeof sceneCounts>) {
  return {
    lineLoops: a.lineLoops + b.lineLoops,
    lines: a.lines + b.lines,
    points: a.points + b.points,
    sprites: a.sprites + b.sprites,
    meshes: a.meshes + b.meshes,
  }
}

async function main(): Promise<void> {
  const webglCanvas = document.querySelector<HTMLCanvasElement>('#webgl')!
  const webgpuCanvas = document.querySelector<HTMLCanvasElement>('#webgpu')!

  const webglViewer = new Viewer(webglCanvas)

  const gpuRenderer = new WebGPURenderer({ canvas: webgpuCanvas, antialias: true })
  await gpuRenderer.init()
  gpuRenderer.outputColorSpace = THREE.SRGBColorSpace
  gpuRenderer.shadowMap.enabled = true
  gpuRenderer.shadowMap.type = THREE.PCFSoftShadowMap
  const selection: RendererSelection = {
    renderer: gpuRenderer as unknown as RendererBackend,
    kind: 'webgpu',
    requested: 'webgpu',
    fellBack: false,
    reason: 'manual material audit',
  }
  const webgpuViewer = new Viewer(webgpuCanvas, selection)

  await Promise.all([waitForFont(webglViewer), waitForFont(webgpuViewer)])
  seedCase(webglViewer)
  seedCase(webgpuViewer)

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  await sleep(500)

  const counts = mergeCounts(sceneCounts(webglViewer), sceneCounts(webgpuViewer))
  const audit = {
    ready: true,
    case: caseName,
    backends: { webgl: webglViewer.rendererInfo.kind, webgpu: webgpuViewer.rendererInfo.kind },
    errors,
    counts,
  }
  ;(window as unknown as { __materialsAudit: typeof audit }).__materialsAudit = audit

  statusEl.classList.toggle('error', errors.length > 0)
  statusEl.textContent = errors.length > 0 ? errors.slice(0, 4).join('\n') : 'ready'
}

main().catch((error) => {
  console.error(error)
  statusEl.classList.add('error')
  statusEl.textContent = String(error)
  ;(window as unknown as { __materialsAudit: unknown }).__materialsAudit = {
    ready: false,
    case: caseName,
    backends: {},
    errors: [...errors, String(error)],
    counts: { lineLoops: -1, lines: 0, points: 0, sprites: 0, meshes: 0 },
  }
})
