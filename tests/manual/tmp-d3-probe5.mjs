import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] })

async function probe(label, url) {
  const page = await browser.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__webcadTest, null, { timeout: 60_000 })
  await page.evaluate(async () => {
    await window.__webcadTest.whenReady()
    await window.__webcadTest.whenIdle()
  })
  const report = await page.evaluate(async () => {
    const viewer = window.app.viewer
    const solid = viewer.scene.children.find((o) => o.userData?.type === 'Solid3D')
    // The app starts with no solid; build a primitive from the app's own constructors.
    const boxGroup = window.__webcadTest ? null : null
    const sceneObj = viewer.scene
    const Scene = sceneObj.constructor
    const Mesh = viewer.cursorRenderer?.cursor?.constructor ?? null
    return { hasSolid: !!solid, hasCursor: !!viewer.cursorRenderer, meshCtor: Mesh?.name }
  })

  // Build a clean scene using classes reachable from app objects.
  const result = await page.evaluate(async () => {
    const viewer = window.app.viewer
    const renderer = viewer.renderer
    const Scene = viewer.scene.constructor
    const camera = viewer.camera
    const Ortho = camera.constructor
    const scene = new Scene()
    scene.background = null

    // Reuse constructors from objects the app already created.
    const anyLight = viewer.scene.children.find((o) => o.isDirectionalLight)
    const DirLight = anyLight.constructor
    const anyMesh = viewer.scene.children.flatMap((o) => o.children ?? []).find((o) => o.isMesh && o.userData?.type === 'Solid3D')
      ?? viewer.scene.children.find((o) => o.isMesh)
    const Mesh = anyMesh.constructor
    const BoxGeo = anyMesh.geometry.constructor
    const Phong = anyMesh.material.constructor
    const geo = new BoxGeo()
    geo.setAttribute('position', anyMesh.geometry.getAttribute('position').clone())
    geo.setIndex(anyMesh.geometry.getIndex().clone())

    const box = new Mesh(geo, new Phong({ color: 0xffffff, side: 2 }))
    box.scale.set(0.5, 0.5, 0.5)
    box.position.set(0, 0, 50)
    box.castShadow = true
    box.receiveShadow = true
    scene.add(box)

    const planeGeo = geo.clone()
    planeGeo.scale(10, 10, 0.01)
    const plane = new Mesh(planeGeo, new Phong({ color: 0xffffff, side: 2 }))
    plane.position.set(0, 0, 0)
    plane.receiveShadow = true
    scene.add(plane)

    const light = new DirLight(0xffffff, 1)
    light.position.set(200, 400, 500)
    light.castShadow = true
    light.shadow.mapSize.width = 1024
    light.shadow.mapSize.height = 1024
    light.shadow.camera.left = -500
    light.shadow.camera.right = 500
    light.shadow.camera.top = 500
    light.shadow.camera.bottom = -500
    light.shadow.camera.near = 0.5
    light.shadow.camera.far = 2000
    light.shadow.camera.updateProjectionMatrix()
    scene.add(light)

    const cam = new Ortho(-300, 300, 300, -300, 0.1, 2000)
    cam.position.set(0, 0, 500)
    cam.lookAt(0, 0, 0)
    cam.updateProjectionMatrix()

    const pixels = () => {
      const c = document.createElement('canvas')
      c.width = viewer.canvas.width; c.height = viewer.canvas.height
      const ctx = c.getContext('2d'); ctx.drawImage(viewer.canvas, 0, 0)
      return ctx.getImageData(0, 0, c.width, c.height).data
    }
    const diff = (a, b) => {
      let changed = 0, total = 0
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2])
        if (d > 9) changed++
        total += d
      }
      return { changedRatio: changed / (a.length / 4), meanDelta: total / (a.length / 4) }
    }

    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = 1
    renderer.render(scene, cam)
    const on = pixels()
    renderer.shadowMap.enabled = false
    renderer.render(scene, cam)
    const off = pixels()
    const d = diff(on, off)
    renderer.shadowMap.enabled = true
    renderer.render(viewer.scene, viewer.camera)

    return {
      renderer: window.__webcadTest.getRendererInfo(),
      diff: d,
      map: light.shadow.map ? { w: light.shadow.map.width, h: light.shadow.map.height } : null,
      hasAnyMesh: !!anyMesh,
      geometryAttrCount: anyMesh?.geometry?.getAttribute('position')?.count,
    }
  })
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(result, null, 2))
  await page.close()
}

await probe('webgpu', 'http://localhost:5173/?renderer=webgpu')
await probe('webgl', 'http://localhost:5173/?renderer=webgl')
await browser.close()
