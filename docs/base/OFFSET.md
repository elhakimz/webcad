The file tools seem to be having issues in this session. Here's the full pseudocode directly:

---

# OFFSET — Polyline Pseudocode

## Overview

```
OFFSET on a Polyline works by:
  1. Offsetting each segment independently (line or arc)
  2. Extending / trimming adjacent offset segments to find new vertices
  3. Handling the start/end join differently for CLOSED vs OPEN polylines
```

---

## Data Structures

```
Polyline {
  vertices : List<Vertex>
  isClosed : Boolean
}

Vertex {
  position : Point2D       -- x, y
  bulge    : Float         -- 0 = straight segment, nonzero = arc segment
}

Segment {
  type     : "LINE" | "ARC"
  start    : Point2D
  end      : Point2D
  -- if ARC:
  center   : Point2D
  radius   : Float
  bulge    : Float
}
```

---

## Top-Level Entry Point

```
FUNCTION OffsetPolyline(polyline, distance, side):

  -- side = +1 (left/outward) or -1 (right/inward)

  segments       = DecomposeToSegments(polyline)
  offsetSegments = OffsetEachSegment(segments, distance, side)

  IF polyline.isClosed THEN
    result = JoinClosedOffset(offsetSegments)
  ELSE
    result = JoinOpenOffset(offsetSegments)
  END IF

  IF result is invalid (self-intersecting, collapsed) THEN
    RETURN null   -- offset too large; caller notifies user
  END IF

  RETURN result
```

---

## Step 1 — Decompose Polyline into Segments

```
FUNCTION DecomposeToSegments(polyline):

  segments = []
  n        = COUNT(polyline.vertices)

  FOR i = 0 TO n - 1:

    vA = polyline.vertices[i]
    vB = polyline.vertices[(i + 1) MOD n]   -- wraps for closed

    IF i = n - 1 AND NOT polyline.isClosed THEN
      BREAK   -- no segment after last vertex on open polyline
    END IF

    IF vA.bulge = 0 THEN
      segments.ADD( Segment{ type:"LINE", start:vA.position, end:vB.position } )
    ELSE
      arc = BulgeToArc(vA.position, vB.position, vA.bulge)
      segments.ADD( Segment{ type:"ARC", ...arc } )
    END IF

  END FOR

  RETURN segments
```

---

## Step 2 — Offset Each Segment Individually

```
FUNCTION OffsetEachSegment(segments, distance, side):

  result = []

  FOR EACH seg IN segments:
    IF seg.type = "LINE" THEN
      result.ADD( OffsetLine(seg, distance, side) )
    ELSE IF seg.type = "ARC" THEN
      result.ADD( OffsetArc(seg, distance, side) )
    END IF

  END FOR

  RETURN result
```

### Offset a Line Segment

```
FUNCTION OffsetLine(seg, distance, side):

  dir    = Normalize(seg.end - seg.start)
  normal = Perpendicular(dir) * side        -- rotate dir 90 degrees
  offset = normal * distance

  RETURN Segment{
    type  : "LINE",
    start : seg.start + offset,
    end   : seg.end   + offset
  }
```

### Offset an Arc Segment

```
FUNCTION OffsetArc(seg, distance, side):

  -- Offset grows or shrinks radius depending on which side
  IF side = SameSideAsCenter(seg) THEN
    newRadius = seg.radius - distance    -- inward: shrinks
  ELSE
    newRadius = seg.radius + distance    -- outward: grows
  END IF

  IF newRadius <= 0 THEN
    RETURN null   -- arc collapsed; segment will be dropped
  END IF

  -- Center stays fixed; only radius and endpoints change
  newBulge = RecomputeBulge(seg.start, seg.end, seg.center, newRadius, seg.bulge)

  RETURN Segment{
    type   : "ARC",
    center : seg.center,
    radius : newRadius,
    bulge  : newBulge,
    start  : ProjectOntoArc(seg.start, seg.center, newRadius),
    end    : ProjectOntoArc(seg.end,   seg.center, newRadius)
  }
```

---

## Step 3A — Join Segments (OPEN Polyline)

```
FUNCTION JoinOpenOffset(offsetSegments):

  segs = FILTER(offsetSegments, seg != null)

  IF COUNT(segs) = 0 THEN RETURN null

  vertices = []

  -- First vertex: start of first segment — no join needed
  vertices.ADD( segs[0].start )

  FOR i = 0 TO COUNT(segs) - 2:

    segA = segs[i]
    segB = segs[i + 1]

    joinPoint = IntersectExtended(segA, segB)

    IF joinPoint exists THEN
      segA.end   = joinPoint
      segB.start = joinPoint
      vertices.ADD( joinPoint )

    ELSE
      -- Parallel segments: no intersection point
      -- MVP: connect with a short straight line
      vertices.ADD( segA.end )
      vertices.ADD( segB.start )
    END IF

  END FOR

  -- Last vertex: end of last segment — no join needed
  vertices.ADD( segs[COUNT(segs) - 1].end )

  RETURN BuildPolyline(vertices, segs, isClosed: false)
```

---

## Step 3B — Join Segments (CLOSED Polyline)

```
FUNCTION JoinClosedOffset(offsetSegments):

  segs = FILTER(offsetSegments, seg != null)

  IF COUNT(segs) = 0 THEN RETURN null

  n        = COUNT(segs)
  vertices = []

  FOR i = 0 TO n - 1:

    segA = segs[i]
    segB = segs[(i + 1) MOD n]     -- wraps: last -> first

    joinPoint = IntersectExtended(segA, segB)

    IF joinPoint exists THEN
      -- Concave corner: trim both segments to intersection
      segA.end   = joinPoint
      segB.start = joinPoint
      vertices.ADD( joinPoint )

    ELSE
      -- Convex corner: segments diverge outward
      -- Insert corner arc (round join) or miter line
      cornerArc = BuildCornerArc(segA.end, segB.start, distance)
      vertices.ADD( segA.end )
      vertices.ADD_ARC( cornerArc )
      vertices.ADD( segB.start )
    END IF

  END FOR

  -- Last vertex wraps back to first automatically
  RETURN BuildPolyline(vertices, segs, isClosed: true)
```

---

## Step 4 — Self-Intersection Validation

```
FUNCTION ValidateOffset(polyline):

  segments = DecomposeToSegments(polyline)

  FOR EACH pair (segA, segB) where NOT adjacent:
    IF Intersects(segA, segB) THEN
      RETURN false   -- self-intersecting: offset too large
    END IF

  END FOR

  RETURN true
```

> For inward offsets on small closed shapes the offset distance can exceed
> the inscribed radius and cause collapse. Detect early and abort.

---

## Helper Functions (Signatures)

```
Perpendicular(v)                        -> Vector2D rotated 90 degrees
BulgeToArc(p1, p2, bulge)               -> { center, radius, startAngle, endAngle }
RecomputeBulge(p1, p2, center, r, sign) -> Float
ProjectOntoArc(pt, center, r)           -> Point2D (nearest point on new arc)
IntersectExtended(segA, segB)           -> Point2D | null
BuildCornerArc(p1, p2, dist)            -> ArcSegment
SameSideAsCenter(seg, side)             -> Boolean
BuildPolyline(vertices, segs, isClosed) -> Polyline
```

---

## Behavioral Differences: Closed vs Open

| Situation | Open Polyline | Closed Polyline |
|---|---|---|
| Start vertex | Free — no join | Joined with last segment (wraps) |
| End vertex | Free — no join | Joined with first segment (wraps) |
| Convex corner (outside offset) | Gap or short connecting line | Corner arc or miter |
| Concave corner (inside offset) | Intersect and trim | Intersect and trim |
| Collapsed arc (r ≤ 0) | Drop segment, connect neighbors | Drop segment, connect neighbors |
| Self-intersection | Warn, return null | Warn, return null |

---

## Edge Cases

```
1. Offset distance >= inscribed circle radius of closed polyline
   -> result collapses -> return null

2. Adjacent segments are parallel (no intersection point)
   -> open:   leave gap or insert straight connecting line
   -> closed: insert semicircle (round cap) at the corner

3. Arc segment collapses (newRadius <= 0)
   -> drop the segment
   -> connect previous and next segment directly

4. Very short segments after offset
   -> remove segments shorter than tolerance (1e-6)
   -> re-join neighbors

5. Bulge sign reversal (inward arc offset crosses center)
   -> clamp radius to 0, treat as collapsed
```

---

**Key implementation note:** the split between `JoinOpenOffset` and `JoinClosedOffset` is mainly about the wrap. In the closed case every corner — including the last→first join — must go through the same intersect/corner-arc logic. The open case just leaves the two endpoints free. The concave/convex corner logic (intersect vs. corner arc) is identical in both.