import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu'],
})

async function probe(label, url) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
  })
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
    const solid = viewer.scene.getObjectByName(window.__webcadTest.listObjects()[0].id)
    const mesh = solid.children.find((c) => c.isMesh && c.userData.type === 'Solid3D')
    const receiverGeo = mesh.geometry.clone()
    receiverGeo.scale(8, 8, 0.01)
    const receiver = new mesh.constructor(receiverGeo, viewer.getMeshMaterial(0xffffff))
    receiver.position.set(0, 0, -55)
    receiver.receiveShadow = true
    receiver.castShadow = false
    receiver.name = 'tmp-receiver'
    viewer.scene.add(receiver)
    viewer.requestRender()
    await new Promise((r) => setTimeout(r, 100))

    const pixels = (dataUrl) => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0)
          resolve(ctx.getImageData(0, 0, c.width, c.height).data)
        }
        img.onerror = () => reject(new Error('decode'))
        img.src = dataUrl
      })
    }
    const diff = (a, b) => {
      let changed = 0
      let totalDelta = 0
      for (let i = 0; i < a.length; i += 4) {
        const d = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])
        if (d > 9) changed++
        totalDelta += d
      }
      const n = a.length / 4
      return { changed, changedRatio: changed / n, meanDelta: totalDelta / n }
    }

    const shadowOn = await pixels(viewer.captureImage('image/png'))
    const wasEnabled = viewer.renderer.shadowMap.enabled
    const wasType = viewer.renderer.shadowMap.type
    viewer.renderer.shadowMap.enabled = false
    const shadowOff = await pixels(viewer.captureImage('image/png'))
    const onOff = diff(shadowOn, shadowOff)
    viewer.renderer.shadowMap.enabled = wasEnabled

    viewer.renderer.shadowMap.type = 1
    const pcf = await pixels(viewer.captureImage('image/png'))
    viewer.renderer.shadowMap.type = 2
    const pcfSoft = await pixels(viewer.captureImage('image/png'))
    const pcfDiff = diff(pcf, pcfSoft)
    viewer.renderer.shadowMap.type = wasType

    return {
      renderer: window.__webcadTest.getRendererInfo(),
      shadowWasEnabled: wasEnabled,
      shadowWasType: wasType,
      shadowAfterRenderType: viewer.renderer.shadowMap.type,
      onOff,
      pcfDiff,
      receiverPresent: !!viewer.scene.getObjectByName('tmp-receiver'),
    }
  })

  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(report, null, 2))
  await page.close()
}

await probe('webgpu', 'http://localhost:5173/?renderer=webgpu')
await probe('webgl', 'http://localhost:5173/?renderer=webgl')
await browser.close()
