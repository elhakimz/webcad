import { PlotEngine } from './PlotEngine';
import { DEFAULT_PLOT_SETTINGS, PAPER_SIZES } from '../commands/types';
import { describe, it, expect } from 'vitest';

describe('PlotEngine', () => {

  const makeDoc = (entities: any[], layers: any[]) => ({
    getAllEntities: () => entities,
    layers: {
      getLayer: (name: string) => layers.find(l => l.name === name) ?? null,
      listLayers: () => layers,
    },
    blocks: { getBlock: () => null },
  }) as any;

  describe('getPlottableEntities', () => {
    const engine = new PlotEngine();
    const settings = { ...DEFAULT_PLOT_SETTINGS, layerOverrides: {} };

    it('includes entity on visible unlocked layer', () => {
      const layer  = { name: '0', isVisible: true, isFrozen: false, isLocked: false, color: 7 };
      const entity = { id: '1', layer: '0', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      expect(engine.getPlottableEntities(settings, doc)).toContain(entity);
    });

    it('excludes entity on frozen layer', () => {
      const layer  = { name: 'frozen', isVisible: true, isFrozen: true, isLocked: false, color: 7 };
      const entity = { id: '2', layer: 'frozen', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      expect(engine.getPlottableEntities(settings, doc)).not.toContain(entity);
    });

    it('excludes entity on hidden layer', () => {
      const layer  = { name: 'hidden', isVisible: false, isFrozen: false, isLocked: false, color: 7 };
      const entity = { id: '3', layer: 'hidden', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      expect(engine.getPlottableEntities(settings, doc)).not.toContain(entity);
    });

    it('excludes entity with layerOverride visible=false', () => {
      const layer  = { name: '0', isVisible: true, isFrozen: false, isLocked: false, color: 7 };
      const entity = { id: '4', layer: '0', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      const s = { ...settings, layerOverrides: { '0': { visible: false } } };
      expect(engine.getPlottableEntities(s, doc)).not.toContain(entity);
    });

    it('includes entity on locked layer (locked = selectable, plottable)', () => {
      const layer  = { name: 'locked', isVisible: true, isFrozen: false, isLocked: true, color: 7 };
      const entity = { id: '5', layer: 'locked', getBoundingBox: () => ({}) };
      const doc    = makeDoc([entity], [layer]);
      expect(engine.getPlottableEntities(settings, doc)).toContain(entity);
    });
  });

  describe('computeScaleFactor', () => {
    const engine = new PlotEngine();

    it('fit scale fills paper without exceeding', () => {
      const s = { ...DEFAULT_PLOT_SETTINGS, paperSizeKey: 'A4', orientation: 'landscape' as const,
                  scale: { isFit: true, drawUnit: 1, paperMM: 1, label: 'Fit' } };
      const vp = { minX: 0, minY: 0, maxX: 1000, maxY: 500 };
      const factor = engine.computeScaleFactor(s, vp);
      const paperW = PAPER_SIZES.A4.width - 20;   // minus margins
      const paperH = PAPER_SIZES.A4.height - 20;
      expect(factor * 1000).toBeLessThanOrEqual(paperW + 0.001);
      expect(factor * 500).toBeLessThanOrEqual(paperH + 0.001);
    });

    it('1:100 scale returns 0.01 mm per drawing unit', () => {
      const s = { ...DEFAULT_PLOT_SETTINGS,
                  scale: { isFit: false, drawUnit: 100, paperMM: 1, label: '1:100' } };
      const vp = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
      expect(engine.computeScaleFactor(s, vp)).toBeCloseTo(0.01);
    });
  });

  describe('resolveEntityColor', () => {
    const engine = new PlotEngine();
    const layer: any = { color: 7, name: '0' };

    it('monochrome returns black', () => {
      const entity: any = { color: 1, layer: '0' };
      const result = engine.resolveEntityColor(entity, layer, 'monochrome', {});
      expect(result).toEqual({ r: 0, g: 0, b: 0 });
    });

    it('BYLAYER uses layer color', () => {
      const entity: any = { color: 256, layer: '0' };  // 256 = BYLAYER
      const result = engine.resolveEntityColor(entity, layer, 'as_displayed', {});
      // layer.color=7 → aciToRgb(7) — just verify it doesn't crash
      expect(result).toBeDefined();
      expect(typeof result.r).toBe('number');
    });
  });
});
