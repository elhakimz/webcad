
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
import { Solid } from "./core/model/Solid"
import { OpenCascadeService } from "./core/io/OpenCascadeService"
import { FormatUtils } from "./core/engine/FormatUtils"
import { SelectionEngine } from "./core/engine/SelectionEngine"
import * as THREE from "three"

export class App {
  viewer:Viewer
  cmd:CommandManager
  doc: Document
  selectedEntityIds: Set<string> = new Set()
  private selectionStartPoint: { x: number, y: number } | null = null

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
    const res = this.cmd.execute(cmd, Array.from(this.selectedEntityIds));
    return this.handleResult(res);
  }

  inputText(text:string){
    const result = this.cmd.inputString(text)
    return this.handleResult(result)
  }

  move(screenX: number, screenY: number) {
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    this.viewer.setCursor(worldPt.x, worldPt.y);

    if (this.selectionStartPoint) {
        const isCrossing = worldPt.x < this.selectionStartPoint.x;
        this.viewer.setSelectionBox(this.selectionStartPoint, worldPt, isCrossing);
    }

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

  pointerDown(screenX: number, screenY: number) {
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    this.selectionStartPoint = worldPt;
  }

  pointerUp(screenX: number, screenY: number): CommandResponse | undefined {
    if (!this.selectionStartPoint) return;

    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const dx = Math.abs(worldPt.x - this.selectionStartPoint.x);
    const dy = Math.abs(worldPt.y - this.selectionStartPoint.y);
    const tolerance = 5 / this.viewer.camera.zoom;

    const activeName = this.cmd.active?.constructor.name;
    const isEditCommand = activeName === 'EraseCommand' || activeName === 'MoveCommand' || activeName === 'CopyCommand' || activeName === 'RotateCommand' || activeName === 'ScaleCommand';
    const isSelectionStep = !this.cmd.active || (this.cmd.active && this.cmd.active.step === 0 && isEditCommand);

    let result: CommandResponse | undefined;

    if (dx < tolerance && dy < tolerance) {
        // Single click
        result = this.click(screenX, screenY);
    } else if (isSelectionStep) {
        // Box selection only allowed during selection steps
        const isCrossing = worldPt.x < this.selectionStartPoint.x;
        let found: Entity[] = [];
        if (isCrossing) {
            found = SelectionEngine.getEntitiesInCrossing(this.selectionStartPoint.x, this.selectionStartPoint.y, worldPt.x, worldPt.y, this.doc.getAllEntities());
        } else {
            found = SelectionEngine.getEntitiesInWindow(this.selectionStartPoint.x, this.selectionStartPoint.y, worldPt.x, worldPt.y, this.doc.getAllEntities());
        }
        
        found.forEach(e => this.selectedEntityIds.add(e.id));
    }

    this.selectionStartPoint = null;
    this.viewer.setSelectionBox(null);
    this.viewer.setHighlight(Array.from(this.selectedEntityIds));
    
    return result;
  }

  click(screenX:number, screenY:number){
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const { x, y } = worldPt;

    // Handle initial selection step for edit commands if clicking an entity
    const activeName = this.cmd.active?.constructor.name;
    const isEditCommand = activeName === 'EraseCommand' || activeName === 'MoveCommand' || activeName === 'CopyCommand' || activeName === 'RotateCommand' || activeName === 'ScaleCommand';
    const isSelectionStep = !this.cmd.active || (this.cmd.active && this.cmd.active.step === 0 && isEditCommand);
    const tolerance = 5 / this.viewer.camera.zoom;

    if (isSelectionStep) {
        const entity = SelectionEngine.getEntityAt(x, y, tolerance, this.doc.getAllEntities());
        if (entity) {
            if (this.selectedEntityIds.has(entity.id)) {
                this.selectedEntityIds.delete(entity.id);
            } else {
                this.selectedEntityIds.add(entity.id);
            }

            if (this.cmd.active) {
                return this.handleResult(this.cmd.inputString(entity.id));
            }
            return;
        } else if (!this.cmd.active) {
            this.selectedEntityIds.clear();
        }
    }

    const result = this.cmd.inputPoint(x, y)
    return this.handleResult(result) || (this.cmd.active?.getPrompt ? this.cmd.active.getPrompt() : undefined);
  }

  private handleResult(result: CommandResponse | undefined) {
    if (result && typeof result === 'object') {
      // Case: New Entity Created (Standard or via 'close')
      let entity: Entity | undefined;
      
      if (result instanceof Line || result instanceof Circle || result instanceof Arc || result instanceof Point || result instanceof Polyline || result instanceof Text || result instanceof Solid) {
        entity = result;
      } else if ('action' in result && result.action === 'close' && result.entity) {
        entity = result.entity;
        this.cmd.clearActive();
      }

      if (entity) {
        this.addEntity(entity);
        
        // Only clear active command for single-shot commands
        const activeName = this.cmd.active?.constructor.name;
        const isMultiStep = activeName === 'LineCommand' || activeName === 'PolylineCommand' || activeName === 'SolidCommand';

        if (!isMultiStep || (result && typeof result === 'object' && 'action' in result && result.action === 'close')) {
          this.cmd.clearActive();
          this.viewer.setHelpers(null);
          this.viewer.setPreview(null);
        }

        if (result && typeof result === 'object' && 'action' in result && result.action === 'close') {
           return "Command finished.";
        }

        // Return dimension echo if available
        if ((entity as { _echo?: string })._echo) {
          return (entity as { _echo?: string })._echo;
        }

        if (entity instanceof Line) {
          const dx = entity.x2 - entity.x1;
          const dy = entity.y2 - entity.y1;
          const len = Math.sqrt(dx * dx + dy * dy);
          const pIdx = this.cmd.active && 'points' in this.cmd.active ? (this.cmd.active as { points: unknown[] }).points.length : "";
          return `${FormatUtils.formatPoint(entity.x2, entity.y2, "P" + pIdx)}\nLine created. ${FormatUtils.formatDistance(len)}`;
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
        const ids = actionResult.ids || (actionResult.id ? [actionResult.id] : []);
        if (ids.length > 0) {
          ids.forEach(id => {
            this.doc.removeEntity(id)
            this.viewer.removeObject(id)
          });
          this.selectedEntityIds.clear();
          this.viewer.setHighlight([]);
          this.viewer.setPreview(null)
          this.viewer.render()
          if (actionResult.action === 'delete') this.cmd.clearActive();
          this.viewer.setHelpers(null)
          return `Entities [${ids.join(', ')}] removed.`
        }
      }

      if (actionResult.action === 'move' && (actionResult.id || actionResult.ids) && actionResult.dx !== undefined) {
        const ids = actionResult.ids || (actionResult.id ? [actionResult.id] : []);
        ids.forEach(id => {
            const entity = this.doc.getEntity(id);
            if (entity) {
                entity.move(actionResult.dx!, actionResult.dy!);
                this.viewer.moveObject(id, actionResult.dx!, actionResult.dy!);
            }
        });
        this.selectedEntityIds.clear();
        this.viewer.setHighlight([]);
        this.viewer.setPreview(null)
        this.viewer.setHelpers(null)
        this.viewer.render();
        this.cmd.clearActive();
        return `Entities [${ids.join(', ')}] moved.`
      }

      if (actionResult.action === 'rotate' && (actionResult.id || actionResult.ids) && actionResult.angle !== undefined) {
        const ids = actionResult.ids || (actionResult.id ? [actionResult.id] : []);
        ids.forEach(id => {
            const entity = this.doc.getEntity(id);
            if (entity) {
                entity.rotate(actionResult.baseX!, actionResult.baseY!, actionResult.angle!);
                this.addEntity(entity); // addEntity replaces existing
            }
        });
        this.selectedEntityIds.clear();
        this.viewer.setHighlight([]);
        this.viewer.setPreview(null)
        this.viewer.setHelpers(null)
        this.viewer.render();
        this.cmd.clearActive();
        return `Entities [${ids.join(', ')}] rotated.`
      }

      if (actionResult.action === 'scale' && (actionResult.id || actionResult.ids) && actionResult.factor !== undefined) {
        const ids = actionResult.ids || (actionResult.id ? [actionResult.id] : []);
        ids.forEach(id => {
            const entity = this.doc.getEntity(id);
            if (entity) {
                entity.scale(actionResult.baseX!, actionResult.baseY!, actionResult.factor!);
                this.addEntity(entity); // addEntity replaces existing
            }
        });
        this.selectedEntityIds.clear();
        this.viewer.setHighlight([]);
        this.viewer.setPreview(null)
        this.viewer.setHelpers(null)
        this.viewer.render();
        this.cmd.clearActive();
        return `Entities [${ids.join(', ')}] scaled.`
      }

      if (actionResult.action === 'copy' && (actionResult.id || actionResult.ids) && actionResult.dx !== undefined) {
        const ids = actionResult.ids || (actionResult.id ? [actionResult.id] : []);
        const newIds: string[] = [];
        ids.forEach(id => {
            const source = this.doc.getEntity(id);
            if (source) {
                const newId = source.id + "_COPY_" + Math.random().toString(36).substr(2, 5);
                const copy = source.clone(newId);
                copy.move(actionResult.dx!, actionResult.dy!);
                this.addEntity(copy);
                newIds.push(newId);
            }
        });
        this.selectedEntityIds.clear();
        this.viewer.setHighlight([]);
        this.viewer.setPreview(null);
        this.viewer.setHelpers(null);
        this.viewer.render();
        this.cmd.clearActive();
        return `Entities copied to [${newIds.join(', ')}].`;
      }

      if (actionResult.action === 'create3d' && actionResult.entity) {
        const ocService = OpenCascadeService.getInstance();
        const geometry = ocService.shapeToBufferGeometry((actionResult.entity as { id: string, shape: unknown }).shape);
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

  private addEntity(entity: Entity) {
    if (this.doc.getEntity(entity.id)) {
      this.viewer.removeObject(entity.id);
    }

    this.doc.addEntity(entity);
    if (entity instanceof Line) {
      this.viewer.addLine(entity.x1, entity.y1, entity.x2, entity.y2, entity.id);
    } else if (entity instanceof Circle) {
      this.viewer.addCircle(entity.cx, entity.cy, entity.r, entity.id);
    } else if (entity instanceof Arc) {
      this.viewer.addArc(entity.cx, entity.cy, entity.r, entity.startAngle, entity.endAngle, entity.ccw, entity.id);
    } else if (entity instanceof Point) {
      this.viewer.addPoint(entity.x, entity.y, entity.id);
    } else if (entity instanceof Polyline) {
      this.viewer.addPolyline(entity);
    } else if (entity instanceof Text) {
      this.viewer.addText(entity);
    } else if (entity instanceof Solid) {
      this.viewer.addSolid(entity);
    }
    this.viewer.render();
  }
}
