import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Command execution and its log output (WEBCAD-151).
 *
 * `run()` walks the same path as typing into the Command: line — echo, feed the
 * active command, fall back to starting one, print the result — so assertions here
 * are assertions about what a user would see.
 */
test.describe('commands', () => {
  test.describe.configure({ timeout: 120_000 });

  test('BOX builds a solid whose geometry can be read back', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('orthogonal');

    const result = await cad.runOk('BOX', '-50,-50', '50,50', '100');
    expect(result.output.join('\n')).toContain('3D Solid created.');

    const solid = await cad.onlySolid();
    expect(solid.vertices, 'eight corners').toBe(8);
    expect(solid.faces, 'six faces').toBe(6);
    expect(solid.features).toEqual(['Box']);
    expect(solid.bbox).toEqual({ min: [-50, -50, 0], max: [50, 50, 100] });

    // Counting vertices proves geometry arrived; only the kernel can say it is sound.
    const validity = await cad.expectValid(solid.id);
    expect(validity.faceCount, 'the kernel explores six faces on a box').toBe(6);
  });

  test('LINE lands where it was asked to', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    await cad.runOk('LINE', '10,20', '110,20');
    await cad.pressEnter();

    const objects = await cad.listObjects();
    expect(objects).toHaveLength(1);
    expect(objects[0].type).toBe('Line');

    const box = await cad.getBoundingBox(objects[0].id);
    expect(box.min[0]).toBeCloseTo(10, 6);
    expect(box.max[0]).toBeCloseTo(110, 6);
    expect(box.min[1]).toBeCloseTo(20, 6);
  });

  test('an unknown command is reported as a failure', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    const result = await cad.run('NOSUCHCOMMAND');
    expect(result.success).toBe(false);
  });

  test('the command log is readable without screenshotting the console', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.runOk('LINE', '0,0', '50,50');
    await cad.pressEnter();

    const log = await cad.getCommandLog();
    expect(log[0]).toContain('New drawing started.');
    expect(log.join('\n')).toContain('Command: LINE');
    expect(await cad.getCommandLog(2), 'lastN returns the tail').toHaveLength(2);
  });

  /**
   * KNOWN DEFECT — see the linked Plane issue. UNDO reports success but reverts
   * nothing, on both the command line and this bridge.
   *
   * `App.handleResult` wraps every dispatched action in
   * `startTransaction(doc.constraints)` / `commitTransaction(doc.constraints)`.
   * `startTransaction` stores the constraints array — empty, but an array, so
   * non-null — and `commitTransaction` pushes whenever that field is non-null, even
   * with zero records. So finishing a command pushes an empty transaction, and UNDO
   * pops that empty entry and pushes another one in its place: the stack goes
   * [ADD, TRANSFORM+ADD, EMPTY] -> [ADD, TRANSFORM+ADD, EMPTY] forever.
   *
   * Marked `test.fail()` so the suite stays green while the defect stands, and turns
   * red the moment it is fixed and this expectation starts passing.
   */
  test.fail('undo reverts a fillet', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('orthogonal');

    await cad.runOk('BOX', '-50,-50', '50,50', '100');
    const plain = await cad.onlySolid();

    await cad.runOk('SFILLET', '5', `EDGE:${plain.id}:0`);
    await cad.pressEnter();
    const filleted = await cad.getObject(plain.id);
    expect(filleted.vertices, 'the fillet itself works').toBeGreaterThan(plain.vertices!);

    const undo = await cad.run('UNDO');
    expect(undo.output.join('\n')).toContain('Undo performed.');

    const restored = await cad.getObject(plain.id);
    expect(restored.vertices, 'undo should return the sharp box').toBe(plain.vertices);
    expect(restored.features).toEqual(['Box']);
  });
});
