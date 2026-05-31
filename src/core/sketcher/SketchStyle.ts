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
