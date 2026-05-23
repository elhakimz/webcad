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

