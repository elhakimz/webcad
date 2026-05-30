import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Line } from "../../../model/Line";
import { Polyline } from "../../../model/Polyline";
import * as MathUtils from "../../MathUtils";
import { JoinUtility } from "./JoinUtility";

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
    const { doc, viewer, addEntity } = context;

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

                  let cornerIdx = -1;
                  if ((idx1 + 1) % n === idx2) cornerIdx = idx2;
                  else if ((idx2 + 1) % n === idx1) cornerIdx = idx1;

                  if (cornerIdx !== -1) {
                    const tp1 = res.tp1;
                    const tp2 = res.tp2;
                    const newVertices = [...poly.vertices];
                    if (cornerIdx === idx2) {
                      newVertices.splice(idx2, 1, { ...poly.vertices[idx2], x: tp1.x, y: tp1.y, bulge: 0 }, { ...poly.vertices[idx2], x: tp2.x, y: tp2.y, bulge: 0 });
                    } else {
                      newVertices.splice(idx1, 1, { ...poly.vertices[idx1], x: tp2.x, y: tp2.y, bulge: 0 }, { ...poly.vertices[idx1], x: tp1.x, y: tp1.y, bulge: 0 });
                    }
                    poly.vertices = newVertices;
                    doc.history.startTransaction(doc.constraints);
                    doc.recordTransform(before1, poly);
                    addEntity(poly, false, false);
                    doc.history.commitTransaction(doc.constraints);
                    this.cleanup(context);
                    return "Polyline corner chamfered.";
                  }
                }

                // General case: Try to merge into a single Polyline if separate
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

                // Modify local clones in-memory for chaining
                const e1Mod = e1.clone(e1.id);
                const e2Mod = e2.clone(e2.id);
                const s1Mod = getSegment(e1Mod, action.pick1!)!;
                const s2Mod = getSegment(e2Mod, action.pick2!)!;
                
                updateEntity(s1Mod, res.tp1, inter, action.pick1!);
                updateEntity(s2Mod, res.tp2, inter, action.pick2!);

                const chamferLine = new Line("temp_chamfer", res.cp1.x, res.cp1.y, res.cp2.x, res.cp2.y);
                
                const chains = JoinUtility.buildChains([e1Mod, e2Mod, chamferLine]);
                const merged = JoinUtility.mergeChains(chains);

                if (merged.length === 1) {
                    const chain = merged[0];
                    doc.history.startTransaction(doc.constraints);
                    
                    doc.recordRemove(e1);
                    doc.removeEntity(e1.id);
                    viewer.removeObject(e1.id);
                    if (e1 !== e2) {
                        doc.recordRemove(e2);
                        doc.removeEntity(e2.id);
                        viewer.removeObject(e2.id);
                    }

                    const polyId = doc.getNextId("PL");
                    const poly = new Polyline(polyId, chain.vertices, false);
                    poly.layer = e1.layer;
                    poly.color = e1.color;
                    
                    doc.recordAdd(poly);
                    addEntity(poly, false, false);
                    
                    doc.history.commitTransaction(doc.constraints);
                    this.cleanup(context);
                    return "Entities chamfered and joined into polyline.";
                } else {
                    // Fallback
                    doc.history.startTransaction(doc.constraints);
                    updateEntity(s1, res.tp1, inter, action.pick1!);
                    updateEntity(s2, res.tp2, inter, action.pick2!);
                    
                    doc.recordTransform(before1, e1);
                    addEntity(e1, false, false);
                    if (e1 !== e2) {
                        doc.recordTransform(before2, e2);
                        addEntity(e2, false, false);
                    }
                    const chamferId = doc.getNextId("L");
                    const finalChamfer = new Line(chamferId, res.cp1.x, res.cp1.y, res.cp2.x, res.cp2.y);
                    finalChamfer.layer = (e1 as any).layer;
                    doc.recordAdd(finalChamfer);
                    addEntity(finalChamfer, true, false);
                    
                    doc.history.commitTransaction(doc.constraints);
                    this.cleanup(context);
                    return "Chamfer created (entities separate).";
                }
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
