
import { Viewer } from "./render/Viewer"
import { CommandManager } from "./core/engine/CommandManager"
import { Document } from "./core/model/Document"
import { CommandResponse, CommandAction } from "./core/commands/types"
import { Entity } from "./core/model/Entity"
import { Line } from "./core/model/Line"
import { Circle } from "./core/model/Circle"
import { Arc } from "./core/model/Arc"
import { Point } from "./core/model/Point"
import { Polyline } from "./core/model/Polyline"
import { Text } from "./core/model/Text"
import { OpenCascadeService } from "./core/io/OpenCascadeService"
import { FormatUtils } from "./core/engine/FormatUtils"
import * as THREE from "three"

export class App {
  viewer:Viewer
  cmd:CommandManager
  doc: Document

  constructor(viewer:Viewer){
    this.viewer = viewer
    this.cmd = new CommandManager()
    this.doc = new Document()

    // Add lighting for 3D meshes
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(100, 100, 500);
    this.viewer.scene.add(ambient, directional);
  }

  execute(cmd:string){
    return this.cmd.execute(cmd)
  }

  inputText(text:string){
    const result = this.cmd.inputString(text)
    return this.handleResult(result)
  }

  move(screenX: number, screenY: number) {
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    this.viewer.setCursor(worldPt.x, worldPt.y);

    if (this.cmd.active && this.cmd.active.getPreview) {
      const preview = this.cmd.active.getPreview(worldPt.x, worldPt.y);
      this.viewer.setPreview(preview);
    } else {
      this.viewer.setPreview(null);
    }

    if (this.cmd.active && this.cmd.active.getReferencePoints) {
      this.viewer.setHelpers(this.cmd.active.getReferencePoints());
    } else {
      this.viewer.setHelpers(null);
    }
  }

  click(screenX:number, screenY:number){
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const { x, y } = worldPt;

    // If ERASE or MOVE is active and in selection step, try to pick an entity
    const activeName = this.cmd.active?.constructor.name;
    const isSelectionStep = this.cmd.active && this.cmd.active.step === 0;

    if (isSelectionStep && (activeName === 'EraseCommand' || activeName === 'MoveCommand')) {
      const id = this.viewer.pickEntity(screenX, screenY) // PickEntity still uses screen coords
      if (id) {
        // Forward the ID as string input to the command
        const res = this.cmd.inputString(id)
        return this.handleResult(res)
      }
    }

    const result = this.cmd.inputPoint(x, y)
    return this.handleResult(result)
  }

  private handleResult(result: CommandResponse | undefined) {
    if (result && typeof result === 'object') {
      // Case: New Entity Created (Standard or via 'close')
      let entity: Entity | undefined;
      
      if (result instanceof Line || result instanceof Circle || result instanceof Arc || result instanceof Point || result instanceof Polyline || result instanceof Text) {
        entity = result;
      } else if ('action' in result && result.action === 'close' && result.entity) {
        entity = result.entity;
        this.cmd.clearActive();
      }

      if (entity) {
        // Handle replacement if entity already exists (for PLINE updates)
        if (this.doc.getEntity(entity.id)) {
          this.viewer.removeObject(entity.id);
        }

        this.doc.addEntity(entity)
        if (entity instanceof Line) {
          this.viewer.addLine(entity.x1, entity.y1, entity.x2, entity.y2, entity.id)
        } else if (entity instanceof Circle) {
          this.viewer.addCircle(entity.cx, entity.cy, entity.r, entity.id)
        } else if (entity instanceof Arc) {
          this.viewer.addArc(entity.cx, entity.cy, entity.r, entity.startAngle, entity.endAngle, entity.ccw, entity.id)
        } else if (entity instanceof Point) {
          this.viewer.addPoint(entity.x, entity.y, entity.id)
        } else if (entity instanceof Polyline) {
          this.viewer.addPolyline(entity)
        } else if (entity instanceof Text) {
          this.viewer.addText(entity)
        }
        this.viewer.setPreview(null)
        this.viewer.render()
        
        if (entity instanceof Circle || entity instanceof Arc || entity instanceof Point || entity instanceof Text) {
          this.cmd.clearActive();
        }

        this.viewer.setHelpers(null)

        if (result && typeof result === 'object' && 'action' in result && result.action === 'close') {
           return "Command finished.";
        }

        // Return dimension echo if available
        if ((entity as any)._echo) {
          return (entity as any)._echo;
        }

        if (entity instanceof Line) {
          const dx = entity.x2 - entity.x1;
          const dy = entity.y2 - entity.y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          return `${FormatUtils.formatPoint(entity.x2, entity.y2, "P" + (this.cmd.active as any).points.length)}\nLine created. ${FormatUtils.formatDistance(len)}`;
        }

        if (entity instanceof Polyline) {
          const last = entity.vertices[entity.vertices.length - 1];
          return `${FormatUtils.formatPoint(last.x, last.y, "P" + entity.vertices.length)}\nPolyline segment added.`;
        }

        return entity;
      }

      // Case: Specialized Actions
      const actionResult = result as CommandAction;
      if (actionResult.action === 'delete' || actionResult.action === 'undo') {
        if (actionResult.id) {
          this.doc.removeEntity(actionResult.id)
          this.viewer.removeObject(actionResult.id)
          this.viewer.setPreview(null)
          this.viewer.render()
          if (actionResult.action === 'delete') this.cmd.clearActive();
          this.viewer.setHelpers(null)
          return `Entity ${actionResult.id} removed.`
        }
      }

      if (actionResult.action === 'move' && actionResult.id && actionResult.dx !== undefined) {
        const entity = this.doc.getEntity(actionResult.id);
        if (entity) {
          entity.move(actionResult.dx, actionResult.dy!);
          this.viewer.moveObject(actionResult.id, actionResult.dx, actionResult.dy!);
          this.viewer.setPreview(null)
          this.viewer.setHelpers(null)
          this.viewer.render();
          this.cmd.clearActive();
          return `Entity ${actionResult.id} moved.`
        }
      }

      if (actionResult.action === 'create3d' && actionResult.entity) {
        const ocService = OpenCascadeService.getInstance();
        const geometry = ocService.shapeToBufferGeometry((actionResult.entity as { id: string, shape: any }).shape);
        this.viewer.addMesh(geometry, actionResult.entity.id);
        this.viewer.setHelpers(null)
        this.viewer.render();
        this.cmd.clearActive();
        return `3D Entity ${actionResult.entity.id} created using OpenCascade.js.`;
      }

      if (actionResult.action === 'zoom') {
        if (actionResult.zoomType === 'window' && actionResult.p1 && actionResult.p2) {
          this.viewer.zoomWindow(actionResult.p1, actionResult.p2);
          this.viewer.setPreview(null)
          this.viewer.setHelpers(null)
          this.cmd.clearActive();
          return "Zoomed to window."
        } else if (actionResult.zoomType === 'all') {
          this.viewer.zoomAll(this.doc.getAllEntities());
          this.viewer.setPreview(null)
          this.viewer.setHelpers(null)
          this.cmd.clearActive();
          return "Zoomed to extents."
        }
      }

      if (actionResult.action === 'finish') {
        this.viewer.setPreview(null)
        this.viewer.setHelpers(null)
        this.cmd.clearActive();
        return "Command finished."
      }
    }
    return result
  }
}
