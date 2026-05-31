// src/core/sketcher/SketchStyle.ts

export const STYLE = {
  NORMAL:       1,  // unconstrained entity — white/light gray
  UNDERCONSTRAINED: 2,  // has free params — blue (SolveSpace / CATIA standard)
  FULLYCONSTRAINED: 3,  // dof=0, solved — green
  OVERCONSTRAINED:  4,  // singular Jacobian — red
  CONSTRUCTION: 5,  // construction geometry — darker, dashed
  SELECTED:     6,  // orange highlight
  HOVERED:      7,  // dim orange
  DRAW_ERROR:   8,  // failed regen — red with stipple
} as const;

export const SKETCH_COLORS = {
  [STYLE.NORMAL]:           0xebf2ff, // default entity color
  [STYLE.UNDERCONSTRAINED]: 0x4da6ff, // blue
  [STYLE.FULLYCONSTRAINED]: 0x44cc77, // green
  [STYLE.OVERCONSTRAINED]:  0xff4444, // red
  [STYLE.CONSTRUCTION]:     0x666666, // darker gray
  [STYLE.SELECTED]:         0xffa500, // orange
  [STYLE.HOVERED]:          0xffd27f, // dim orange
  [STYLE.DRAW_ERROR]:       0xff0000, // bright red
  
  // Constraint UI colors
  CONSTRAINT:       0x38bdf8, // cyan-ish
  CONSTRAINT_HV:    0xc084fc, // purple
} as const;

/**
 * Converts a hex number (0xRRGGBB) to a CSS color string (#RRGGBB)
 */
export function toCssColor(hex: number): string {
  return '#' + hex.toString(16).padStart(6, '0');
}
