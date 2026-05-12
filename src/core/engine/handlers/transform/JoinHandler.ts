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
