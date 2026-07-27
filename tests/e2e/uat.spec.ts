import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * UAT — Undo/Redo restores solid B-rep to the geometry kernel (WEBCAD-20 / 138).
 *
 * Executable version of the UAT page in Plane. Nothing is mocked: every case drives
 * the real OpenCascade worker.
 *
 * Rewritten onto the test bridge (WEBCAD-156). The previous version aimed clicks with
 * a hand-rolled screen-to-world mapping that assumed the default top view, so in the
 * orthogonal view the box corners came out degenerate and the kernel threw
 * `[createBox] WASM C++ exception`. Solids are now built from typed coordinates and
 * edges addressed by id, so the same geometry is produced every run.
 *
 * UAT-01 to UAT-05 are marked `test.fail()`: they describe correct behaviour and they
 * do not hold today. UNDO reports success and reverts nothing, on the command line
 * and through the bridge alike — see tests/e2e/README.md for the mechanism. They will
 * turn red the moment that is fixed, which is the signal to re-run this UAT for real.
 */

const BOX = ['-50,-50', '50,50', '100'] as const;

const setup = async (page: import('@playwright/test').Page) => {
  const cad = await CadBridge.boot(page);
  await cad.setView('orthogonal');
  await cad.runOk('BOX', ...BOX);
  const solid = await cad.onlySolid();
  expect(solid.vertices, 'a plain box has eight corners').toBe(8);
  await cad.expectValid(solid.id);
  return { cad, solid };
};

const fillet = async (cad: CadBridge, id: string, radius: number, edgeIndex = 0) => {
  await cad.runOk('SFILLET', String(radius), `EDGE:${id}:${edgeIndex}`);
  await cad.pressEnter();
};

const chamfer = async (cad: CadBridge, id: string, distance: number, edgeIndex = 0) => {
  await cad.runOk('SCHAMFER', String(distance), `EDGE:${id}:${edgeIndex}`);
  await cad.pressEnter();
};

test.describe('UAT — solid B-rep restore on undo', () => {
  test.describe.configure({ timeout: 180_000 });

  test.fail('UAT-01 fillet, undo, then fillet again (critical)', async ({ page }) => {
    const { cad, solid } = await setup(page);

    await fillet(cad, solid.id, 5);
    const filleted = await cad.getObject(solid.id);
    expect(filleted.vertices, 'filleting rounds an edge, which adds geometry').toBeGreaterThan(
      solid.vertices!,
    );
    expect(filleted.features).toEqual(['Box', 'Fillet']);

    await cad.run('UNDO');

    const afterUndo = await cad.getObject(solid.id);
    expect(afterUndo.vertices, 'undo should restore the sharp box').toBe(solid.vertices);
    expect(afterUndo.features, 'and drop the fillet feature').toEqual(['Box']);

    // And the kernel must agree: a second fillet has to apply to the sharp box.
    await fillet(cad, solid.id, 15);
    const refilleted = await cad.getObject(solid.id);
    expect(refilleted.vertices).toBeGreaterThan(solid.vertices!);
    expect(refilleted.features).toEqual(['Box', 'Fillet']);
  });

  test.fail('UAT-02 redo restores the modified shape', async ({ page }) => {
    const { cad, solid } = await setup(page);

    await fillet(cad, solid.id, 5);
    const filleted = await cad.getObject(solid.id);

    await cad.run('UNDO');
    // Without this the case would pass vacuously: if undo does nothing, the shape is
    // still filleted and redo has nothing to prove.
    expect((await cad.getObject(solid.id)).vertices, 'undo must revert first').toBe(solid.vertices);

    await cad.run('REDO');

    const afterRedo = await cad.getObject(solid.id);
    expect(afterRedo.vertices, 'redo should restore the filleted geometry').toBe(filleted.vertices);
  });

  test.fail('UAT-03 shell, undo, solid restored', async ({ page }) => {
    const { cad, solid } = await setup(page);

    await cad.runOk('SHELL', '', '5');
    await cad.pressEnter();
    const shelled = await cad.getObject(solid.id);
    expect(shelled.vertices, 'shelling changes the geometry').not.toBe(solid.vertices);

    await cad.run('UNDO');

    const afterUndo = await cad.getObject(solid.id);
    expect(afterUndo.vertices, 'undo should restore the solid box').toBe(solid.vertices);
  });

  test.fail('UAT-04 chamfer, undo, solid restored', async ({ page }) => {
    const { cad, solid } = await setup(page);

    await chamfer(cad, solid.id, 5);
    const chamfered = await cad.getObject(solid.id);
    expect(chamfered.vertices, 'chamfering changes the geometry').not.toBe(solid.vertices);

    await cad.run('UNDO');

    const afterUndo = await cad.getObject(solid.id);
    expect(afterUndo.vertices, 'undo should restore the un-chamfered box').toBe(solid.vertices);
  });

  test.fail('UAT-05 several operations undone in sequence', async ({ page }) => {
    const { cad, solid } = await setup(page);

    await fillet(cad, solid.id, 5, 0);
    const afterFillet = await cad.getObject(solid.id);
    await chamfer(cad, solid.id, 4, 8);
    const afterChamfer = await cad.getObject(solid.id);
    expect(afterChamfer.vertices, 'the second operation changes geometry again').not.toBe(
      afterFillet.vertices,
    );

    await cad.run('UNDO');
    expect((await cad.getObject(solid.id)).vertices, 'first undo peels back the chamfer').toBe(
      afterFillet.vertices,
    );

    await cad.run('UNDO');
    expect((await cad.getObject(solid.id)).vertices, 'second undo returns the plain box').toBe(
      solid.vertices,
    );
  });

  test('UAT-06 the fillet itself produces valid geometry (regression)', async ({ page }) => {
    const { cad, solid } = await setup(page);

    await fillet(cad, solid.id, 5);
    const filleted = await cad.getObject(solid.id);

    // A fillet on one edge of a box replaces that edge with a cylindrical face.
    expect(filleted.faces, 'the rounded edge adds a face').toBe(solid.faces! + 1);
    expect(filleted.vertices).toBeGreaterThan(solid.vertices!);
    expect(filleted.brepBytes, 'the kernel snapshot grows with the feature').toBeGreaterThan(
      solid.brepBytes!,
    );
    expect(filleted.features).toEqual(['Box', 'Fillet']);

    // The counts above only describe the tessellation. Ask the kernel directly whether
    // the filleted solid is sound, and whether it still matches what is being drawn —
    // divergence between the two is the failure mode this UAT exists to catch.
    const validity = await cad.expectValid(solid.id);
    expect(validity.faceCount, 'the rounded edge becomes a seventh face in the B-rep').toBe(7);
  });

  /**
   * UAT-07 needs the OpenCascade worker terminated mid-session. No handle to it is
   * reachable from page scope, so this stays a manual check against the UAT page
   * rather than a fabricated automated pass.
   */
  test.skip('UAT-07 kernel failure degrades gracefully — manual only', async () => {});
});
