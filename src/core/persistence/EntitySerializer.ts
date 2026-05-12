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

export class EntitySerializer {

  static serialize(entity: Entity, projectId: string): object {
    const cp = (entity as any).creationParams
    return {
      id:             entity.id,
      projectId,
      type:           entity.constructor.name,
      layer:          entity.layer,
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
    if (e instanceof Insert)    return { blockName: (e as any).blockName, x: (e as any).x, y: (e as any).y,
                                         scaleX: e.scaleX, scaleY: e.scaleY, rotation: e.rotation }
    if (e instanceof Donut)     return { cx: (e as any).cx, cy: (e as any).cy,
                                         innerR: (e as any).innerR, outerR: (e as any).outerR }
    if (e instanceof Solid)     return { vertices: e.vertices }
    if (e instanceof Trace)     return { x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, width: e.width }
    if (e instanceof Note)      return { x: (e as any).x, y: (e as any).y, text: (e as any).text,
                                         width: (e as any).width, height: (e as any).height }
    if (e instanceof Point)     return { x: (e as any).x, y: (e as any).y }
    if (e instanceof Solid3D)
      // Geometry is in tessellation_cache — store only counts + transform
      return { positionCount: e.positions.length, indexCount: e.indices.length,
               position: e.position, rotation: e.rotation }
    return {}
  }

  static deserialize(row: any): Entity {
    const d = JSON.parse(row.data)
    let entity: Entity

    switch (row.type) {
      case 'Line':      entity = new Line(row.id, d.x1, d.y1, d.x2, d.y2); break
      case 'Polyline':  entity = new Polyline(row.id, d.vertices, d.closed, row.elevation, row.thickness); break
      case 'Circle':    entity = new Circle(row.id, d.cx, d.cy, d.r); break
      case 'Arc':       entity = new Arc(row.id, d.cx, d.cy, d.r, d.startAngle, d.endAngle, d.ccw); break
      case 'Ellipse':   entity = new Ellipse(row.id, d.cx, d.cy, d.majorX, d.majorY, d.ratio, d.startAngle, d.endAngle, d.ccw); break
      case 'Spline': {
        const s = new Spline(row.id, d.controlPoints, d.degree, d.isClosed)
        s.knots = d.knots; s.sampledPoints = d.sampledPoints; entity = s; break
      }
      case 'Text':      entity = new Text(row.id, d.x, d.y, d.height, d.rotation, d.text); break
      case 'MText': {
        const mt = new MText(row.id, d.insertionPoint, d.width, d.height, d.contents);
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
      case 'Hatch':     entity = new Hatch(row.id, d.boundaryVertices, d.pattern, d.patternScale, d.angle, d.color); break
      case 'Insert':    entity = new Insert(row.id, d.blockName, d.x, d.y, d.scaleX, d.scaleY, d.rotation); break
      case 'Donut':     entity = new Donut(row.id, d.cx, d.cy, d.innerR, d.outerR); break
      case 'Solid':     entity = new Solid(row.id, d.vertices); break
      case 'Trace':     entity = new Trace(row.id, d.x1, d.y1, d.x2, d.y2, d.width); break
      case 'Note':      entity = new Note(row.id, d.x, d.y, d.text, d.width, d.height); break
      case 'Point':     entity = new Point(row.id, d.x, d.y); break
      case 'Solid3D': {
        const s3d = new Solid3D(row.id, [], [])   // geometry filled by PersistenceService
        if (d.position) s3d.position = d.position
        if (d.rotation) s3d.rotation = d.rotation
        entity = s3d; break
      }
      default: throw new Error(`Unknown entity type: ${row.type}`)
    }

    entity.layer     = row.layer
    entity.elevation = row.elevation
    entity.thickness = row.thickness
    entity.properties = JSON.parse(row.properties || '{}')
    if (row.type === 'Solid3D' && row.creationParams) {
      (entity as Solid3D).creationParams = JSON.parse(row.creationParams)
    }
    return entity
  }
}
