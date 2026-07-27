import { Page, Locator, expect } from '@playwright/test';

/**
 * Shared helpers for the WebCAD e2e suite.
 *
 * The app boots straight into the drawing editor — there is no main-menu gate
 * (the old `#main-menu-screen` markup was removed from index.html; `MainMenuScreen.ts`
 * is now orphaned dead code). Anything waiting on `#main-menu-input` will hang.
 */

/** Message printed to the command log once the editor is ready. */
export const READY_MESSAGE = 'New drawing started.';

export class CadApp {
  readonly cmd: Locator;
  readonly log: Locator;
  readonly prompt: Locator;
  readonly canvas: Locator;

  constructor(public readonly page: Page) {
    this.cmd = page.locator('#cmd');
    this.log = page.locator('#command-log');
    this.prompt = page.locator('#command-prompt');
    this.canvas = page.locator('#c');
  }

  /**
   * Navigate and wait until the editor is interactive.
   *
   * Deliberately does not wait for the `load` event: the page pulls a large
   * OpenCascade WASM bundle, so `load` can outlast any sane timeout on a cold
   * dev server. The app's own ready signal is the command log message, which is
   * what actually gates interaction.
   */
  async boot(): Promise<void> {
    await this.page.goto('/', { waitUntil: 'domcontentloaded' });
    await this.cmd.waitFor({ state: 'visible', timeout: 60000 });
    await expect(this.cmd).toBeEnabled({ timeout: 60000 });
    await expect(this.log).toContainText(READY_MESSAGE, { timeout: 60000 });
    await this.waitForStableCanvas();
  }

  /**
   * Wait until the canvas stops resizing.
   *
   * Panels and the docking pane settle slightly after the ready message, which
   * changes the canvas width. Since world coordinates are derived from the canvas
   * centre, clicking before it settles lands points off by half the width delta.
   */
  async waitForStableCanvas(): Promise<void> {
    let previous = -1;
    for (let i = 0; i < 40; i++) {
      const b = await this.canvas.boundingBox();
      const width = b?.width ?? -1;
      if (width > 0 && width === previous) return;
      previous = width;
      await this.page.waitForTimeout(100);
    }
    throw new Error('canvas never stopped resizing');
  }

  /** Type a command into the command line and submit it. */
  async run(command: string): Promise<void> {
    await this.cmd.fill(command);
    await this.cmd.press('Enter');
  }

  /** Submit raw input (a radius, a distance, an option letter) to the active command. */
  async input(value: string): Promise<void> {
    await this.cmd.fill(value);
    await this.cmd.press('Enter');
  }

  /** Accept a prompt default. */
  async acceptDefault(): Promise<void> {
    await this.cmd.press('Enter');
  }

  async logText(): Promise<string> {
    return this.log.innerText();
  }

  /**
   * Cancel whatever is running.
   *
   * The blur is required, not cosmetic: pressing Escape while focus is still in
   * `#cmd` does not cancel the command (verified — no `*Cancel*` is logged), even
   * though `main.ts` appears to handle Escape ahead of its focus guard. Tracked
   * as a bug. Blur rather than clicking the canvas, because the tool-window rail
   * overlays the canvas corner and would swallow the click, and a canvas click
   * would feed a point into the active command.
   */
  async cancel(): Promise<void> {
    await this.cmd.blur();
    await this.page.keyboard.press('Escape');
  }

  /** Move keyboard focus off the command input so single-key shortcuts reach the app. */
  async focusViewport(): Promise<void> {
    await this.cmd.blur();
  }

  private async box() {
    const b = await this.canvas.boundingBox();
    if (!b) throw new Error('#c canvas has no bounding box — viewport failed to render');
    return b;
  }

  /**
   * Click a point in canvas-local pixels (origin = canvas top-left).
   */
  async clickCanvas(x: number, y: number): Promise<void> {
    const b = await this.box();
    await this.page.mouse.click(b.x + x, b.y + y);
  }

  async moveCanvas(x: number, y: number): Promise<void> {
    const b = await this.box();
    await this.page.mouse.move(b.x + x, b.y + y);
  }

  /**
   * Click the canvas centre, which is world origin (0,0) at the default view.
   * Verified: a click here logs `X:0.0000, Y:0.0000`.
   */
  async clickOrigin(): Promise<void> {
    const b = await this.box();
    await this.page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  }

  /**
   * Viewport pixels for a world point.
   *
   * Asks the test bridge to project through the live camera. The arithmetic
   * fallback below (`screenX = width/2 + worldX`) is only correct at the default
   * top view with zoom 1 and the camera on the origin — and it drifts whenever the
   * canvas resizes after boot, which is what made `clickWorld` land points ~10 units
   * off and produced intermittent `Distance: 210.7969` failures.
   */
  private async worldPixel(wx: number, wy: number): Promise<{ x: number; y: number }> {
    const projected = await this.page.evaluate((p) => {
      const bridge = (window as never as { __webcadTest?: { worldToScreen(v: number[]): { clientX: number; clientY: number } } })
        .__webcadTest;
      return bridge ? bridge.worldToScreen([p.wx, p.wy, 0]) : null;
    }, { wx, wy });

    if (projected) return { x: projected.clientX, y: projected.clientY };

    const b = await this.box();
    return { x: b.x + b.width / 2 + wx, y: b.y + b.height / 2 - wy };
  }

  /** Click using world coordinates. */
  async clickWorld(wx: number, wy: number): Promise<void> {
    const p = await this.worldPixel(wx, wy);
    await this.page.mouse.click(p.x, p.y);
  }

  async moveWorld(wx: number, wy: number): Promise<void> {
    const p = await this.worldPixel(wx, wy);
    await this.page.mouse.move(p.x, p.y);
  }

  /** Press and hold the pointer at a world point (starts a grip drag). */
  async pressWorld(wx: number, wy: number): Promise<void> {
    await this.moveWorld(wx, wy);
    await this.page.mouse.down();
  }

  /** Read the coordinate readout as numbers. */
  async readCoords(): Promise<{ x: number; y: number; z: number }> {
    const text = await this.coords.innerText();
    const num = (axis: string) => {
      const m = text.match(new RegExp(`${axis}:(-?[\\d.]+)`));
      if (!m) throw new Error(`no ${axis} in coordinate readout: "${text}"`);
      return parseFloat(m[1]);
    };
    return { x: num('X'), y: num('Y'), z: num('Z') };
  }

  /**
   * Width/height of the current selection, parsed from the log line
   * `[Selection] N object. Width: W, Height: H`.
   */
  async lastSelectionSize(): Promise<{ width: number; height: number }> {
    const text = await this.logText();
    const matches = [...text.matchAll(/Width:\s*([\d.]+),\s*Height:\s*([\d.]+)/g)];
    const last = matches.at(-1);
    if (!last) throw new Error('no selection size found in command log');
    return { width: parseFloat(last[1]), height: parseFloat(last[2]) };
  }

  /** Draw a line between two world points and leave the command. */
  async drawLine(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<void> {
    await this.run('LINE');
    await expect(this.prompt).toContainText('specify first point');
    await this.clickWorld(from.x, from.y);
    // Wait for the command to actually consume the first point before sending the
    // second. Firing both back to back is a race: under load the run has been seen
    // stopping at "P1[...]" with the second click lost, which then fails 15s later on
    // a missing "Line created." and looks like a rendering bug rather than a test one.
    await expect(this.prompt).toContainText('To point');
    await this.clickWorld(to.x, to.y);
    await expect(this.log).toContainText('Line created.');
    await this.page.keyboard.press('Escape');
  }

  // ---- ribbon (status bar) ----
  get coords() {
    return this.page.locator('#ribbon-coords');
  }
  ribbonToggle(name: 'ortho' | 'otrack' | 'snap' | 'grid' | 'osnap') {
    return this.page.locator(`#ribbon-${name}`);
  }
  get layerName() {
    return this.page.locator('#ribbon-layer-name');
  }

  // ---- chrome ----
  tab(name: 'Modelling' | 'Scripting') {
    return this.page.locator('.app-tab', { hasText: name });
  }
  /** Left icon rail that opens tool windows. */
  toolWindowButton(title: string) {
    return this.page.locator(`#tool-window-bar .bar-item[title="${title}"]`);
  }
  toolWindow(key: string) {
    return this.page.locator(`#tool-window-${key}`);
  }

  // ---- right-hand docked toolbars ----
  get dockingPane() {
    return this.page.locator('#docking-pane');
  }
  toolbar(which: 'draw' | 'dim' | 'edit' | 'solid') {
    const id = {
      draw: '#floating-toolbar',
      dim: '#dim-toolbar',
      edit: '#edit-toolbar',
      solid: '#solid-toolbar',
    }[which];
    return this.page.locator(id);
  }
  /** A command button inside one of the docked toolbars, addressed by its tooltip. */
  toolButton(which: 'draw' | 'dim' | 'edit' | 'solid', title: string) {
    return this.toolbar(which).locator(`.tool-button[title="${title}"]`);
  }

  // ---- view control widget ----
  get viewControl() {
    return this.page.locator('#daz-view-control');
  }
  /** The 🌑 button that opens the shading-mode popup. */
  get shaderButton() {
    return this.viewControl.locator('.daz-shader-btn');
  }
  /** A shading mode. Only visible once `shaderButton` has been clicked. */
  shaderItem(name: string) {
    return this.viewControl.locator('.daz-shader-item', { hasText: name });
  }
  get viewSelector() {
    return this.viewControl.locator('.daz-view-selector');
  }
  cubeFace(name: string) {
    return this.viewControl.locator('.daz-cube-face', { hasText: name });
  }
}

/**
 * Collects page errors and console errors for the lifetime of a test.
 * Some noise is expected from the WASM kernel warming up, so callers filter.
 */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}
