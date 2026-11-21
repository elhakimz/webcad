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
    const geo = mesh.geometry.clone()
    geo.scale(8, 8, 0.01)
    const receiver = new mesh.constructor(geo, viewer.getMeshMaterial(0xffffff))
    receiver.position.set(0, 0, -55)
    receiver.receiveShadow = true
    receiver.castShadow = false
    viewer.scene.add(receiver)

    const lightBefore = {
      castShadow: light.castShadow,
      shadowType: viewer.renderer.shadowMap.type,
      camera: {
        left: light.shadow.camera.left,
        right: light.shadow.camera.right,
        top: light.shadow.camera.top,
        bottom: light.shadow.camera.bottom,
        near: light.shadow.camera.near,
        far: light.shadow.camera.far,
        projectionMatrix: light.shadow.camera.projectionMatrix.elements.slice(),
        projectionMatrixVersion: light.shadow.camera.projectionMatrix.elements.join(','),
      },
    }

    light.shadow.camera.updateProjectionMatrix()
    viewer.requestRender()
    await new Promise((r) => setTimeout(r, 100))

    const pixels = (dataUrl) => new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => {
        const c = document.createElement('canvas')
        c.width = img.width; c.height = img.height
        const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0)
        resolve(ctx.getImageData(0, 0, c.width, c.height).data)
      }
      img.onerror = () => reject(new Error('decode'))
      img.src = dataUrl
    })
    const diff = (a, b) => {
      let changed = 0, total = 0
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i]-b[i]) + Math.abs(a[i+1]-b[i+1]) + Math.abs(a[i+2]-b[i+2])
        if (d > 9) changed++
        total += d
      }
      const n = a.length / 4
      return { changedRatio: changed / n, meanDelta: total / n }
    }

    const on = await pixels(viewer.captureImage('image/png'))
    viewer.renderer.shadowMap.enabled = false
    const off = await pixels(viewer.captureImage('image/png'))
    viewer.renderer.shadowMap.enabled = true
    const after = {
      projectionMatrixVersion: light.shadow.camera.projectionMatrix.elements.join(','),
      shadowType: viewer.renderer.shadowMap.type,
    }
    return { renderer: window.__webcadTest.getRendererInfo(), lightBefore, after, diff: diff(on, off) }
  })
  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(report, null, 2))
  await page.close()
}

await probe('webgpu', 'http://localhost:5173/?renderer=webgpu')
await probe('webgl', 'http://localhost:5173/?renderer=webgl')
await browser.close()
