import { Document } from "../model/Document";
import { Entity } from "../model/Entity";
import { Line } from "../model/Line";
import { Circle } from "../model/Circle";
import { Arc } from "../model/Arc";
import { Point } from "../model/Point";
import { Polyline, PolylineVertex } from "../model/Polyline";
import { Text } from "../model/Text";
import { Solid } from "../model/Solid";
import { Ellipse } from "../model/Ellipse";
import { Hatch } from "../model/Hatch";
import { Shape } from "../model/Shape";
import { Insert } from "../model/Insert";

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
        const props: Record<number, string> = {};
        while (i < groups.length && groups[i].code !== 0) {
          props[groups[i].code] = groups[i].value;
          i++;
        }

        const layer = props[8] || "0";
        let entity: Entity | null = null;

        if (type === "LINE") {
          entity = new Line(doc.getNextId("L"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[11]), parseFloat(props[21]));
        } else if (type === "CIRCLE") {
          entity = new Circle(doc.getNextId("C"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[40]));
        } else if (type === "ARC") {
          entity = new Arc(doc.getNextId("A"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[40]), 
            parseFloat(props[50]) * Math.PI / 180, parseFloat(props[51]) * Math.PI / 180, true);
        } else if (type === "POINT") {
          entity = new Point(doc.getNextId("PT"), parseFloat(props[10]), parseFloat(props[20]));
        } else if (type === "TEXT") {
          entity = new Text(doc.getNextId("TX"), parseFloat(props[10]), parseFloat(props[20]), parseFloat(props[40]), parseFloat(props[50] || "0"), props[1] || "");
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
          
          let k = i - Object.keys(props).length * 2 - 2; 
          while (k < groups.length && !(groups[k].code === 0 && groups[k].value !== "HATCH")) {
            if (groups[k].code === 10) {
              const vx = parseFloat(groups[k].value);
              const vy = parseFloat(groups[k+1].code === 20 ? groups[k+1].value : "0");
              vertices.push({ x: vx, y: vy });
            }
            k++;
          }
          entity = new Hatch(doc.getNextId("H"), vertices, pattern, scale, angle);
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
          entity = new Polyline(doc.getNextId("PL"), vertices, closed);
        } else if (type === "INSERT") {
            entity = new Insert(doc.getNextId("I"), props[2], parseFloat(props[10]), parseFloat(props[20]), 
                parseFloat(props[41] || "1.0"), parseFloat(props[42] || "1.0"), parseFloat(props[50] || "0"));
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
