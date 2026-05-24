import { ActionHandler, AppContext } from "../types";
import { CommandAction, CommandResponse } from "../../../commands/types";
import { Line } from "../../../model/Line";
import { Arc as ArcEntity } from "../../../model/Arc";
import { Polyline, PolylineVertex } from "../../../model/Polyline";
import * as MathUtils from "../../MathUtils";

export class JoinHandler implements ActionHandler {
  canHandle(action: CommandAction): boolean {
    return action.action === 'join';
  }

  async handle(action: CommandAction, context: AppContext): Promise<CommandResponse | undefined> {
    const { doc, viewer, addEntity } = context;

    if (action.action === 'join' && action.ids) {
      const allEntities = action.ids.map(id => doc.getEntity(id)).filter(e => e !== undefined);
      const polylines = allEntities.filter(e => e instanceof Polyline) as Polyline[];
      
      // Special case: Join 2 polylines
      if (polylines.length === 2 && allEntities.length === 2) {
        const p1 = polylines[0];
        const p2 = polylines[1];
        
        const tol = 1e-3;
        const p1Start = p1.vertices[0];
        const p1End = p1.vertices[p1.vertices.length - 1];
        const p2Start = p2.vertices[0];
        const p2End = p2.vertices[p2.vertices.length - 1];
        
        const distEE = MathUtils.distancePointToPoint(p1End.x, p1End.y, p2Start.x, p2Start.y);
        const distES = MathUtils.distancePointToPoint(p1End.x, p1End.y, p2End.x, p2End.y);
        const distSE = MathUtils.distancePointToPoint(p1Start.x, p1Start.y, p2Start.x, p2Start.y);
        const distSS = MathUtils.distancePointToPoint(p1Start.x, p1Start.y, p2End.x, p2End.y);
        
        let joined = false;
        if (distEE < tol) {
          p1.vertices.push(...p2.vertices.slice(1));
          joined = true;
        } else if (distES < tol) {
          p1.vertices.push(...this.reverseVertices(p2.vertices).slice(1));
          joined = true;
        } else if (distSS < tol) {
          p1.vertices.unshift(...this.reverseVertices(p2.vertices).slice(0, -1));
          joined = true;
        } else if (distSE < tol) {
          p1.vertices.unshift(...p2.vertices.slice(0, -1));
          joined = true;
        }
        
        if (joined) {
          // Check if the merged polyline forms a closed loop
          const pStart = p1.vertices[0];
          const pEnd = p1.vertices[p1.vertices.length - 1];
          const distLoop = MathUtils.distancePointToPoint(pStart.x, pStart.y, pEnd.x, pEnd.y);
          if (distLoop < tol && p1.vertices.length > 2) {
            p1.closed = true;
            p1.vertices.pop(); // Remove duplicate end point
          }

          doc.removeEntity(p2.id);
          viewer.removeObject(p2.id);
          this.cleanup(context);
          return "Polylines joined.";
        }
      }

      // Special case: Join 1 polyline + 1 arc
      const arcs = allEntities.filter(e => e instanceof ArcEntity) as ArcEntity[];
      if (polylines.length === 1 && arcs.length === 1 && allEntities.length === 2) {
        const poly = polylines[0];
        const arc = arcs[0];

        const arcStartX = arc.cx + arc.r * Math.cos(arc.startAngle);
        const arcStartY = arc.cy + arc.r * Math.sin(arc.startAngle);
        const arcEndX = arc.cx + arc.r * Math.cos(arc.endAngle);
        const arcEndY = arc.cy + arc.r * Math.sin(arc.endAngle);

        const pStart = poly.vertices[0];
        const pEnd = poly.vertices[poly.vertices.length - 1];

        const distArcStartToPEnd = MathUtils.distancePointToPoint(arcStartX, arcStartY, pEnd.x, pEnd.y);
        const distArcEndToPEnd = MathUtils.distancePointToPoint(arcEndX, arcEndY, pEnd.x, pEnd.y);
        const distArcStartToPStart = MathUtils.distancePointToPoint(arcStartX, arcStartY, pStart.x, pStart.y);
        const distArcEndToPStart = MathUtils.distancePointToPoint(arcEndX, arcEndY, pStart.x, pStart.y);

        if (distArcStartToPEnd < tol) {
          // Arc start connects to polyline end - add arc's end point with bulge
          const bulge = Math.tan((arc.endAngle - arc.startAngle) / 4);
          poly.vertices.push({
            x: arcEndX,
            y: arcEndY,
            bulge: arc.ccw ? bulge : -bulge
          });
          doc.removeEntity(arc.id);
          viewer.removeObject(arc.id);
          this.cleanup(context);
          return "Arc joined to polyline.";
        } else if (distArcEndToPEnd < tol) {
          // Arc end connects to polyline end - add arc's start point with reversed bulge
          const bulge = Math.tan((arc.endAngle - arc.startAngle) / 4);
          poly.vertices.push({
            x: arcStartX,
            y: arcStartY,
            bulge: arc.ccw ? -bulge : bulge
          });
          doc.removeEntity(arc.id);
          viewer.removeObject(arc.id);
          this.cleanup(context);
          return "Arc joined to polyline.";
        } else if (distArcStartToPStart < tol) {
          // Arc start connects to polyline start - insert arc's end at beginning
          const bulge = Math.tan((arc.endAngle - arc.startAngle) / 4);
          poly.vertices.unshift({
            x: arcEndX,
            y: arcEndY,
            bulge: arc.ccw ? bulge : -bulge
          });
          doc.removeEntity(arc.id);
          viewer.removeObject(arc.id);
          this.cleanup(context);
          return "Arc joined to polyline.";
        } else if (distArcEndToPStart < tol) {
          // Arc end connects to polyline start - insert arc's start at beginning with reversed bulge
          const bulge = Math.tan((arc.endAngle - arc.startAngle) / 4);
          poly.vertices.unshift({
            x: arcStartX,
            y: arcStartY,
            bulge: arc.ccw ? -bulge : bulge
          });
          doc.removeEntity(arc.id);
          viewer.removeObject(arc.id);
          this.cleanup(context);
          return "Arc joined to polyline.";
        }
      }

      const entities = action.ids.map(id => doc.getEntity(id)).filter(e => e instanceof Line || e instanceof ArcEntity) as (Line | ArcEntity)[];
      
      const sorted = MathUtils.sortConnected(entities);
      if (sorted) {
        const vertices = [];
        for (const e of sorted) {
          if (e instanceof Line) {
            vertices.push({ x: e.x1, y: e.y1, bulge: 0 });
          } else {
             const bulge = Math.tan((e.endAngle - e.startAngle) / 4);
             vertices.push({ x: e.cx + e.r * Math.cos(e.startAngle), y: e.cy + e.r * Math.sin(e.startAngle), bulge: e.ccw ? -bulge : bulge });
          }
        }
        const last = sorted[sorted.length - 1];
        if (last instanceof Line) vertices.push({ x: last.x2, y: last.y2, bulge: 0 });
        else vertices.push({ x: last.cx + last.r * Math.cos(last.endAngle), y: last.cy + last.r * Math.sin(last.endAngle), bulge: 0 });
        
        entities.forEach(e => { doc.removeEntity(e.id); viewer.removeObject(e.id); });
        const polyId = doc.getNextId("PL");
        const poly = new Polyline(polyId, vertices, false);
        addEntity(poly, true, false);
        
        this.cleanup(context);
        return "Entities joined.";
      }
      this.cleanup(context);
      return "Entities cannot be joined.";
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
    context.syncFromDocument();
  }

  private reverseVertices(vertices: PolylineVertex[]): PolylineVertex[] {
    const reversed = vertices.map(v => ({ ...v })).reverse();
    const n = vertices.length;
    for (let i = 0; i < n - 1; i++) {
      reversed[i].bulge = -vertices[n - 2 - i].bulge;
    }
    reversed[n - 1].bulge = 0;
    return reversed;
  }
}
