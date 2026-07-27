import { test, expect } from '@playwright/test';
import { CadBridge } from './bridge';

/**
 * Selection through the test bridge (WEBCAD-150), plus the one case that has to go
 * through real mouse events: box-select, where the drag gesture is the feature.
 */

const boxAt = async (cad: CadBridge, c1: string, c2: string, height: string) => {
  await cad.runOk('BOX', c1, c2, height);
  const solid = await cad.onlySolid();
  return solid.id;
};

test.describe('selection', () => {
  test.describe.configure({ timeout: 120_000 });

  test('objects can be selected, added to, toggled and cleared', async ({ page }) => {
    const cad = await CadBridge.boot(page);

    await cad.runOk('LINE', '0,0', '100,0');
    await cad.pressEnter();
    await cad.runOk('LINE', '0,50', '100,50');
    await cad.pressEnter();

    const ids = (await cad.listObjects()).map((o) => o.id);
    expect(ids).toHaveLength(2);

    expect((await cad.selectObject(ids[0])).objects).toEqual([ids[0]]);
    expect((await cad.selectObject(ids[1], 'add')).objects.sort()).toEqual([...ids].sort());
    expect((await cad.selectObject(ids[0], 'toggle')).objects).toEqual([ids[1]]);
    expect((await cad.selectObject(ids[0])).objects, 'replace drops the previous selection').toEqual([ids[0]]);
    expect((await cad.clearSelection()).objects).toEqual([]);
  });

  test('faces and edges of a solid are addressable by id', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('orthogonal');
    const id = await boxAt(cad, '-50,-50', '50,50', '100');

    const faces = await cad.getFaces(id);
    expect(faces, 'a box has six faces').toHaveLength(6);

    const selected = await cad.selectFace(id, faces[0].id);
    expect(selected.faces).toEqual([{ objectId: id, faceId: faces[0].id }]);

    const edges = await cad.getEdges(id);
    expect(edges.length, 'a box has at least twelve edge polylines').toBeGreaterThanOrEqual(12);
    const withEdge = await cad.selectEdge(id, edges[0].id);
    expect(withEdge.edges).toEqual([{ objectId: id, edgeId: edges[0].id }]);

    await cad.clearSelection();
    const empty = await cad.getSelection();
    expect(empty.faces).toEqual([]);
    expect(empty.edges).toEqual([]);
  });

  test('vertex selection is refused, not faked', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('orthogonal');
    const id = await boxAt(cad, '-50,-50', '50,50', '100');

    const vertices = await cad.getVertices(id);
    expect(vertices, 'a box has exactly eight corners').toHaveLength(8);

    const err = await cad.expectRejection('selectVertex', id, vertices[0].id);
    expect(err.code, 'the app has no vertex selection model').toBe('unsupported');
    expect((await cad.getSelection()).vertices).toEqual([]);
  });

  test('pickAt reports what a click would hit', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('orthogonal');
    const id = await boxAt(cad, '-50,-50', '50,50', '100');
    await cad.zoomToFit();

    const face = (await cad.getFaces(id))[0];
    const p = await cad.worldToScreen(face.centroid);
    const rect = await cad.getCanvasRect();
    const hit = await cad.pickAt(p.clientX - rect.x, p.clientY - rect.y);

    expect(hit.type, 'a point on the solid should hit it').not.toBe('empty');
    expect('objectId' in hit && hit.objectId).toBe(id);

    // A corner of the canvas is well clear of a centred, fitted box.
    expect((await cad.pickAt(4, 4)).type).toBe('empty');
  });

  test('a real drag gesture box-selects (Epic 6 — the aiming comes from the bridge)', async ({ page }) => {
    const cad = await CadBridge.boot(page);
    await cad.setView('top');

    await cad.runOk('LINE', '0,0', '100,0');
    await cad.pressEnter();
    await cad.runOk('LINE', '300,300', '400,300');
    await cad.pressEnter();

    const [first, second] = (await cad.listObjects()).map((o) => o.id);
    await cad.zoomToFit();
    // zoomToFit crops to the geometry; back off so the drag corners are on screen too.
    await cad.zoom(0.7);
    await cad.clearSelection();

    // Window-select left-to-right around the upper line only. The window sits high in
    // the viewport because the command log covers the lower part of the canvas.
    await cad.input.dragSelect([240, 240, 0], [460, 360, 0]);

    const selection = await cad.getSelection();
    expect(selection.objects, 'the dragged window should capture the enclosed line').toContain(second);
    expect(selection.objects, 'and nothing outside it').not.toContain(first);
  });
});
