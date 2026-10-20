import { chromium } from 'playwright'
import fs from 'node:fs'

const CASES = [
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

const OUT = 'docs/verification/materials-audit'
fs.mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  headless: false,
  args: ['--enable-unsafe-webgpu'],
})

const failures = []

for (const name of CASES) {
  const page = await browser.newPage({
    viewport: { width: 1520, height: 820 },
    deviceScaleFactor: 1,
  })
  const consoleErrors = []
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() !== 'error') return
    const text = message.text()
    if (text.includes('Failed to load resource')) return
    consoleErrors.push(text)
  })

  try {
    await page.goto(`http://localhost:5173/tests/manual/materials-audit.html?case=${name}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForFunction(
      () => window.__materialsAudit?.ready === true,
      undefined,
      { timeout: 30_000 },
    )
    const audit = await page.evaluate(() => window.__materialsAudit)

    if (audit.backends.webgl !== 'webgl') throw new Error(`WebGL pane is ${audit.backends.webgl}`)
    if (audit.backends.webgpu !== 'webgpu') throw new Error(`WebGPU pane is ${audit.backends.webgpu}`)
    if (audit.counts.lineLoops !== 0) throw new Error(`found ${audit.counts.lineLoops} LineLoop objects`)

    const unsupported = [...audit.errors, ...consoleErrors].filter((text) =>
      /not supported|validation|WebGPU/i.test(text),
    )
    if (unsupported.length > 0) throw new Error(unsupported.join('\n'))

    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/${name}.png` })
    console.log(`${name}: ok ${JSON.stringify(audit.counts)}`)
  } catch (error) {
    failures.push(`${name}: ${String(error)}`)
    console.error(`${name}: FAILED ${String(error)}`)
  } finally {
    await page.close()
  }
}

await browser.close()

if (failures.length > 0) {
  console.error(`\n${failures.length} case(s) failed:\n${failures.join('\n')}`)
  process.exit(1)
}

console.log(`\n${CASES.length} cases captured to ${OUT}`)
