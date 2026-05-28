import { describe, it, expect } from 'vitest';
import { tokenisePath, readNumber } from '../SvgPathParser';

describe('SvgPathParser', () => {
  describe('readNumber', () => {
    it('parses simple integers', () => {
      expect(readNumber("123", 0).value).toBe(123);
      expect(readNumber("-45", 0).value).toBe(-45);
    });
    it('parses floats', () => {
      expect(readNumber("12.34", 0).value).toBe(12.34);
      expect(readNumber(".5", 0).value).toBe(0.5);
    });
    it('parses scientific notation', () => {
      expect(readNumber("1e3", 0).value).toBe(1000);
      expect(readNumber("1.5e-2", 0).value).toBe(0.015);
    });
    it('handles whitespace', () => {
      expect(readNumber("  42  ", 0).value).toBe(42);
    });
  });

  describe('tokenisePath', () => {
    it('tokenises simple commands', () => {
      const tokens = tokenisePath("M 10 20 L 30 40 Z");
      expect(tokens).toEqual([
        { cmd: 'M', args: [10, 20] },
        { cmd: 'L', args: [30, 40] },
        { cmd: 'Z', args: [] }
      ]);
    });

    it('handles implicit repetition (M -> L)', () => {
      const tokens = tokenisePath("M 10 20 30 40 50 60");
      expect(tokens).toEqual([
        { cmd: 'M', args: [10, 20] },
        { cmd: 'L', args: [30, 40] },
        { cmd: 'L', args: [50, 60] }
      ]);
    });

    it('handles implicit repetition (L)', () => {
      const tokens = tokenisePath("L 10 20 30 40");
      expect(tokens).toEqual([
        { cmd: 'L', args: [10, 20] },
        { cmd: 'L', args: [30, 40] }
      ]);
    });

    it('handles commas and mixed spacing', () => {
      const tokens = tokenisePath("M10,20L30,40Z");
      expect(tokens).toEqual([
        { cmd: 'M', args: [10, 20] },
        { cmd: 'L', args: [30, 40] },
        { cmd: 'Z', args: [] }
      ]);
    });

    it('handles complex paths with multiple arg sets', () => {
      const tokens = tokenisePath("M 0 0 C 1 1 2 2 3 3 4 4 5 5 6 6");
      expect(tokens).toEqual([
        { cmd: 'M', args: [0, 0] },
        { cmd: 'C', args: [1, 1, 2, 2, 3, 3] },
        { cmd: 'C', args: [4, 4, 5, 5, 6, 6] }
      ]);
    });
  });
});
