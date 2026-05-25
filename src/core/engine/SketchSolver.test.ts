import { describe, it, expect } from "vitest";
import { solveConstraints, SketchPoint, SketchConstraint, solveDocumentConstraints } from "./SketchSolver";
import { Document } from "../model/Document";
import { Text } from "../model/Text";
import { MText } from "../model/MText";
import { Point } from "../model/Point";

describe("SketchSolver Correctness tests", () => {
  it("should successfully solve coincident constraints", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 10 }
    ];
    const constraints: SketchConstraint[] = [
      { type: "coincident", p1: 0, p2: 1 }
    ];

    solveConstraints(points, constraints);

    expect(points[0].x).toBeCloseTo(5);
    expect(points[0].y).toBeCloseTo(5);
    expect(points[1].x).toBeCloseTo(5);
    expect(points[1].y).toBeCloseTo(5);
  });

  it("should successfully solve horizontal constraints", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0 },
      { x: 10, y: 4 }
    ];
    const constraints: SketchConstraint[] = [
      { type: "horizontal", p1: 0, p2: 1 }
    ];

    solveConstraints(points, constraints);

    expect(points[0].y).toBeCloseTo(2);
    expect(points[1].y).toBeCloseTo(2);
  });

  it("should successfully solve vertical constraints", () => {
    const points: SketchPoint[] = [
      { x: 2, y: 0 },
      { x: 8, y: 10 }
    ];
    const constraints: SketchConstraint[] = [
      { type: "vertical", p1: 0, p2: 1 }
    ];

    solveConstraints(points, constraints);

    expect(points[0].x).toBeCloseTo(5);
    expect(points[1].x).toBeCloseTo(5);
  });

  it("should successfully solve distance constraints", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true }, // Keep first point fixed
      { x: 10, y: 0 }
    ];
    const constraints: SketchConstraint[] = [
      { type: "distance", p1: 0, p2: 1, value: 5 }
    ];

    solveConstraints(points, constraints);

    expect(points[0].x).toBeCloseTo(0);
    expect(points[0].y).toBeCloseTo(0);
    expect(points[1].x).toBeCloseTo(5);
    expect(points[1].y).toBeCloseTo(0);
  });

  it("should successfully solve parallel constraints", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true },
      { x: 10, y: 0, isFixed: true }, // Line 1 is fixed horizontally
      { x: 0, y: 5 },
      { x: 8, y: 12 } // Line 2 has some slope
    ];
    const constraints: SketchConstraint[] = [
      { type: "parallel", l1: [0, 1], l2: [2, 3] }
    ];

    solveConstraints(points, constraints);

    const dx1 = points[1].x - points[0].x;
    const dy1 = points[1].y - points[0].y;
    const dx2 = points[3].x - points[2].x;
    const dy2 = points[3].y - points[2].y;

    const angle1 = Math.atan2(dy1, dx1);
    const angle2 = Math.atan2(dy2, dx2);

    let diff = Math.abs(angle2 - angle1);
    if (diff > Math.PI / 2) diff = Math.abs(diff - Math.PI);

    expect(diff).toBeLessThan(1e-3);
  });

  it("should successfully solve perpendicular constraints", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true },
      { x: 10, y: 0, isFixed: true }, // Line 1 is fixed horizontally
      { x: 5, y: 0 },
      { x: 8, y: 10 } // Line 2 is tilted
    ];
    const constraints: SketchConstraint[] = [
      { type: "perpendicular", l1: [0, 1], l2: [2, 3] }
    ];

    solveConstraints(points, constraints);

    const dx1 = points[1].x - points[0].x;
    const dy1 = points[1].y - points[0].y;
    const dx2 = points[3].x - points[2].x;
    const dy2 = points[3].y - points[2].y;

    const dot = dx1 * dx2 + dy1 * dy2;
    expect(dot).toBeCloseTo(0, 3);
  });
});

describe("solveDocumentConstraints integration with Text, MText, and Point", () => {
  it("should successfully solve constraints involving Text, MText, and Point entities", () => {

    const doc = new Document();
    const textEnt = new Text("text1", 0, 0, 2.5, 0, "Hello");
    const mtextEnt = new MText("mtext1", { x: 10, y: 10 }, 50, 20, "World");
    const pointEnt = new Point("point1", 5, 5);

    doc.addEntity(textEnt);
    doc.addEntity(mtextEnt);
    doc.addEntity(pointEnt);

    // Make text insertion point coincident with point position
    const c1 = {
      type: "coincident",
      p1: { entityId: "text1", pointId: "position" },
      p2: { entityId: "point1", pointId: "position" }
    };

    // Lock point position to (5, 5) using a fix constraint
    const c2 = {
      type: "fix",
      p1: { entityId: "point1", pointId: "position" },
      x: 5,
      y: 5
    };

    solveDocumentConstraints(doc, [c1, c2]);

    expect(textEnt.x).toBeCloseTo(5);
    expect(textEnt.y).toBeCloseTo(5);
    expect(pointEnt.x).toBeCloseTo(5);
    expect(pointEnt.y).toBeCloseTo(5);
  });
});

describe("Tangent Constraint", () => {
  it("should successfully solve tangent constraints between line and circle", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true }, // Circle center fixed
      { x: 20, y: -20 },             // Line start
      { x: 20, y: 20 }               // Line end
    ];
    const constraints: SketchConstraint[] = [
      { type: "tangent", l1: [1, 2], circle: 0, radius: 10 }
    ];

    solveConstraints(points, constraints, undefined, 100);

    const x1 = points[1].x, y1 = points[1].y;
    const x2 = points[2].x, y2 = points[2].y;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dist = Math.abs(dy * 0 - dx * 0 + x2 * y1 - y2 * x1) / len;

    expect(dist).toBeCloseTo(10, 5);
  });

  it("should move line when dragging circle center", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0 },   // Circle center (being "dragged")
      { x: 10, y: -20 }, // Line start
      { x: 10, y: 20 }   // Line end
    ];
    const constraints: SketchConstraint[] = [
      { type: "tangent", l1: [1, 2], circle: 0, radius: 10 }
    ];

    // Initial state: already tangent.
    // Now "drag" center to (5, 0).
    points[0].x = 5;
    points[0].y = 0;

    // Solve with center locked at (5, 0)
    solveConstraints(points, constraints, 0, 100);

    const x1 = points[1].x, y1 = points[1].y;
    const x2 = points[2].x, y2 = points[2].y;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const dist = Math.abs(dy * 5 - dx * 0 + x2 * y1 - y2 * x1) / len;

    // Line should have moved to x=15 (or x=-5)
    expect(dist).toBeCloseTo(10, 5);
    // Check if it moved roughly to 15
    expect(points[1].x).toBeGreaterThan(14.9);
  });

  it("should solve tangent_smooth (3-point collinearity) for Arc-Arc", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true }, // Arc 1 center
      { x: 10, y: 5 },               // Shared contact point (initially off-center)
      { x: 20, y: 0, isFixed: true } // Arc 2 center (now fixed)
    ];
    const constraints: SketchConstraint[] = [
      { type: "tangent_smooth", p1: 0, p2: 1, p3: 2 }
    ];

    // Solving should move p2 to (10, 0) since p1 and p3 are fixed on x-axis
    solveConstraints(points, constraints, undefined, 100);

    expect(points[1].x).toBeCloseTo(10, 5);
    expect(points[1].y).toBeCloseTo(0, 5);
  });

  it("should solve symmetric (Point Symmetry) constraint", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true }, // p1 (Fixed at origin)
      { x: 10, y: 10 },              // p2 (Initially far)
      { x: 2, y: 2 }                 // p3 (Midpoint, initially off-center)
    ];
    const constraints: SketchConstraint[] = [
      { type: "symmetric", p1: 0, p2: 1, p3: 2 }
    ];

    // p1 fixed at (0,0). p3 fixed at (2,2)? No, p3 is not fixed.
    // If we only constrain midpoint, all 3 points can move.
    // Let's fix p1 and p3.
    points[2].isFixed = true; // Fix p3 at (2,2)

    solveConstraints(points, constraints, undefined, 100);

    // p1 = (0,0), p3 = (2,2) -> p2 must move to (4,4)
    expect(points[1].x).toBeCloseTo(4, 5);
    expect(points[1].y).toBeCloseTo(4, 5);
  });

  it("should solve equal_length constraint", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true },   // p1
      { x: 10, y: 0, isFixed: true },  // p2 (length 10)
      { x: 20, y: 0, isFixed: true },  // p3
      { x: 25, y: 0 }                  // p4 (initial length 5)
    ];
    const constraints: SketchConstraint[] = [
      { type: "equal_length", l1: [0, 1], l2: [2, 3] }
    ];

    // p1, p2, p3 fixed. p4 must move to 30,0 to make l2=10
    solveConstraints(points, constraints, undefined, 100);

    expect(points[3].x).toBeCloseTo(30, 5);
    expect(points[3].y).toBeCloseTo(0, 5);
  });

  it("should solve midpoint constraint", () => {
    const points: SketchPoint[] = [
      { x: 0, y: 0, isFixed: true },   // p1 (start)
      { x: 10, y: 0, isFixed: true },  // p2 (end)
      { x: 2, y: 5 }                   // pm (midpoint, initially off)
    ];
    const constraints: SketchConstraint[] = [
      { type: "midpoint", pm: 2, ps: 0, pe: 1 }
    ];

    // pm must move to (5, 0)
    solveConstraints(points, constraints, undefined, 100);

    expect(points[2].x).toBeCloseTo(5, 5);
    expect(points[2].y).toBeCloseTo(0, 5);
  });
});

