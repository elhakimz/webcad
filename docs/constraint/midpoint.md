The midpoint constraint generates **two scalar equations** (one per axis) and touches **three points** — the midpoint `Pm`, the segment start `Ps`, and the segment end `Pe`.

---

## Equations

```
f1 = Pm.x - (Ps.x + Pe.x) / 2 = 0
f2 = Pm.y - (Ps.y + Pe.y) / 2 = 0
```

---

## Jacobian rows (for DoFAnalyzer.ts)

Each equation produces one row across the `n = points.length * 2` column vector.

```
FUNCTION buildMidpointJacobianRows(ci, pm, ps, pe, colX, colY, mkRow):

  // ── Row for f1 (x-axis equation) ──────────────────────────
  // f1 = Pm.x - 0.5*Ps.x - 0.5*Pe.x = 0
  //
  // ∂f1/∂Pm.x  =  1
  // ∂f1/∂Ps.x  = -0.5
  // ∂f1/∂Pe.x  = -0.5
  // ∂f1/∂(any y coord) = 0
  // ∂f1/∂(any other x) = 0

  row1 = mkRow(ownerIdx = ci)
  row1[ colX(pm) ] =  1.0
  row1[ colX(ps) ] = -0.5
  row1[ colX(pe) ] = -0.5

  // ── Row for f2 (y-axis equation) ──────────────────────────
  // f2 = Pm.y - 0.5*Ps.y - 0.5*Pe.y = 0
  //
  // ∂f2/∂Pm.y  =  1
  // ∂f2/∂Ps.y  = -0.5
  // ∂f2/∂Pe.y  = -0.5
  // ∂f2/∂(any x coord) = 0
  // ∂f2/∂(any other y) = 0

  row2 = mkRow(ownerIdx = ci)
  row2[ colY(pm) ] =  1.0
  row2[ colY(ps) ] = -0.5
  row2[ colY(pe) ] = -0.5

  // DoF impact:  2 equations, touches 3 points (6 columns).
  // Removes 2 dof when pm, ps, pe are all free.
  // Removes fewer if any are already partially constrained.
```

---

## DoFAnalyzer.ts — constraint case block

```
CASE constraint.type === 'midpoint':

  pm_idx = constraint.pm          // index of the midpoint in points[]
  ps_idx = constraint.ps          // index of segment start
  pe_idx = constraint.pe          // index of segment end

  IF NOT validIdx(points, pm_idx, ps_idx, pe_idx):
    CONTINUE                      // skip degenerate / out-of-range refs

  row1 = mkRow(ci)
  row1[ colX(pm_idx) ] =  1.0
  row1[ colX(ps_idx) ] = -0.5
  row1[ colX(pe_idx) ] = -0.5

  row2 = mkRow(ci)
  row2[ colY(pm_idx) ] =  1.0
  row2[ colY(ps_idx) ] = -0.5
  row2[ colY(pe_idx) ] = -0.5

  CONTINUE
```

---

## PBD solver step (for SketchSolver.ts)

Position-Based Dynamics projects each violated equation back toward satisfaction by distributing the error across the three involved points proportionally to their inverse masses (all equal here → equal split).

```
FUNCTION solveMidpoint(constraint, points, alpha = 1.0):

  pm = points[ constraint.pm ]
  ps = points[ constraint.ps ]
  pe = points[ constraint.pe ]

  IF pm.isFixed AND ps.isFixed AND pe.isFixed:
    RETURN                       // nothing to move

  // ── Compute current residual ───────────────────────────────
  // How far is pm from the actual midpoint of (ps, pe)?

  midX = (ps.x + pe.x) / 2
  midY = (ps.y + pe.y) / 2

  errX = pm.x - midX            // f1 evaluated at current positions
  errY = pm.y - midY            // f2 evaluated at current positions

  // ── Count movable participants ─────────────────────────────
  // Each free coordinate of each free point contributes 1 unit of
  // "compliance". With equal masses and 3 points, each free point
  // absorbs 1/3 of the correction.
  //
  // Weight per point:
  //   w_pm =  1   (coefficient of Pm in f1/f2)
  //   w_ps = -0.5 (coefficient of Ps)
  //   w_pe = -0.5 (coefficient of Pe)
  //
  // Weighted sum of squared coefficients (denominator of λ):
  //   denom = w_pm² * (!pm.isFixed ? 1 : 0)
  //         + w_ps² * (!ps.isFixed ? 1 : 0)
  //         + w_pe² * (!pe.isFixed ? 1 : 0)
  //   denom = 1.0 * movePm + 0.25 * movePs + 0.25 * movePe

  movePm = pm.isFixed ? 0.0 : 1.0
  movePs = ps.isFixed ? 0.0 : 1.0
  movePe = pe.isFixed ? 0.0 : 1.0

  denomX = 1.0 * movePm + 0.25 * movePs + 0.25 * movePe
  denomY = denomX                // same structure for x and y

  IF denomX < 1e-10:
    RETURN                       // all three points are fixed — conflict

  // ── Lagrange multiplier λ ─────────────────────────────────
  // λ = -alpha * error / denominator

  lambdaX = -alpha * errX / denomX
  lambdaY = -alpha * errY / denomY

  // ── Apply position corrections ────────────────────────────
  // Δp = λ * w_p  for each free coordinate

  IF NOT pm.isFixed:
    pm.x += lambdaX *  1.0      // w_pm = +1
    pm.y += lambdaY *  1.0

  IF NOT ps.isFixed:
    ps.x += lambdaX * -0.5      // w_ps = -0.5  (moves AWAY from pm error)
    ps.y += lambdaY * -0.5

  IF NOT pe.isFixed:
    pe.x += lambdaX * -0.5      // w_pe = -0.5
    pe.y += lambdaY * -0.5

  // After this step:
  //   pm.x ≈ (ps.x + pe.x) / 2   (to within solver tolerance)
  //   pm.y ≈ (ps.y + pe.y) / 2
```

---

## DocumentConstraint type (for SketchSolver.ts)

```
// Add to the DocumentConstraint union:

TYPE MidpointConstraint = {
  type:  'midpoint'
  pm:    DocumentPointRef    // the point that must sit at midpoint
  ps:    DocumentPointRef    // segment start
  pe:    DocumentPointRef    // segment end
}

// pm is typically:
//   a standalone Point entity      → { entityId: pointId, pointId: 'position' }
//   or an endpoint of another line → { entityId: lineId,  pointId: 'start' | 'end' }
//
// ps / pe are the two ends of the host segment:
//   { entityId: lineId, pointId: 'start' }
//   { entityId: lineId, pointId: 'end'   }
```

---

## DocumentDoFAnalyzer.ts — constraint mapping

```
CASE c.type === 'midpoint':

  i_pm = refToIndex[ refKey(c.pm) ]
  i_ps = refToIndex[ refKey(c.ps) ]
  i_pe = refToIndex[ refKey(c.pe) ]

  IF i_pm DEFINED AND i_ps DEFINED AND i_pe DEFINED:
    sketchConstraints.push({
      type: 'midpoint',
      pm:   i_pm,
      ps:   i_ps,
      pe:   i_pe,
    })
    constraintOwner.push(ci)
```

---

## SketchToolWindow.ts — applying the constraint

```
FUNCTION applyMidpointConstraint(selectedPoints, selectedEntity, doc):

  // User must select:
  //   - 1 free point (Pm) AND 1 line entity (provides Ps, Pe)
  // OR:
  //   - 3 points where the first is the midpoint

  IF selectedPoints.length === 1 AND selectedEntity instanceof Line:

    pm_ref = { entityId: selectedPoints[0].entityId,
               pointId:  selectedPoints[0].pointId }

    ps_ref = { entityId: selectedEntity.id, pointId: 'start' }
    pe_ref = { entityId: selectedEntity.id, pointId: 'end'   }

  ELSE IF selectedPoints.length === 3:

    pm_ref = selectedPoints[0]    // middle point
    ps_ref = selectedPoints[1]    // segment start
    pe_ref = selectedPoints[2]    // segment end

  ELSE:
    SHOW "Select a point and a line (or 3 points)"
    RETURN

  // Check for duplicate constraint
  IF doc.constraints.some(c =>
      c.type === 'midpoint' AND
      refKey(c.pm) === refKey(pm_ref) AND
      refKey(c.ps) === refKey(ps_ref) AND
      refKey(c.pe) === refKey(pe_ref)):
    SHOW "Midpoint constraint already exists"
    RETURN

  doc.constraints.push({
    type: 'midpoint',
    pm:   pm_ref,
    ps:   ps_ref,
    pe:   pe_ref,
  })

  solveDocumentConstraints(doc, doc.constraints)
  updateDoFVisualization()
```

---

## DoF accounting

```
Points involved:   Pm, Ps, Pe   (3 points = 6 scalar coordinates)
Equations added:   2             (f1 for x, f2 for y)
DoF removed:       2

Typical result for a fresh midpoint constraint on 3 unanchored points:
  Before:  6 free coords, 0 equations → dof = 6
  After:   6 free coords, 2 equations → dof = 4
  (Pm's position is now determined by Ps and Pe, but the trio
   can still translate and rotate freely.)

To fully fix Pm: also fix Ps and Pe (e.g., distance + horizontal/vertical).

Over-constraint example:
  midpoint(Pm, Ps, Pe) + coincident(Pm, Ps) + coincident(Pm, Pe)
  → Ps = Pe = Pm → all three equations redundant except one
  → Gram-Schmidt will flag 2 of the 4 equations as redundant
  → status = 'over'
```