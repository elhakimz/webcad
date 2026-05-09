import { Document } from "../model/Document";
import { Entity } from "../model/Entity";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Point } from "../model/Point";
import { Polyline, PolylineVertex } from "../model/Polyline";
import { Text } from "../model/Text";
import { MText, AttachmentPoint } from "../model/MText";
import { Solid } from "../model/Solid";
import { Ellipse } from "../model/Ellipse";
import { Hatch } from "../model/Hatch";
import { Shape } from "../model/Shape";
import { Insert } from "../model/Insert";
import { Dimension } from "../model/Dimension";
import { Donut } from "../model/Donut";
import { Spline } from "../model/Spline";
import { Note } from "../model/Note";

interface DXFGroup {
  code: number;
  value: string;
}

export class DXFImporter {
  import(dxfText: string, doc: Document) {
    const lines = dxfText.split(/\r?\n/);
    const groups: DXFGroup[] = [];
    for (let i = 0; i < lines.length; i += 2) {
      if (lines[i] && lines[i+1] !== undefined) {
        groups.push({
          code: parseInt(lines[i].trim()),
          value: lines[i+1].trim()
        });
      }
    }

    let i = 0;
    while (i < groups.length) {
      const g = groups[i];
      if (g.code === 0 && g.value === "SECTION") {
        i++;
        if (i >= groups.length) break;
        const sectionName = groups[i].value;
        i++;
        if (sectionName === "TABLES") {
          i = this.parseTables(groups, i, doc);
        } else if (sectionName === "BLOCKS") {
          i = this.parseBlocks(groups, i, doc);
        } else if (sectionName === "ENTITIES") {
          i = this.parseEntities(groups, i, doc);
        }
      } else {
        i++;
      }
    }
  }

  private parseTables(groups: DXFGroup[], i: number, doc: Document): number {
    while (i < groups.length && !(groups[i].code === 0 && groups[i].value === "ENDSEC")) {
      const g = groups[i];
      if (g.code === 0 && g.value === "TABLE") {
        i++;
        if (i >= groups.length) break;
        const tableName = groups[i].value;
        i++;
        if (tableName === "LAYER") {
          while (i < groups.length && !(groups[i].code === 0 && groups[i].value === "ENDTAB")) {
            if (groups[i].code === 0 && groups[i].value === "LAYER") {
              i++;
              let name = "0";
              let color = 7;
              let linetype = "CONTINUOUS";
              while (i < groups.length && groups[i].code !== 0) {
                if (groups[i].code === 2) name = groups[i].value;
                if (groups[i].code === 62) color = Math.abs(parseInt(groups[i].value));
                if (groups[i].code === 6) linetype = groups[i].value.toUpperCase();
                i++;
              }
              doc.layers.createLayer(name, color, linetype);
            } else {
              i++;
            }
          }
        }
      } else {
        i++;
      }
    }
    return i;
  }

  private parseBlocks(groups: DXFGroup[], i: number, doc: Document): number {
    while (i < groups.length && !(groups[i].code === 0 && groups[i].value === "ENDSEC")) {
      if (groups[i].code === 0 && groups[i].value === "BLOCK") {
        i++;
        let name = "";
        let bx = 0, by = 0;
        while (i < groups.length && groups[i].code !== 0) {
            if (groups[i].code === 2) name = groups[i].value;
            if (groups[i].code === 10) bx = parseFloat(groups[i].value);
            if (groups[i].code === 20) by = parseFloat(groups[i].value);
            i++;
        }
        
        const blockEntities: Entity[] = [];
        while (i < groups.length && !(groups[i].code === 0 && groups[i].value === "ENDBLK")) {
            const dummyDoc = new Document();
            i = this.parseEntities(groups, i, dummyDoc, true);
            blockEntities.push(...dummyDoc.getAllEntities());
        }
        
        if (name) {
            doc.blocks.addBlock(name, { x: bx, y: by }, blockEntities);
        }
        i++; 
      } else {
        i++;
      }
    }
    return i;
  }

  private parseEntities(groups: DXFGroup[], i: number, doc: Document, isBlockSubSection = false): number {
    const endCondition = isBlockSubSection ? "ENDBLK" : "ENDSEC";
    
    while (i < groups.length && !(groups[i].code === 0 && (groups[i].value === endCondition || groups[i].value === "SECTION"))) {
      const g = groups[i];
      const type = g.value;
      if (g.code === 0) {
        i++;
        const entityGroups: DXFGroup[] = [];
        const props: Record<number, string> = {};
        while (i < groups.length && groups[i].code !== 0) {
          entityGroups.push(groups[i]);
          props[groups[i].code] = groups[i].value;
          i++;
        }

        const layer = props[8] || "0";
        let entity: Entity | null = null;

        if (type === "LINE") {
          entity = new Line(doc.getNextId("L"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[11]), parseFloat(props[21]));
        } else if (type === "CIRCLE") {
          entity = new Circle(doc.getNextId("C"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[40]));
        } else if (type === "DONUT") {
          entity = new Donut(doc.getNextId("D"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[40]), parseFloat(props[41]));
        } else if (type === "ARC") {
          entity = new Arc(doc.getNextId("A"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[40]), 
            parseFloat(props[50]) * Math.PI / 180, parseFloat(props[51]) * Math.PI / 180, true);
        } else if (type === "POINT") {
          entity = new Point(doc.getNextId("PT"), parseFloat(props[10]), parseFloat(props[20]));
        } else if (type === "TEXT") {
          entity = new Text(doc.getNextId("TX"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[40]), parseFloat(props[50] || "0"), props[1] || "");
        } else if (type === "MTEXT") {
          const insertionPoint = { x: parseFloat(props[10] || "0"), y: parseFloat(props[20] || "0") };
          const width = parseFloat(props[41] || "0");
          const contents = props[1] || "";
          const mtext = new MText(doc.getNextId("MTX"), insertionPoint, width, 0, contents);
          mtext.textHeight = parseFloat(props[40] || "2.5");
          mtext.rotation = parseFloat(props[50] || "0") * Math.PI / 180; // Convert to radians
          mtext.attachmentPoint = parseInt(props[71] || "1") as AttachmentPoint;
          mtext.layoutMText();
          entity = mtext;
        } else if (type === "ELLIPSE") {
          entity = new Ellipse(doc.getNextId("E"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[11]), parseFloat(props[21]), parseFloat(props[40]));
        } else if (type === "SOLID" || type === "TRACE") {
          const vertices = [];
          if (props[10] !== undefined) vertices.push({ x: parseFloat(props[10]), y: parseFloat(props[20]) });
          if (props[11] !== undefined) vertices.push({ x: parseFloat(props[11]), y: parseFloat(props[21]) });
          if (props[12] !== undefined) vertices.push({ x: parseFloat(props[12]), y: parseFloat(props[22]) });
          if (props[13] !== undefined) vertices.push({ x: parseFloat(props[13]), y: parseFloat(props[23]) });
          
          if (type === "SOLID") {
            entity = new Solid(doc.getNextId("SD"), vertices);
          } else {
            entity = new Line(doc.getNextId("L"), vertices[0].x, vertices[0].y, vertices[2].x, vertices[2].y);
          }
        } else if (type === "SHAPE") {
          entity = new Shape(doc.getNextId("SH"), props[2], parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[40] || "1.0"), parseFloat(props[50] || "0"), []);
        } else if (type === "HATCH") {
          const pattern = props[2] || "ANSI31";
          const scale = parseFloat(props[41] || "1.0");
          const angle = parseFloat(props[52] || "0");
          const vertices: { x: number, y: number }[] = [];
          
          for (let k = 0; k < entityGroups.length; k++) {
            if (entityGroups[k].code === 10) {
              const vx = parseFloat(entityGroups[k].value);
              const vy = parseFloat(entityGroups[k+1] && entityGroups[k+1].code === 20 ? entityGroups[k+1].value : "0");
              vertices.push({ x: vx, y: vy });
            }
          }
          entity = new Hatch(doc.getNextId("H"), vertices, pattern, scale, angle);
        } else if (type === "SPLINE") {
          const degree = parseInt(props[71] || "3");
          const knots: number[] = [];
          const controlPoints: { x: number, y: number }[] = [];
          
          for (let k = 0; k < entityGroups.length; k++) {
            if (entityGroups[k].code === 40) {
              knots.push(parseFloat(entityGroups[k].value));
            } else if (entityGroups[k].code === 10) {
              const vx = parseFloat(entityGroups[k].value);
              const vy = parseFloat(entityGroups[k+1] && entityGroups[k+1].code === 20 ? entityGroups[k+1].value : "0");
              controlPoints.push({ x: vx, y: vy });
            }
          }
          entity = new Spline(doc.getNextId("S"), controlPoints, degree, knots);
        } else if (type === "NOTE") {
          const anchor = { x: parseFloat(props[10]), y: parseFloat(props[20]) };
          const bend = { x: parseFloat(props[11]), y: parseFloat(props[21]) };
          const text = props[1] || "";
          const height = parseFloat(props[40] || "2.5");
          const targetId = props[2] || null;
          entity = new Note(doc.getNextId("N"), targetId, anchor, bend, text, height);
        } else if (type === "POLYLINE") {
          const vertices: PolylineVertex[] = [];
          const closed = (parseInt(props[70] || "0") & 1) !== 0;
          while (i < groups.length && !(groups[i].code === 0 && groups[i].value === "SEQEND")) {
            if (groups[i].code === 0 && groups[i].value === "VERTEX") {
              i++;
              let vx = 0, vy = 0, bulge = 0;
              while (i < groups.length && groups[i].code !== 0) {
                if (groups[i].code === 10) vx = parseFloat(groups[i].value);
                if (groups[i].code === 20) vy = parseFloat(groups[i].value);
                if (groups[i].code === 42) bulge = parseFloat(groups[i].value);
                i++;
              }
              vertices.push({ x: vx, y: vy, bulge });
            } else {
              i++;
            }
          }
          const prefix = props[1000] === "PG" ? "PG" : "PL";
          entity = new Polyline(doc.getNextId(prefix), vertices, closed);
        } else if (type === "INSERT") {
            entity = new Insert(doc.getNextId("I"), props[2], parseFloat(props[10]), parseFloat(props[20]), 
                parseFloat(props[41] || "1.0"), parseFloat(props[42] || "1.0"), parseFloat(props[50] || "0"));
        } else if (type === "DIMENSION") {
            const dimType = parseInt(props[70] || "1");
            let typeStr: 'LINEAR' | 'ALIGNED' | 'ANGULAR' | 'RADIUS' | 'DIAMETER' = 'LINEAR';
            if (dimType === 2) typeStr = 'ANGULAR';
            else if (dimType === 3) typeStr = 'RADIUS';
            else if (dimType === 4) typeStr = 'DIAMETER';
            else if (dimType === 1) typeStr = 'LINEAR';
            
            const x1 = parseFloat(props[13] || "0");
            const y1 = parseFloat(props[23] || "0");
            const x2 = parseFloat(props[14] || "0");
            const y2 = parseFloat(props[24] || "0");
            const textHeight = parseFloat(props[40] || "2.5");
            const offset = 10;
            
            const dim = new Dimension(doc.getNextId("DIM"), typeStr, x1, y1, x2, y2, offset);
            dim.style.textHeight = textHeight;
            
            if (props[10] !== undefined && props[20] !== undefined) {
              dim.dimLineLocation = { x: parseFloat(props[10]), y: parseFloat(props[20]) };
            }
            
            if (typeStr === 'ANGULAR' && props[15] !== undefined && props[25] !== undefined) {
              dim.properties = { vertex: { x: parseFloat(props[15]), y: parseFloat(props[25]) } };
            }
            
            if (parseInt(props[71] || "0") === 1) {
              dim.properties = { ...dim.properties, textAligned: true };
            }
            
            entity = dim;
        }

        if (entity) {
          entity.layer = layer;
          doc.addEntity(entity);
        }
      } else {
        i++;
      }
    }
    return i;
  }
}
