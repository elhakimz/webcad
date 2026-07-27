import { test, expect } from '@playwright/test';
import { CadApp } from './helpers';

/**
 * Right-hand chrome: the docked command toolbars, the tool-window rail
 * (Layers / Properties / Objects / File Operations / Block Library /
 * Object Generator / Sketching / SCAD Projects), and the view-control widget.
 *
 * The docked toolbars belong to the Modelling tab; the Scripting tab collapses
 * the docking pane and is used for loading and executing SCAD scripts.
 */

test.describe('Docked command toolbars (Modelling)', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
    await expect(app.tab('Modelling')).toHaveClass(/active/);
  });

  test('all four toolbars are docked and visible', async () => {
    await expect(app.dockingPane).toBeVisible();
    for (const bar of ['draw', 'dim', 'edit', 'solid'] as const) {
      await expect(app.toolbar(bar)).toBeVisible();
    }
  });

  test('Draw toolbar exposes the 2D drawing commands', async () => {
    for (const cmd of ['LINE', 'CIRCLE', 'ARC', 'PLINE', 'POLYGON', 'TEXT', 'HATCH']) {
      await expect(app.toolButton('draw', cmd)).toHaveCount(1);
    }
  });

  test('Solid toolbar exposes primitives and boolean operations', async () => {
    for (const cmd of ['BOX', 'CYLINDER', 'SPHERE', 'EXTRUDE', 'REVOLVE', 'UNION', 'SUBTRACT', 'INTERSECT']) {
      await expect(app.toolButton('solid', cmd)).toHaveCount(1);
    }
  });

  test('Edit and Dim toolbars expose their commands', async () => {
    for (const cmd of ['Move', 'Copy', 'Erase', 'Rotate', 'Trim', 'Fillet']) {
      await expect(app.toolButton('edit', cmd)).toHaveCount(1);
    }
    for (const cmd of ['Linear', 'Aligned', 'Radius', 'Diameter', 'Angular']) {
      await expect(app.toolButton('dim', cmd)).toHaveCount(1);
    }
  });

  test('a Draw toolbar button starts its command', async () => {
    await app.toolButton('draw', 'CIRCLE').click();
    await expect(app.log).toContainText('Command: CIRCLE');
    await expect(app.prompt).toContainText('CIRCLE specify center point:');
  });

  test('an Edit toolbar button starts a selection command', async () => {
    await app.toolButton('edit', 'Move').click();
    await expect(app.prompt).toContainText('Select objects:');
  });

  test('a toolbar button drives the same flow as typing the command', async () => {
    await app.toolButton('draw', 'CIRCLE').click();
    await app.clickOrigin();
    await app.input('25');
    await expect(app.log).toContainText('[R:25.0000]');
  });
});

test.describe('Tool-window rail (Modelling)', () => {
  let app: CadApp;

  const RAIL = [
    'Layers',
    'Properties',
    'Objects',
    'File Operations',
    'Block Library',
    'Object Generator',
    'Sketching',
    'SCAD Projects',
  ];

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
  });

  test('exposes all eight tool windows', async () => {
    for (const title of RAIL) {
      await expect(app.toolWindowButton(title)).toHaveCount(1);
    }
  });

  test('opens the Layers window and marks the rail item active', async () => {
    const btn = app.toolWindowButton('Layers');
    await btn.click();
    await expect(app.toolWindow('layers')).toHaveClass(/visible/);
    await expect(btn).toHaveClass(/active/);
  });

  test('switches between tool windows', async () => {
    await app.toolWindowButton('Layers').click();
    await expect(app.toolWindow('layers')).toHaveClass(/visible/);

    await app.toolWindowButton('Properties').click();
    await expect(app.toolWindow('properties')).toHaveClass(/visible/);
    await expect(app.toolWindow('layers')).not.toHaveClass(/visible/);
  });
});

test.describe('View control widget', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
  });

  test('offers shading modes and standard view presets', async () => {
    await expect(app.viewControl).toBeVisible();
    for (const mode of ['Wireframe', 'Shaded', 'Phong', 'Blinn', 'Zebra']) {
      await expect(app.shaderItem(mode)).toHaveCount(1);
    }
    for (const face of ['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right']) {
      await expect(app.cubeFace(face)).toHaveCount(1);
    }
  });

  test('view selector changes the active view', async () => {
    await app.viewSelector.selectOption('FRONT');
    await expect(app.viewSelector).toHaveValue('FRONT');
  });

  test('cycling the standard views does not throw', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    for (const view of ['FRONT', 'RIGHT', 'TOP']) {
      await app.viewSelector.selectOption(view);
      await expect(app.viewSelector).toHaveValue(view);
    }
    expect(errors, errors.join('\n')).toHaveLength(0);
  });

  test('shading modes can be selected from the shader popup', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));

    // The shader list is a popup that opens on clicking the shader button.
    await app.shaderButton.click();
    await expect(app.shaderItem('Wireframe')).toBeVisible();

    await app.shaderItem('Wireframe').click();
    await app.shaderButton.click();
    await app.shaderItem('Shaded').click();

    expect(errors, errors.join('\n')).toHaveLength(0);
  });
});

test.describe('Scripting tab (SCAD)', () => {
  let app: CadApp;

  test.beforeEach(async ({ page }) => {
    app = new CadApp(page);
    await app.boot();
    await app.tab('Scripting').click();
    await expect(app.tab('Scripting')).toHaveClass(/active/);
  });

  test('collapses the Modelling docking pane', async () => {
    // The docked command toolbars are Modelling-only chrome.
    await expect(app.dockingPane).not.toBeVisible();
  });

  test('opens the SCAD Projects window with a script list', async ({ page }) => {
    const win = app.toolWindow('scad_projects');
    await expect(win).toHaveClass(/visible/);
    await expect(win.getByRole('button', { name: 'REFRESH' })).toBeVisible();
    // The bundled example library should list .scad files.
    await expect(win.locator('li').filter({ hasText: '.scad' }).first()).toBeVisible();
  });

  test('loads a script into the CodeMirror editor', async ({ page }) => {
    await page
      .locator('#tool-window-scad_projects li')
      .filter({ hasText: 'box.scad' })
      .first()
      .click();

    const editor = page.locator('#scad-editor-window .cm-content');
    await expect(editor).toBeVisible({ timeout: 30000 });
    await expect(editor).toContainText('parametric_box', { timeout: 30000 });
  });

  test('exposes the script action buttons', async ({ page }) => {
    await page
      .locator('#tool-window-scad_projects li')
      .filter({ hasText: 'box.scad' })
      .first()
      .click();

    await expect(page.locator('#scad-run-btn')).toBeVisible({ timeout: 30000 });
    for (const id of [
      '#scad-run-btn',
      '#scad-addtodoc-btn',
      '#scad-custom-btn',
      '#scad-export-3d-btn',
      '#scad-export-2d-btn',
    ]) {
      await expect(page.locator(id)).toBeVisible();
    }
  });

  test('returning to Modelling restores the docked toolbars', async () => {
    await app.tab('Modelling').click();
    await expect(app.tab('Modelling')).toHaveClass(/active/);
    await expect(app.dockingPane).toBeVisible();
    await expect(app.toolbar('draw')).toBeVisible();
  });
});
