The dimensional constraint is a single scalar equation touching exactly **two points**, with a nonlinear (distance) form. Its Jacobian involves the unit vector along the segment, which makes the PBD correction purely along the line between the two points.

---

## Equation

```
f = sqrt( (P2.x - P1.x)² + (P2.y - P1.y)² ) - D_target = 0

Shorthand:
  dx   = P2.x - P1.x
  dy   = P2.y - P1.y
  dist = sqrt(dx² + dy²)      -- current distance
  err  = dist - D_target      -- signed error (+ = too far, - = too close)
```

---

## Jacobian row (for DoFAnalyzer.ts)

One scalar equation → **one row**, **four non-zero entries** (two per point).

```
∂f/∂P1.x = -(dx / dist)      -- unit vector component, negated for P1
∂f/∂P1.y = -(dy / dist)
∂f/∂P2.x =  (dx / dist)      -- unit vector component, positive for P2
∂f/∂P2.y =  (dy / dist)
∂f/∂(anything else) = 0
```

```
CASE constraint.type === 'distance':

  i1 = constraint.p1
  i2 = constraint.p2

  IF NOT validIdx(points, i1, i2):
    CONTINUE

  dx   = points[i2].x - points[i1].x
  dy   = points[i2].y - points[i1].y
  dist = sqrt(dx*dx + dy*dy)

  IF dist < 1e-10:
    CONTINUE                     // degenerate — points coincident, skip

  ux = dx / dist                 // unit vector x-component P1→P2
  uy = dy / dist                 // unit vector y-component P1→P2

  row = mkRow(ownerIdx = ci)     // one row for one scalar equation
  row[ colX(i1) ] = -ux
  row[ colY(i1) ] = -uy
  row[ colX(i2) ] =  ux
  row[ colY(i2) ] =  uy

  // DoF impact: 1 equation, 4 columns touched.
  // Removes 1 dof (constrains the distance, not the direction).
  // P1 and P2 can still rotate around each other on a circle of radius D.

  CONTINUE
```

---

## PBD solver step (for SketchSolver.ts)

The correction is purely **along the P1→P2 axis**. The error is split equally between the two free points (each moves half the distance to satisfy the constraint, equivalent to stretching or compressing the segment).

```
FUNCTION solveDimensional(constraint, points, alpha = 1.0):

  p1 = points[ constraint.p1 ]
  p2 = points[ constraint.p2 ]

  dx   = p2.x - p1.x
  dy   = p2.y - p1.y
  dist = sqrt(dx*dx + dy*dy)

  IF dist < 1e-10:
    RETURN                       // coincident points — cannot define a direction

  // Signed error along the axis
  err = dist - constraint.value  // positive = too far apart, negative = too close

  IF abs(err) < 1e-10:
    RETURN                       // already satisfied

  // Unit vector from P1 to P2
  ux = dx / dist
  uy = dy / dist

  // Gradient magnitude squared = ux²+uy² = 1 (unit vector)
  // so denom = 1*moveP1 + 1*moveP2
  moveP1 = p1.isFixed ? 0.0 : 1.0
  moveP2 = p2.isFixed ? 0.0 : 1.0
  denom  = moveP1 + moveP2

  IF denom < 1e-10:
    RETURN                       // both fixed and in conflict — overconstrained

  // Lagrange multiplier
  lambda = -alpha * err / denom  // negative because we negate the gradient

  // Apply corrections along the unit axis
  // Moving P1 TOWARD P2 (positive ux direction) when err < 0 (too close)
  // Moving P1 AWAY from P2 (negative ux direction) when err > 0 (too far)
  IF NOT p1.isFixed:
    p1.x += lambda * (-ux)       // ∂f/∂P1.x = -ux
    p1.y += lambda * (-uy)

  IF NOT p2.isFixed:
    p2.x += lambda * ( ux)       // ∂f/∂P2.x = +ux
    p2.y += lambda * ( uy)

  // After this step:
  //   dist(p1, p2) ≈ D_target   (to within solver tolerance)
  //   The midpoint of (p1, p2) is unchanged when both are free
  //   (equal and opposite corrections cancel at the midpoint)
```

---

## Degenerate case handling

```
// When the two points start coincident (dist ≈ 0), there is no axis to
// project along. Nudge one point by a tiny amount along an arbitrary
// axis to give the solver a direction to work with.

IF dist < 1e-10:
  IF NOT p2.isFixed:
    p2.x += constraint.value     // push P2 along +X by D_target
  ELSE IF NOT p1.isFixed:
    p1.x -= constraint.value
  RETURN
```

---

## DocumentConstraint type (for SketchSolver.ts)

```
TYPE DimensionalConstraint = {
  type:     'distance'
  p1:       DocumentPointRef     // first point
  p2:       DocumentPointRef     // second point
  value:    number               // D_target in document units

  // UI-only fields (not used by solver):
  dimLinePos?: { x: number; y: number }  // where the dim annotation is drawn
  label?:      string                    // override text, e.g. "REF" or "50±0.1"
}
```

---

## DocumentDoFAnalyzer.ts — constraint mapping

```
CASE c.type === 'distance':

  i1 = refToIndex[ refKey(c.p1) ]
  i2 = refToIndex[ refKey(c.p2) ]

  IF i1 DEFINED AND i2 DEFINED:
    sketchConstraints.push({
      type:  'distance',
      p1:    i1,
      p2:    i2,
      value: c.value,
    })
    constraintOwner.push(ci)
```

---

## SketchToolWindow.ts — applying the constraint

```
FUNCTION applyDimensionalConstraint(selectedPoints, doc, units):

  // User must have selected exactly 2 distinct points
  IF selectedPoints.length !== 2:
    SHOW "Select exactly two points for a distance constraint"
    RETURN

  p1_ref = selectedPoints[0]
  p2_ref = selectedPoints[1]

  IF refKey(p1_ref) === refKey(p2_ref):
    SHOW "Cannot constrain a point to itself"
    RETURN

  // Measure current distance to pre-fill the dialog
  p1_coords = getPointCoords(doc, p1_ref)
  p2_coords = getPointCoords(doc, p2_ref)
  currentDist = sqrt( (p2_coords.x - p1_coords.x)² +
                      (p2_coords.y - p1_coords.y)² )

  // Prompt user for target value (pre-filled with current distance)
  D_target = promptNumericInput(
    label   = "Distance",
    default = round(currentDist, units.precision),
    min     = 0.0001,
  )

  IF D_target cancelled OR D_target <= 0:
    RETURN

  // Check for duplicate
  IF doc.constraints.some(c =>
      c.type === 'distance' AND
      ( (refKey(c.p1) === refKey(p1_ref) AND refKey(c.p2) === refKey(p2_ref)) OR
        (refKey(c.p1) === refKey(p2_ref) AND refKey(c.p2) === refKey(p1_ref)) )):
    SHOW "Distance constraint already exists between these two points"
    RETURN

  doc.history.startTransaction(doc.constraints)

  doc.constraints.push({
    type:        'distance',
    p1:          p1_ref,
    p2:          p2_ref,
    value:       D_target,
    dimLinePos:  midpoint(p1_coords, p2_coords) offset perpendicular by 8px,
  })

  solveDocumentConstraints(doc, doc.constraints)

  doc.history.commitTransaction(doc.constraints)
  viewer.updateConstraints(doc)
  updateDoFVisualization()
```

---

## Dimension annotation rendering (for Viewer.ts / updateConstraints)

```
FUNCTION renderDimensionalConstraint(c, doc, scene):

  p1 = getPointCoords(doc, c.p1)
  p2 = getPointCoords(doc, c.p2)

  // Dimension line: parallel to p1→p2, offset perpendicular
  midPt    = { x: (p1.x + p2.x)/2, y: (p1.y + p2.y)/2 }
  dx       = p2.x - p1.x
  dy       = p2.y - p1.y
  dist     = sqrt(dx*dx + dy*dy)
  ux       = dx / dist              // unit along segment
  uy       = dy / dist
  nx       = -uy                    // unit perpendicular (left of direction)
  ny       =  ux

  offset   = c.dimLinePos           // user-positioned, or default:
  IF NOT offset:
    offset = { x: midPt.x + nx * DIM_OFFSET_PX,
               y: midPt.y + ny * DIM_OFFSET_PX }

  // Extension lines from each point to the dim line level
  extLine1Start = p1
  extLine1End   = { x: offset.x - (midPt.x - p1.x),
                    y: offset.y - (midPt.y - p1.y) }
  extLine2Start = p2
  extLine2End   = { x: offset.x + (p2.x - midPt.x),
                    y: offset.y + (p2.y - midPt.y) }

  // Arrowheads at each end of the dimension line
  arrow1 at extLine1End pointing toward extLine2End
  arrow2 at extLine2End pointing toward extLine1End

  // Label at midpoint of dim line
  label = formatDistance(c.value, units)    // e.g. "50.00" or "2'-0""
  renderText(label, at = offset, alignCenter = true)

  // Color:
  //   Normal    → STYLE.CONSTRAINT (cyan / light blue)
  //   Redundant → STYLE.OVERCONSTRAINED (red)
  //   Driving   → STYLE.FULLYCONSTRAINED (green)  [when it determines the shape]
```

---

## DoF accounting

```
Points involved:  P1, P2   (2 points = 4 scalar coordinates)
Equations added:  1
DoF removed:      1

The distance constraint removes exactly 1 dof because it is a single
scalar equation. It does NOT fix the direction — P1 and P2 can still
rotate around each other on a circle of radius D_target.

To fully lock a line segment, you need:
  distance(P1, P2, D)   -- fixes length          [-1 dof]
  horizontal(P1, P2)    -- fixes direction        [-1 dof]  (or vertical)
  fix(P1)               -- fixes absolute position [-2 dof]
  Total: -4 dof → fully constrained

Over-constraint examples:
  distance(P1, P2, D1) + distance(P1, P2, D2) where D1 ≠ D2
    → conflicting values → solver diverges, Gram-Schmidt flags second as redundant

  distance(P1, P2, D) + coincident(P1, P2)
    → coincident forces dist = 0, distance forces dist = D
    → if D ≠ 0: conflicting → overconstrained (both flagged)
    → if D = 0: redundant   → distance is flagged as redundant

Degenerate (dist ≈ 0) with D_target > 0:
  → No axis defined for Jacobian row → row is skipped (dist < 1e-10 guard)
  → dof count unaffected but constraint is effectively inactive
  → Solver must nudge one point first (see degenerate case above)

Interaction with midpoint:
  midpoint(Pm, P1, P2) + distance(P1, P2, D)
    → Together they fix: Pm's relation to P1,P2 AND the length of P1P2
    → 2 + 1 = 3 equations, 3 points = 6 coords → dof = 3
    → P1P2 can still translate (2 dof) and rotate (1 dof)
```