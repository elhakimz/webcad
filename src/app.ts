
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
import { Trace } from "./core/model/Trace"
import { Shape } from "./core/model/Shape"
import { Hatch } from "./core/model/Hatch"
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
  private commandLinePrint: ((msg: string) => void) | null = null
  private statusBarUpdate: ((layer: string) => void) | null = null

  setCommandLine(printFn: (msg: string) => void) {
    this.commandLinePrint = printFn;
  }

  setStatusBar(updateFn: (layer: string) => void) {
    this.statusBarUpdate = updateFn;
    updateFn(this.doc.layers.currentLayerName);
  }

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
    if (cmd === 'PAN' || cmd === 'P') {
      this.viewer.setLeftPanEnabled(true);
    }
    const res = this.cmd.execute(cmd, Array.from(this.selectedEntityIds));
    return this.handleResult(res);
  }

  inputText(text:string){
    // Handle Enter key (empty text) when there are selected entities and command is at step 0
    if (text === "" && this.selectedEntityIds.size > 0) {
      const activeName = this.cmd.active?.constructor.name;
      const isEditCommand = activeName === 'EraseCommand' || activeName === 'MoveCommand' || activeName === 'CopyCommand' || activeName === 'RotateCommand' || activeName === 'ScaleCommand' || activeName === 'MirrorCommand';
      if (isEditCommand && this.cmd.active && this.cmd.active.step === 0) {
        const ids = Array.from(this.selectedEntityIds);
        const cmdName = activeName?.replace('Command', '').toUpperCase();
        if (cmdName) {
          const res = this.cmd.execute(cmdName, ids);
          return this.handleResult(res);
        }
      }
    }
    const result = this.cmd.inputString(text)
    return this.handleResult(result)
  }

  move(screenX: number, screenY: number) {
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    this.viewer.setCursor(worldPt.x, worldPt.y);

    if (this.cmd.active?.constructor.name === 'SketchCommand') {
      const sketchCmd = this.cmd.active as any;
      if (sketchCmd.updateSketch) {
        sketchCmd.updateSketch(worldPt.x, worldPt.y);
      }
    }

    if (this.selectionStartPoint) {
        this.viewer.setSelectionBox(this.selectionStartPoint, worldPt);
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

    if (this.cmd.active && (this.cmd.active as any).getBasePoint) {
      const basePt = (this.cmd.active as any).getBasePoint();
      if (basePt && this.cmd.active && this.cmd.active.step >= 1) {
        this.viewer.setBaseLine(basePt, worldPt);
      } else {
        this.viewer.setBaseLine(null, null);
      }
    } else {
      this.viewer.setBaseLine(null, null);
    }
  }

  pointerDown(screenX: number, screenY: number) {
    const worldPt = this.viewer.screenToWorld(screenX, screenY);

    if (this.cmd.active?.constructor.name === 'SketchCommand') {
      const sketchCmd = this.cmd.active as any;
      if (sketchCmd.startSketch) {
        const res = sketchCmd.startSketch(worldPt.x, worldPt.y);
        if (res) this.handleResult(res);
        return;
      }
    }

    this.selectionStartPoint = worldPt;
  }

  pointerUp(screenX: number, screenY: number): CommandResponse | undefined {
    if (this.cmd.active?.constructor.name === 'SketchCommand') {
      const sketchCmd = this.cmd.active as any;
      if (sketchCmd.finishSketch) {
        const res = sketchCmd.finishSketch();
        if (res) return this.handleResult(res);
      }
    }

    if (!this.selectionStartPoint) return;

    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const dx = Math.abs(worldPt.x - this.selectionStartPoint.x);
    const dy = Math.abs(worldPt.y - this.selectionStartPoint.y);
    const tolerance = 5 / this.viewer.camera.zoom;

    const activeName = this.cmd.active?.constructor.name;
    const isEditCommand = activeName === 'EraseCommand' || activeName === 'MoveCommand' || activeName === 'CopyCommand' || activeName === 'RotateCommand' || activeName === 'ScaleCommand' || activeName === 'MirrorCommand';
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
      if (this.commandLinePrint) this.commandLinePrint(`[Selection] Multiple (box): ${found.length} objects selected`);
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
    const isEditCommand = activeName === 'EraseCommand' || activeName === 'MoveCommand' || activeName === 'CopyCommand' || activeName === 'RotateCommand' || activeName === 'ScaleCommand' || activeName === 'MirrorCommand';
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

            if (this.commandLinePrint) this.commandLinePrint(`[Selection] Single: 1 object selected`);

            if (this.cmd.active) {
                return this.handleResult(this.cmd.inputString(entity.id));
            }
            return;
        } else if (!this.cmd.active) {
            this.selectedEntityIds.clear();
        }

        // If there's an active edit command at step 0 and user has selected entities, re-run command with selection
        if (this.cmd.active && this.cmd.active.step === 0 && isEditCommand && this.selectedEntityIds.size > 0) {
            const ids = Array.from(this.selectedEntityIds);
            const cmdName = activeName?.replace('Command', '').toUpperCase();
            if (cmdName) {
                const res = this.cmd.execute(cmdName, ids);
                return this.handleResult(res);
            }
        }
    }

    const result = this.cmd.inputPoint(x, y)

    const cmdName = this.cmd.active?.constructor.name;
    if (cmdName === 'HatchCommand' && this.cmd.active && 'vertices' in this.cmd.active) {
      const hatchCmd = this.cmd.active as { vertices: { x: number; y: number }[]; step: number };
      if (hatchCmd.step === 0 && hatchCmd.vertices.length > 0) {
        const lastPt = hatchCmd.vertices[hatchCmd.vertices.length - 1];
        this.viewer.addBoundaryMarker(lastPt.x, lastPt.y);
      }
    }

    return this.handleResult(result) || (this.cmd.active?.getPrompt ? this.cmd.active.getPrompt() : undefined);
  }

  private handleResult(result: CommandResponse | undefined) {
    console.log('handleResult called', result);
    if (result && typeof result === 'object') {
      // Case: New Entity Created (Standard or via 'close')
      let entity: Entity | undefined;
      
      console.log('Result is object, checking type');
      if (result instanceof Line || result instanceof Circle || result instanceof Arc || result instanceof Point || result instanceof Polyline || result instanceof Text || result instanceof Solid || result instanceof Trace || result instanceof Hatch) {
        console.log('Direct entity detected');
        entity = result;
      } else if ('action' in result && result.action === 'close' && result.entity) {
        entity = result.entity;
        this.cmd.clearActive();
      }

      if (entity) {
        this.addEntity(entity);
        
        // Only clear active command for single-shot commands
        const activeName = this.cmd.active?.constructor.name;
        const isMultiStep = activeName === 'LineCommand' || activeName === 'PolylineCommand' || activeName === 'SolidCommand' || activeName === 'TraceCommand' || activeName === 'HatchCommand';

        if (!isMultiStep || (result && typeof result === 'object' && 'action' in result && result.action === 'close')) {
          this.cmd.clearActive();
          this.viewer.setHelpers(null);
          this.viewer.setPreview(null);
          this.viewer.setBaseLine(null, null);
          this.viewer.clearBoundaryMarkers();
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
          this.viewer.clearHighlight();
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
        this.viewer.clearHighlight();
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
        this.viewer.clearHighlight();
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
        this.viewer.clearHighlight();
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
        this.viewer.clearHighlight();
        this.viewer.setPreview(null);
        this.viewer.setHelpers(null);
        this.viewer.render();
        this.cmd.clearActive();
        return `Entities copied to [${newIds.join(', ')}].`;
      }

      if (actionResult.action === 'mirror' && actionResult.ids && actionResult.p1 && actionResult.p2 && actionResult.deleteOriginal !== undefined) {
        const { ids, p1, p2, deleteOriginal } = actionResult;
        const newIds: string[] = [];
        
        if (deleteOriginal) {
          // Mirror in place - modify and update
          ids.forEach(id => {
            const source = this.doc.getEntity(id);
            if (source) {
              source.mirror(p1, p2);
              this.addEntity(source);
            }
          });
        } else {
          // Keep originals - clone, mirror clone, add clone
          ids.forEach(id => {
            const source = this.doc.getEntity(id);
            if (source) {
              const target = source.clone(source.id + "_MIRROR_" + Math.random().toString(36).substr(2, 5));
              target.mirror(p1, p2);
              this.addEntity(target);
              newIds.push(target.id);
            }
          });
        }

        this.selectedEntityIds.clear();
        this.viewer.clearHighlight();
        this.viewer.setPreview(null);
        this.viewer.setHelpers(null);
        this.viewer.render();
        this.cmd.clearActive();
        return deleteOriginal 
          ? `Entities mirrored and originals deleted.`
          : `Entities mirrored to [${newIds.join(', ')}].`;
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
        } else if (actionResult.zoomType === 'factor') {
          const factor = actionResult.factor as number;
          this.viewer.zoomByFactor(factor);
          this.viewer.setPreview(null)
          this.viewer.setHelpers(null)
          this.cmd.clearActive();
          return `Zoomed by ${factor}x.`
        }
      }

      if (actionResult.action === 'undo') {
        const actions = this.doc.undo();
        this.syncFromDocument();
        this.viewer.setPreview(null)
        this.viewer.setHelpers(null)
        return actions.length > 0 ? "Undo successful." : "Nothing to undo."
      }

      if (actionResult.action === 'redo') {
        const actions = this.doc.redo();
        this.syncFromDocument();
        this.viewer.setPreview(null)
        this.viewer.setHelpers(null)
        return actions.length > 0 ? "Redo successful." : "Nothing to redo."
      }

      if (actionResult.action === 'layerList') {
        const layers = this.doc.layers.listLayers()
        let output = "Layer list:\n"
        for (const layer of layers) {
          const current = layer.name === this.doc.layers.currentLayerName ? " <Current>" : ""
          const frozen = layer.isFrozen ? " Frozen" : ""
          const locked = layer.isLocked ? " Locked" : ""
          const visible = !layer.isVisible ? " Hidden" : ""
          output += `  ${layer.name} Color:${layer.color} ${layer.linetype}${current}${frozen}${locked}${visible}\n`
        }
        this.cmd.clearActive()
        return output
      }

      if (actionResult.action === 'layerNew') {
        const name = actionResult.name as string
        const layer = this.doc.layers.createLayer(name)
        if (layer) {
          this.doc.layers.setCurrentLayer(name)
          if (this.statusBarUpdate) this.statusBarUpdate(name)
          console.log("[LAYER DEBUG] Created layer:", name, "Current:", this.doc.layers.currentLayerName, "Layers:", Array.from(this.doc.layers.layers.keys()))
          return `Layer "${name}" created and set as current.`
        }
        return `Layer "${name}" already exists.`
      }

      if (actionResult.action === 'layerSetCurrent') {
        const name = actionResult.name as string
        const layer = this.doc.layers.setCurrentLayer(name)
        if (layer) {
          if (this.statusBarUpdate) this.statusBarUpdate(name)
          console.log("[LAYER DEBUG] Set current layer:", name, "All layers:", this.getLayerDebugInfo())
          return `Layer "${name}" is now current.`
        }
        return `Cannot set layer "${name}" as current (not found or frozen).`
      }

      if (actionResult.action === 'layerOn') {
        const names = (actionResult.names as string).split(/[,\s]+/)
        for (const name of names) {
          const layer = this.doc.layers.getLayer(name)
          if (layer) layer.isVisible = true
        }
        this.updateLayerVisibility()
        return "Layers turned ON."
      }

      if (actionResult.action === 'layerOff') {
        const names = (actionResult.names as string).split(/[,\s]+/)
        for (const name of names) {
          const layer = this.doc.layers.getLayer(name)
          if (layer) layer.isVisible = false
        }
        this.updateLayerVisibility()
        console.log("[LAYER DEBUG] Turned OFF:", actionResult.names, "Layers:", this.getLayerDebugInfo())
        return "Layers turned OFF."
      }

      if (actionResult.action === 'layerFreeze') {
        const names = (actionResult.names as string).split(/[,\s]+/)
        for (const name of names) {
          const layer = this.doc.layers.getLayer(name)
          if (layer) layer.isFrozen = true
        }
        this.updateLayerVisibility()
        return "Layers frozen."
      }

      if (actionResult.action === 'layerThaw') {
        const names = (actionResult.names as string).split(/[,\s]+/)
        for (const name of names) {
          const layer = this.doc.layers.getLayer(name)
          if (layer) layer.isFrozen = false
        }
        return "Layers thawed."
      }

      if (actionResult.action === 'layerLock') {
        const names = (actionResult.names as string).split(/[,\s]+/)
        for (const name of names) {
          const layer = this.doc.layers.getLayer(name)
          if (layer) layer.isLocked = true
        }
        return "Layers locked."
      }

      if (actionResult.action === 'layerUnlock') {
        const names = (actionResult.names as string).split(/[,\s]+/)
        for (const name of names) {
          const layer = this.doc.layers.getLayer(name)
          if (layer) layer.isLocked = false
        }
        return "Layers unlocked."
      }

      if (actionResult.action === 'layerColor') {
        const color = actionResult.color as number
        const names = (actionResult.names as string).split(/[,\s]+/)
        for (const name of names) {
          const layer = this.doc.layers.getLayer(name)
          if (layer) layer.color = color
        }
        return `Layer color set to ${color}.`
      }

      if (actionResult.action === 'layerLinetype') {
        const linetype = actionResult.linetype as string
        const names = (actionResult.names as string).split(/[,\s]+/)
        for (const name of names) {
          const layer = this.doc.layers.getLayer(name)
          if (layer) layer.linetype = linetype
        }
        return `Layer linetype set to ${linetype}.`
      }

      if (actionResult.action === 'layerDelete') {
        const names = (actionResult.names as string).split(/[,\s]+/)
        let deleted = 0
        for (const name of names) {
          if (this.doc.layers.deleteLayer(name)) deleted++
        }
        return `Deleted ${deleted} layer(s).`
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

  private addEntity(entity: Entity, recordHistory = true) {
    if (this.doc.getEntity(entity.id)) {
      this.viewer.removeObject(entity.id);
    }

    entity.layer = this.doc.layers.currentLayerName;
    console.log("[ADD ENTITY DEBUG] Setting entity layer to:", this.doc.layers.currentLayerName);

    this.doc.addEntity(entity);
    if (recordHistory) {
      this.doc.recordAdd(entity);
    }
    const layer = entity.layer;
    const layerObj = this.doc.layers.getLayer(layer);
    const isVisible = layerObj ? layerObj.isVisible && !layerObj.isFrozen : true;

    if (entity instanceof Line) {
      this.viewer.addLine(entity.x1, entity.y1, entity.x2, entity.y2, entity.id, layer, isVisible);
    } else if (entity instanceof Circle) {
      this.viewer.addCircle(entity.cx, entity.cy, entity.r, entity.id, layer, isVisible);
    } else if (entity instanceof Arc) {
      this.viewer.addArc(entity.cx, entity.cy, entity.r, entity.startAngle, entity.endAngle, entity.ccw, entity.id, layer, isVisible);
    } else if (entity instanceof Point) {
      this.viewer.addPoint(entity.x, entity.y, entity.id, layer, isVisible);
    } else if (entity instanceof Polyline) {
      this.viewer.addPolyline(entity, layer, isVisible);
    } else if (entity instanceof Text) {
      this.viewer.addText(entity, layer, isVisible);
    } else if (entity instanceof Solid) {
      this.viewer.addSolid(entity, layer, isVisible);
    } else if (entity instanceof Trace) {
      this.viewer.addTrace(entity, layer, isVisible);
    } else if (entity instanceof Shape) {
      this.viewer.addShape(entity, layer, isVisible);
    } else if (entity instanceof Hatch) {
      this.viewer.addHatch(entity, layer, isVisible);
    }
    this.viewer.render();
  }

  private syncFromDocument() {
    this.viewer.clear();
    for (const entity of this.doc.getAllEntities()) {
      this.addEntity(entity, false);
    }
    this.viewer.render();
  }

  private updateLayerVisibility() {
    const layerMap = new Map<string, { isVisible: boolean, isFrozen: boolean }>()
    for (const layer of this.doc.layers.layers.values()) {
      layerMap.set(layer.name, { isVisible: layer.isVisible, isFrozen: layer.isFrozen })
    }
    console.log("[LAYER DEBUG] updateLayerVisibility:", this.getLayerDebugInfo())
    this.viewer.updateLayerVisibility(layerMap)
  }

  private getLayerDebugInfo() {
    const info: string[] = []
    for (const [name, layer] of this.doc.layers.layers) {
      info.push(`${name}(v:${layer.isVisible},f:${layer.isFrozen},l:${layer.isLocked})`)
    }
    return info.join(", ")
  }
}
