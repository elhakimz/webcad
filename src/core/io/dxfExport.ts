import { Document } from "../model/Document";
import { Entity } from "../model/Entity";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Point } from "../model/Point";
import { Polyline } from "../model/Polyline";
import { Text } from "../model/Text";
import { Solid } from "../model/Solid";
import { Trace } from "../model/Trace";
import { Hatch } from "../model/Hatch";
import { Shape } from "../model/Shape";
import { Insert } from "../model/Insert";

export class DXFExporter {
  export(doc: Document): string {
    let dxf = "";

    // SECTION HEADER
    dxf += "  0\nSECTION\n  2\nHEADER\n  9\n$ACADVER\n  1\nAC1015\n  0\nENDSEC\n";

    // SECTION TABLES
    dxf += "  0\nSECTION\n  2\nTABLES\n";
    
    // LTYPE TABLE
    dxf += "  0\nTABLE\n  2\nLTYPE\n 70\n1\n";
    dxf += "  0\nLTYPE\n  2\nCONTINUOUS\n 70\n0\n  3\nSolid line\n 72\n65\n 73\n0\n 40\n0.0\n";
    dxf += "  0\nENDTAB\n";

    // LAYER TABLE
    const layers = doc.layers.listLayers();
    dxf += "  0\nTABLE\n  2\nLAYER\n 70\n" + layers.length + "\n";
    for (const layer of layers) {
      dxf += "  0\nLAYER\n  2\n" + layer.name.toUpperCase() + "\n 70\n0\n 62\n" + (layer.color || 7) + "\n  6\n" + (layer.linetype || "CONTINUOUS").toUpperCase() + "\n";
    }
    dxf += "  0\nENDTAB\n";

    dxf += "  0\nENDSEC\n";

    // SECTION BLOCKS
    dxf += "  0\nSECTION\n  2\nBLOCKS\n";
    for (const blockName of doc.blocks.listBlocks()) {
        const block = doc.blocks.getBlock(blockName)!;
        dxf += "  0\nBLOCK\n  8\n0\n  2\n" + block.name + "\n 70\n0\n";
        dxf += " 10\n" + block.basePoint.x + "\n 20\n" + block.basePoint.y + "\n 30\n0.0\n";
        dxf += "  3\n" + block.name + "\n";
        for (const entity of block.entities) {
            dxf += this.exportEntity(entity);
        }
        dxf += "  0\nENDBLK\n  8\n0\n";
    }
    dxf += "  0\nENDSEC\n";

    // SECTION ENTITIES
    dxf += "  0\nSECTION\n  2\nENTITIES\n";
    for (const entity of doc.getAllEntities()) {
      dxf += this.exportEntity(entity);
    }
    dxf += "  0\nENDSEC\n";

    // EOF
    dxf += "  0\nEOF\n";

    return dxf;
  }

  private exportEntity(e: Entity): string {
    let s = "";
    const layer = e.layer.toUpperCase();

    if (e instanceof Line) {
      s += "  0\nLINE\n  8\n" + layer + "\n";
      s += " 10\n" + e.x1 + "\n 20\n" + e.y1 + "\n 30\n0.0\n";
      s += " 11\n" + e.x2 + "\n 21\n" + e.y2 + "\n 31\n0.0\n";
    } else if (e instanceof Circle) {
      s += "  0\nCIRCLE\n  8\n" + layer + "\n";
      s += " 10\n" + e.cx + "\n 20\n" + e.cy + "\n 30\n0.0\n";
      s += " 40\n" + e.r + "\n";
    } else if (e instanceof Arc) {
      s += "  0\nARC\n  8\n" + layer + "\n";
      s += " 10\n" + e.cx + "\n 20\n" + e.cy + "\n 30\n0.0\n";
      s += " 40\n" + e.r + "\n";
      
      let start = e.startAngle * 180 / Math.PI;
      let end = e.endAngle * 180 / Math.PI;
      
      if (!e.ccw) {
          // DXF is always CCW. For CW arcs, we swap and the result is the same geometry sweep.
          [start, end] = [end, start];
      }

      // Normalize to 0-360
      const norm = (a: number) => {
          while (a < 0) a += 360;
          while (a >= 360) a -= 360;
          return a;
      };

      s += " 50\n" + norm(start) + "\n";
      s += " 51\n" + norm(end) + "\n";
    } else if (e instanceof Point) {
      s += "  0\nPOINT\n  8\n" + layer + "\n";
      s += " 10\n" + e.x + "\n 20\n" + e.y + "\n 30\n0.0\n";
    } else if (e instanceof Polyline) {
      s += "  0\nPOLYLINE\n  8\n" + layer + "\n 66\n1\n 70\n" + (e.closed ? 1 : 0) + "\n";
      for (const v of e.vertices) {
        s += "  0\nVERTEX\n  8\n" + layer + "\n";
        s += " 10\n" + v.x + "\n 20\n" + v.y + "\n 30\n0.0\n";
        if (v.bulge !== 0) s += " 42\n" + v.bulge + "\n";
      }
      s += "  0\nSEQEND\n";
    } else if (e instanceof Text) {
      s += "  0\nTEXT\n  8\n" + layer + "\n";
      s += " 10\n" + e.x + "\n 20\n" + e.y + "\n 30\n0.0\n";
      s += " 40\n" + e.height + "\n";
      s += "  1\n" + e.text + "\n";
      s += " 50\n" + e.rotation + "\n";
    } else if (e instanceof Solid) {
      s += "  0\nSOLID\n  8\n" + layer + "\n";
      for (let i = 0; i < Math.min(e.vertices.length, 4); i++) {
        s += (10 + i) + "\n" + e.vertices[i].x + "\n" + (20 + i) + "\n" + e.vertices[i].y + "\n" + (30 + i) + "\n0.0\n";
      }
    } else if (e instanceof Trace) {
      s += "  0\nTRACE\n  8\n" + layer + "\n";
      // Simplified: export as quad centered on line
      const dx = e.x2 - e.x1;
      const dy = e.y2 - e.y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
          const nx = -dy / len * (e.width / 2);
          const ny = dx / len * (e.width / 2);
          const p1 = { x: e.x1 + nx, y: e.y1 + ny };
          const p2 = { x: e.x1 - nx, y: e.y1 - ny };
          const p3 = { x: e.x2 + nx, y: e.y2 + ny };
          const p4 = { x: e.x2 - nx, y: e.y2 - ny };
          const pts = [p1, p2, p3, p4];
          for (let i = 0; i < 4; i++) {
            s += (10 + i) + "\n" + pts[i].x + "\n" + (20 + i) + "\n" + pts[i].y + "\n" + (30 + i) + "\n0.0\n";
          }
      }
    } else if (e instanceof Shape) {
      s += "  0\nSHAPE\n  8\n" + layer + "\n";
      s += " 10\n" + e.x + "\n 20\n" + e.y + "\n 30\n0.0\n";
      s += " 40\n" + e.shapeScale + "\n";
      s += "  2\n" + e.shapeName + "\n";
      s += " 50\n" + e.rotation + "\n";
    } else if (e instanceof Hatch) {
      s += "  0\nHATCH\n  8\n" + layer + "\n";
      s += "  2\n" + e.pattern.toUpperCase() + "\n";
      s += " 70\n0\n 71\n0\n"; // Patterned, non-associative
      s += " 41\n" + e.patternScale + "\n";
      s += " 52\n" + e.angle + "\n";
      s += " 91\n1\n"; // 1 Boundary loop
      s += " 92\n0\n"; // Loop type (Polyline)
      s += " 93\n" + e.boundaryVertices.length + "\n"; // Number of points
      for (const v of e.boundaryVertices) {
        s += " 10\n" + v.x + "\n 20\n" + v.y + "\n";
      }
      s += " 73\n1\n"; // Closed
      s += " 75\n0\n 76\n0\n 98\n0\n";
    } else if (e instanceof Insert) {
      s += "  0\nINSERT\n  8\n" + layer + "\n";
      s += "  2\n" + e.blockName + "\n";
      s += " 10\n" + e.x + "\n 20\n" + e.y + "\n 30\n0.0\n";
      s += " 41\n" + e.scaleX + "\n 42\n" + e.scaleY + "\n 43\n1.0\n";
      s += " 50\n" + e.rotation + "\n";
    }

    return s;
  }
}
