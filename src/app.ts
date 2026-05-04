
import { Viewer } from "./render/Viewer"
import { CommandManager } from "./core/engine/CommandManager"
import { Document } from "./core/model/Document"
import { CommandResponse, CommandAction } from "./core/commands/types"
import { Entity } from "./core/model/Entity"
import { Line } from "./core/model/Line"
import { Circle } from "./core/model/Circle"

export class App {
  viewer:Viewer
  cmd:CommandManager
  doc: Document

  constructor(viewer:Viewer){
    this.viewer = viewer
    this.cmd = new CommandManager()
    this.doc = new Document()
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
    if (this.cmd.active && this.cmd.active.getPreview) {
      const preview = this.cmd.active.getPreview(worldPt.x, worldPt.y);
      this.viewer.setPreview(preview);
    } else {
      this.viewer.setPreview(null);
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
      
      if (result instanceof Line || result instanceof Circle) {
        entity = result;
      } else if ('action' in result && result.action === 'close' && result.entity) {
        entity = result.entity;
        this.cmd.clearActive();
      }

      if (entity) {
        this.doc.addEntity(entity)
        if (entity instanceof Line) {
          this.viewer.addLine(entity.x1, entity.y1, entity.x2, entity.y2, entity.id)
        } else if (entity instanceof Circle) {
          this.viewer.addCircle(entity.cx, entity.cy, entity.r, entity.id)
        }
        this.viewer.setPreview(null)
        this.viewer.render()
        
        if (entity instanceof Circle) {
          this.cmd.clearActive();
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
          return `Entity ${actionResult.id} removed.`
        }
      }

      if (actionResult.action === 'move' && actionResult.id && actionResult.dx !== undefined) {
        const entity = this.doc.getEntity(actionResult.id);
        if (entity) {
          entity.move(actionResult.dx, actionResult.dy!);
          this.viewer.moveObject(actionResult.id, actionResult.dx, actionResult.dy!);
          this.viewer.setPreview(null)
          this.viewer.render();
          this.cmd.clearActive();
          return `Entity ${actionResult.id} moved.`
        }
      }

      if (actionResult.action === 'zoom') {
        if (actionResult.zoomType === 'window' && actionResult.p1 && actionResult.p2) {
          this.viewer.zoomWindow(actionResult.p1, actionResult.p2);
          this.viewer.setPreview(null)
          this.cmd.clearActive();
          return "Zoomed to window."
        } else if (actionResult.zoomType === 'all') {
          this.viewer.zoomAll(this.doc.getAllEntities());
          this.viewer.setPreview(null)
          this.cmd.clearActive();
          return "Zoomed to extents."
        }
      }

      if (actionResult.action === 'finish') {
        this.viewer.setPreview(null)
        this.cmd.clearActive();
        return "Command finished."
      }
    }
    return result
  }
}
