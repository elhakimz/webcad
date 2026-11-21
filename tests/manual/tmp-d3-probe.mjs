import { chromium } from 'playwright'

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu'],
})

async function probe(label, url) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 2,
  })
  page.on('console', (msg) => {
    const text = msg.text()
    if (/shadow|clip|warn|error/i.test(text)) console.log(`[${label}] console ${msg.type()}: ${text}`)
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
    const bridge = window.__webcadTest
    const info = bridge.getRendererInfo()

    const stats = (dataUrl) => {
      return new Promise((resolve, reject) => {
        const img = new Image()
        img.onload = () => {
          const c = document.createElement('canvas')
          c.width = img.width
          c.height = img.height
          const ctx = c.getContext('2d')
          ctx.drawImage(img, 0, 0)
          const data = ctx.getImageData(0, 0, c.width, c.height).data
          let sum = 0
          let nonBlack = 0
          let max = 0
          const colors = new Set()
          for (let i = 0; i < data.length; i += 4) {
            const v = data[i] + data[i + 1] + data[i + 2]
            sum += v
            if (v > 12) nonBlack++
            if (v > max) max = v
            if (colors.size < 5000) colors.add((data[i] << 16) | (data[i + 1] << 8) | data[i + 2])
          }
          resolve({
            width: img.width,
            height: img.height,
            mean: sum / (data.length / 4) / 3,
            nonBlackRatio: nonBlack / (data.length / 4),
            max,
            colors: colors.size,
          })
        }
        img.onerror = () => reject(new Error('image decode failed'))
        img.src = dataUrl
      })
    }

    const capture = viewer.captureImage('image/png')
    const captureStats = await stats(capture)

    const shadowWas = viewer.renderer.shadowMap.enabled
    viewer.renderer.shadowMap.enabled = false
    const noShadow = viewer.captureImage('image/png')
    const noShadowStats = await stats(noShadow)
    viewer.renderer.shadowMap.enabled = shadowWas

    const rect = bridge.getCanvasRect()
    const obj = bridge.listObjects().find((o) => o.type === 'Solid3D')
    const center = bridge.worldToScreen(bridge.getObject(obj.id).transform.position)
    const pick = bridge.pickAt(center.x, center.y)

    return {
      info,
      captureLength: capture.length,
      captureStats,
      noShadowStats,
      shadowWas,
      rendererCtor: viewer.renderer.constructor.name,
      rendererKeys: {
        clippingPlanes: viewer.renderer.clippingPlanes,
        localClippingEnabled: viewer.renderer.localClippingEnabled,
        shadowMap: { ...viewer.renderer.shadowMap },
      },
      canvasSize: { width: viewer.canvas.width, height: viewer.canvas.height, rect },
      obj,
      center,
      pick,
    }
  })

  console.log(`\n=== ${label} ===`)
  console.log(JSON.stringify(report, null, 2))
  await page.close()
}

await probe('webgpu', 'http://localhost:5173/?renderer=webgpu')
await probe('webgl', 'http://localhost:5173/?renderer=webgl')
await browser.close()
