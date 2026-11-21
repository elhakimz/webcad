import { chromium } from 'playwright'

const browser = await chromium.launch({ headless: false, args: ['--enable-unsafe-webgpu'] })

async function probe(label, url) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 })
  await page.goto(url, { waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!window.__webcadTest, null, { timeout: 60_000 })
  await page.evaluate(async () => {
    await window.__webcadTest.whenReady()
    await window.__webcadTest.whenIdle()
    window.__webcadTest.setView('orthogonal')
    await window.__webcadTest.executeCommand('BOX', '-50,-50', '50,50', '100')
    window.__webcadTest.zoomToFit()
    await window.__webcadTest.whenIdle()
  })
  const report = await page.evaluate(async () => {
    const viewer = window.app.viewer
    const light = viewer.directionalLight
    const solid = viewer.scene.getObjectByName(window.__webcadTest.listObjects()[0].id)
    const mesh = solid.children.find((c) => c.isMesh && c.userData.type === 'Solid3D')
    const geo = mesh.geometry.clone(); geo.scale(8, 8, 0.01)
    const receiver = new mesh.constructor(geo, viewer.getMeshMaterial(0xffffff))
    receiver.position.set(0, 0, -55); receiver.receiveShadow = true; receiver.castShadow = false
    viewer.scene.add(receiver)

    const snapshot = () => ({
      enabled: viewer.renderer.shadowMap.enabled,
      autoUpdate: viewer.renderer.shadowMap.autoUpdate,
      needsUpdate: viewer.renderer.shadowMap.needsUpdate,
      type: viewer.renderer.shadowMap.type,
      map: light.shadow.map ? { w: light.shadow.map.width, h: light.shadow.map.height } : null,
      mapPass: light.shadow.mapPass ? { w: light.shadow.mapPass.width, h: light.shadow.mapPass.height } : null,
      bias: light.shadow.bias,
      normalBias: light.shadow.normalBias,
      radius: light.shadow.radius,
      cameraPos: light.shadow.camera.position.toArray(),
      lightPos: light.position.toArray(),
      lightTarget: light.target.position.toArray(),
      lightIntensity: light.intensity,
      lightVisible: light.visible,
      lightParent: light.parent?.type ?? null,
      receiver: {
        receiveShadow: receiver.receiveShadow,
        castShadow: receiver.castShadow,
        material: receiver.material.type,
        visible: receiver.visible,
        worldZ: receiver.getWorldPosition(new receiver.position.constructor()).z,
      },
      casters: [],
      stats: { ...viewer.renderer.info.render },
    })
    const casters = []
    viewer.scene.traverse((o) => {
      if (o.isMesh && (o.castShadow || o.receiveShadow)) {
        casters.push({ name: o.name, type: o.type, cast: o.castShadow, receive: o.receiveShadow, mat: o.material?.type })
      }
    })

    viewer.requestRender()
    await new Promise((r) => setTimeout(r, 100))
    const before = snapshot(); before.casters = casters

    viewer.renderer.shadowMap.needsUpdate = true
    const forced = viewer.captureImage('image/png')

    const pixels = (dataUrl) => new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
        resolve(ctx.getImageData(0, 0, c.width, c.height).data)
      }
      img.onerror = () => reject(new Error('decode'))
      img.src = dataUrl
    })
    const on = await pixels(viewer.captureImage('image/png'))
    const forcedPixels = await pixels(forced)
    let changed = 0
    for (let i = 0; i < on.length; i += 4) {
      if (Math.abs(on[i]-forcedPixels[i]) + Math.abs(on[i+1]-forcedPixels[i+1]) + Math.abs(on[i+2]-forcedPixels[i+2]) > 9) changed++
    }

    return {
      renderer: window.__webcadTest.getRendererInfo(),
      before,
      forcedChangedRatio: changed / (on.length / 4),
      afterForced: snapshot(),
    }
  })
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(report, null, 2))
  await page.close()
}

await probe('webgpu', 'http://localhost:5173/?renderer=webgpu')
await probe('webgl', 'http://localhost:5173/?renderer=webgl')
await browser.close()
