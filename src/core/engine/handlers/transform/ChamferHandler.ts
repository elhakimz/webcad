import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Line } from "../../../model/Line";
import { Polyline } from "../../../model/Polyline";
import * as MathUtils from "../../MathUtils";

interface SegmentInfo {
  p1: MathUtils.Point;
  p2: MathUtils.Point;
  entity: any;
  polyIndex?: number;
}

export class ChamferHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'chamfer';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer: _viewer, addEntity } = context;

    if (action.action === 'chamfer' && action.id1 && action.id2 && action.dist1 !== undefined && action.dist2 !== undefined && action.pick1 && action.pick2) {
      const e1 = doc.getEntity(action.id1);
      const e2 = doc.getEntity(action.id2);
      if (!e1 || !e2) {
          this.cleanup(context);
          return "Selected entities not found.";
      }

      const getSegment = (ent: any, pick: MathUtils.Point): SegmentInfo | null => {
        if (ent instanceof Line) {
          return { p1: { x: ent.x1, y: ent.y1 }, p2: { x: ent.x2, y: ent.y2 }, entity: ent };
        } else if (ent instanceof Polyline) {
          const res = MathUtils.getClosestPolylineSegment(ent, pick);
          if (res) return { p1: res.p1, p2: res.p2, entity: ent, polyIndex: res.index };
        }
        return null;
      };

      const s1 = getSegment(e1, action.pick1!);
      const s2 = getSegment(e2, action.pick2!);

      if (s1 && s2) {
        const res = MathUtils.chamferLines(
            s1.p1, s1.p2,
            s2.p1, s2.p2,
            action.dist1, action.dist2, action.pick1!, action.pick2!
        );

        if (res) {
            const before1 = e1.clone(e1.id);
            const before2 = e2.clone(e2.id);

            const inter = MathUtils.getLineLineIntersectionInfinite(s1.p1, s1.p2, s2.p1, s2.p2);
            if (inter) {
                // Same Polyline adjacent corner case
                if (e1 === e2 && e1 instanceof Polyline && s1.polyIndex !== undefined && s2.polyIndex !== undefined) {
                  const poly = e1;
                  const idx1 = s1.polyIndex;
                  const idx2 = s2.polyIndex;
                  const n = poly.vertices.length;

                  // Check if adjacent
                  let cornerIdx = -1;
                  if ((idx1 + 1) % n === idx2) cornerIdx = idx2;
                  else if ((idx2 + 1) % n === idx1) cornerIdx = idx1;

                  if (cornerIdx !== -1) {
                    // Replace the corner vertex with tp1 and tp2
                    // We need to know which tp belongs to which segment
                    const tp1 = res.tp1; // for s1
                    const tp2 = res.tp2; // for s2
                    
                    const newVertices = [...poly.vertices];
                    if (cornerIdx === idx2) {
                      // v_idx1 -> v_idx2 -> v_idx2+1
                      // s1 is idx1->idx2, s2 is idx2->idx2+1. Shared is idx2.
                      newVertices.splice(idx2, 1, { ...poly.vertices[idx2], x: tp1.x, y: tp1.y, bulge: 0 }, { ...poly.vertices[idx2], x: tp2.x, y: tp2.y, bulge: 0 });
                    } else {
                      // v_idx2 -> v_idx1 -> v_idx1+1
                      // s2 is idx2->idx1, s1 is idx1->idx1+1. Shared is idx1.
                      newVertices.splice(idx1, 1, { ...poly.vertices[idx1], x: tp2.x, y: tp2.y, bulge: 0 }, { ...poly.vertices[idx1], x: tp1.x, y: tp1.y, bulge: 0 });
                    }
                    poly.vertices = newVertices;
                    doc.recordTransform(before1, poly);
                    addEntity(poly, false, false);
                    this.cleanup(context);
                    return "Polyline corner chamfered.";
                  }
                }

                // General case: update entities separately
                const updateEntity = (s: SegmentInfo, tp: MathUtils.Point, intersect: MathUtils.Point, pick: MathUtils.Point) => {
                  const ent = s.entity;
                  if (ent instanceof Line) {
                    const dot1 = (ent.x1 - intersect.x) * (pick.x - intersect.x) + (ent.y1 - intersect.y) * (pick.y - intersect.y);
                    const dot2 = (ent.x2 - intersect.x) * (pick.x - intersect.x) + (ent.y2 - intersect.y) * (pick.y - intersect.y);
                    if (dot1 < dot2) { ent.x1 = tp.x; ent.y1 = tp.y; }
                    else { ent.x2 = tp.x; ent.y2 = tp.y; }
                  } else if (ent instanceof Polyline && s.polyIndex !== undefined) {
                    const v1 = ent.vertices[s.polyIndex];
                    const v2 = ent.vertices[(s.polyIndex + 1) % ent.vertices.length];
                    const dot1 = (v1.x - intersect.x) * (pick.x - intersect.x) + (v1.y - intersect.y) * (pick.y - intersect.y);
                    const dot2 = (v2.x - intersect.x) * (pick.x - intersect.x) + (v2.y - intersect.y) * (pick.y - intersect.y);
                    if (dot1 < dot2) { v1.x = tp.x; v1.y = tp.y; }
                    else { v2.x = tp.x; v2.y = tp.y; }
                  }
                };

                updateEntity(s1, res.tp1, inter, action.pick1!);
                updateEntity(s2, res.tp2, inter, action.pick2!);

                doc.recordTransform(before1, e1);
                addEntity(e1, false, false);
                if (e1 !== e2) {
                  doc.recordTransform(before2, e2);
                  addEntity(e2, false, false);
                }

                const chamferId = doc.getNextId("L");
                const chamferLine = new Line(chamferId, res.cp1.x, res.cp1.y, res.cp2.x, res.cp2.y);
                chamferLine.layer = (e1 as any).layer;
                addEntity(chamferLine, true, false);

                this.cleanup(context);
                return "Chamfer created.";
            }
        }
      }
      this.cleanup(context);
      return "Chamfer only supported between two lines or polyline segments.";
    }
    return undefined;
  }

  private cleanup(context: AppContext) {
    const { doc, viewer, selectedEntityIds } = context;
    doc.updateSpatialIndex();
    selectedEntityIds.clear();
    viewer.clearHighlight();
    viewer.setPreview(null);
    viewer.setHelpers(null);
    viewer.setBaseLine(null, null);
    viewer.render();
  }
}
