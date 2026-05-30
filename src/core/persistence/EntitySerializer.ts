import { Entity } from '../model/Entity'
import { Line } from '../model/Line'
import { Polyline } from '../model/Polyline'
import { Circle } from '../model/Circle'
import { Arc } from '../model/Arc'
import { Ellipse } from '../model/Ellipse'
import { Spline } from '../model/Spline'
import { Text } from '../model/Text'
import { MText } from '../model/MText'
import { Dimension } from '../model/Dimension'
import { Hatch } from '../model/Hatch'
import { Insert } from '../model/Insert'
import { Donut } from '../model/Donut'
import { Solid } from '../model/Solid'
import { Trace } from '../model/Trace'
import { Note } from '../model/Note'
import { Point } from '../model/Point'
import { Solid3D } from '../model/Solid3D'
import { ImagePlane } from '../model/ImagePlane'

export function uint8ArrayToBase64(arr: Uint8Array): string {
  let binary = "";
  const len = arr.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(arr[i]);
  }
  return btoa(binary);
}

export function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export class EntitySerializer {

  static serialize(entity: Entity, projectId: string): object {
    const cp = entity instanceof Solid3D ? entity.creationParams : undefined;
    return {
      id:             entity.id,
      projectId,
      type:           entity.constructor.name,
      layer:          entity.layer,
      color:          entity.color,
      linetype:       entity.linetype,
      elevation:      entity.elevation,
      thickness:      entity.thickness,
      data:           JSON.stringify(this.serializeData(entity)),
      properties:     JSON.stringify(entity.properties ?? {}),
      creationParams: cp ? JSON.stringify(cp) : '',
      updatedAt:      Date.now()
    }
  }

  private static serializeData(e: Entity): object {
    if (e instanceof Line)      return { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2 }
    if (e instanceof Polyline)  return { vertices: e.vertices, closed: e.closed }
    if (e instanceof Circle)    return { cx: e.cx, cy: e.cy, r: e.r }
    if (e instanceof Arc)       return { cx: e.cx, cy: e.cy, r: e.r, startAngle: e.startAngle, endAngle: e.endAngle, ccw: e.ccw }
    if (e instanceof Ellipse)   return { cx: e.cx, cy: e.cy, majorX: e.majorX, majorY: e.majorY, ratio: e.ratio, startAngle: e.startAngle, endAngle: e.endAngle, ccw: e.ccw }
    if (e instanceof Spline)    return { controlPoints: e.controlPoints, degree: e.degree,
                                         isClosed: e.isClosed, knots: e.knots, sampledPoints: e.sampledPoints }
    if (e instanceof Text)      return { x: e.x, y: e.y, text: e.text, height: e.height, rotation: e.rotation }
    if (e instanceof MText)     return { insertionPoint: e.insertionPoint, width: e.width, height: e.height, contents: e.contents, textHeight: e.textHeight, lineSpacing: e.lineSpacing, textAlign: e.textAlign, attachmentPoint: e.attachmentPoint, rotation: e.rotation }
    if (e instanceof Dimension) return { type: e.type, x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, offset: e.offset, style: e.style, dimLineLocation: e.dimLineLocation }
    if (e instanceof Hatch)     return { boundaryVertices: e.boundaryVertices, pattern: e.pattern,
                                         patternScale: e.patternScale, angle: e.angle, color: e.color }
    if (e instanceof Insert)    return { blockName: (e as any).blockName, x: (e as any).x, y: (e as any).y, z: (e as any).z,
                                         scaleX: e.scaleX, scaleY: e.scaleY, rotation: e.rotation }
    if (e instanceof Donut)     return { cx: (e as any).cx, cy: (e as any).cy,
                                         innerR: (e as any).innerR, outerR: (e as any).outerR }
    if (e instanceof Solid)     return { vertices: e.vertices }
    if (e instanceof Trace)     return { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, width: e.width }
    if (e instanceof Note)      return { targetEntityId: e.targetEntityId, anchorPoint: e.anchorPoint, bendPoint: e.bendPoint, text: e.text, height: e.height }
    if (e instanceof Point)     return { x: (e as any).x, y: (e as any).y }
    if (e instanceof Solid3D) {
      // Geometry is in tessellation_cache — store only counts + transform
      return { positionCount: e.positions.length, indexCount: e.indices.length,
               position: e.position, rotation: e.rotation, features: e.features,
               baseBrepSnapshot: e.baseBrepSnapshot ? uint8ArrayToBase64(e.baseBrepSnapshot) : undefined }
    }
    if (e instanceof ImagePlane) return { cx: e.cx, cy: e.cy, width: e.width, height: e.height, rotation: e.rotation, imageUrl: e.imageUrl, displayMode: e.displayMode, zoomFactor: e.zoomFactor, opacity: e.opacity }
    return {}
  }

  static deserialize(row: any): Entity {
    const d = JSON.parse(row.data)
    let entity: Entity

    switch (row.type) {
      case 'Line':      entity = new Line(row.id, d.x1, d.y1, d.x2, d.y2, row.elevation, row.thickness); break
      case 'Polyline':  entity = new Polyline(row.id, d.vertices, d.closed, row.elevation, row.thickness); break
      case 'Circle':    entity = new Circle(row.id, d.cx, d.cy, d.r, row.elevation, row.thickness); break
      case 'Arc':       entity = new Arc(row.id, d.cx, d.cy, d.r, d.startAngle, d.endAngle, d.ccw, row.elevation, row.thickness); break
      case 'Ellipse': {
        const el = new Ellipse(row.id, d.cx, d.cy, d.majorX, d.majorY, d.ratio, d.startAngle, d.endAngle, d.ccw, row.elevation, row.thickness);
        entity = el;
        break;
      }
      case 'Spline': {
        const s = new Spline(row.id, d.controlPoints, d.degree, d.knots, d.isClosed, row.elevation, row.thickness)
        s.sampledPoints = d.sampledPoints; entity = s; break
      }
      case 'Text': {
        entity = new Text(row.id, d.x, d.y, d.height, d.rotation, d.text, row.elevation, row.thickness);
        break;
      }
      case 'MText': {
        const mt = new MText(row.id, d.insertionPoint, d.width, d.height, d.contents, row.elevation, row.thickness);
        mt.textHeight = d.textHeight;
        mt.lineSpacing = d.lineSpacing;
        mt.textAlign = d.textAlign;
        mt.attachmentPoint = d.attachmentPoint;
        mt.rotation = d.rotation;
        entity = mt;
        break;
      }
      case 'Dimension': {
        const dim = new Dimension(row.id, d.type, d.x1, d.y1, d.x2, d.y2, d.offset);
        dim.style = d.style;
        dim.dimLineLocation = d.dimLineLocation;
        entity = dim;
        break;
      }
      case 'Hatch': {
        entity = new Hatch(row.id, d.boundaryVertices, d.pattern, d.patternScale, d.angle, d.color);
        entity.elevation = row.elevation;
        entity.thickness = row.thickness;
        break;
      }
      case 'Insert': {
        const ins = new Insert(row.id, d.blockName, d.x, d.y, d.scaleX, d.scaleY, d.rotation, d.z);
        ins.elevation = row.elevation;
        ins.thickness = row.thickness;
        entity = ins;
        break;
      }
      case 'Donut': {
        entity = new Donut(row.id, d.cx, d.cy, d.innerR, d.outerR);
        entity.elevation = row.elevation;
        entity.thickness = row.thickness;
        break;
      }
      case 'Solid': {
        entity = new Solid(row.id, d.vertices);
        entity.elevation = row.elevation;
        entity.thickness = row.thickness;
        break;
      }
      case 'Trace': {
        entity = new Trace(row.id, d.x1, d.y1, d.x2, d.y2, d.width);
        entity.elevation = row.elevation;
        entity.thickness = row.thickness;
        break;
      }
      case 'Note':      entity = new Note(row.id, d.targetEntityId, d.anchorPoint, d.bendPoint, d.text, d.height); break
      case 'Point':     entity = new Point(row.id, d.x, d.y); break
      case 'ImagePlane': {
        entity = new ImagePlane(row.id, d.cx, d.cy, d.width, d.height, d.rotation, d.imageUrl, d.displayMode, d.zoomFactor, d.opacity, row.elevation, row.thickness);
        break;
      }
      case 'Solid3D': {
        const s3d = new Solid3D(row.id, [], [])   // geometry filled by PersistenceService
        if (d.position) s3d.position = d.position
        if (d.rotation) s3d.rotation = d.rotation
        if (d.features) s3d.features = d.features
        if (d.baseBrepSnapshot) s3d.baseBrepSnapshot = base64ToUint8Array(d.baseBrepSnapshot)
        s3d.ensureFeaturesFromCreationParams()
        entity = s3d; break
      }
      default: throw new Error(`Unknown entity type: ${row.type}`)
    }

    entity.layer     = row.layer
    entity.color     = row.color
    entity.linetype  = row.linetype
    entity.elevation = row.elevation
    entity.thickness = row.thickness
    entity.properties = JSON.parse(row.properties || '{}')
    if (row.type === 'Solid3D' && row.creationParams) {
      (entity as Solid3D).creationParams = JSON.parse(row.creationParams)
    }
    return entity
  }
}
