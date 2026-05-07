
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
import { Donut } from "./core/model/Donut"
import { Ellipse } from "./core/model/Ellipse"
import { Trace } from "./core/model/Trace"
import { Shape } from "./core/model/Shape"
import { Hatch } from "./core/model/Hatch"
import { Insert } from "./core/model/Insert"
import { FormatUtils } from "./core/engine/FormatUtils"
import { SelectionEngine } from "./core/engine/SelectionEngine"
import { SnapEngine, SnapPoint } from "./core/engine/SnapEngine"
import * as THREE from "three"

import { Layer } from "./core/model/Layer"
import { ResultDispatcher } from "./core/engine/handlers/ResultDispatcher"
import { LayerHandler } from "./core/engine/handlers/LayerHandler"
import { TransformHandler } from "./core/engine/handlers/TransformHandler"
import { ViewHandler } from "./core/engine/handlers/ViewHandler"
import { SystemHandler } from "./core/engine/handlers/SystemHandler"
import { IOHandler } from "./core/engine/handlers/IOHandler"
import { DraftingHandler } from "./core/engine/handlers/DraftingHandler"
import { BlockHandler } from "./core/engine/handlers/BlockHandler"
import { AppContext } from "./core/engine/handlers/types"
import { DraftingState } from "./core/engine/DraftingState"
import { HasBasePoint, HasUpdateSketch, HasStartSketch, HasFinishSketch, HasSelectedIds } from "./core/commands/types"

export class App {
  viewer:Viewer
  cmd:CommandManager
  doc: Document
  drafting: DraftingState
  selectedEntityIds: Set<string> = new Set()
  private selectionStartPoint: { x: number, y: number } | null = null
  private commandLinePrint: ((msg: string) => void) | null = null
  private statusBarUpdate: ((layer: Layer) => void) | null = null
  private dispatcher: ResultDispatcher;

  setCommandLine(printFn: (msg: string) => void) {
    this.commandLinePrint = printFn;
  }

  setStatusBar(updateFn: (layer: Layer) => void) {
    this.statusBarUpdate = updateFn;
    updateFn(this.doc.layers.getCurrentLayer());
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

    this.dispatcher = new ResultDispatcher();
    this.dispatcher.registerHandler(new LayerHandler());
    this.dispatcher.registerHandler(new TransformHandler());
    this.dispatcher.registerHandler(new ViewHandler());
    this.dispatcher.registerHandler(new SystemHandler());
    this.dispatcher.registerHandler(new IOHandler());
    this.dispatcher.registerHandler(new DraftingHandler());
    this.dispatcher.registerHandler(new BlockHandler());

    this.drafting = new DraftingState()
    this.drafting.subscribe(() => {
      this.viewer.updateGrid(this.drafting.gridSpacing, this.drafting.gridEnabled);
      if (this.statusBarUpdate) {
          this.statusBarUpdate(this.doc.layers.getCurrentLayer());
      }
    });
  }

  private getSnappedPoint(worldX: number, worldY: number): { x: number, y: number, snap: SnapPoint | null } {
    const tolerance = 10 / this.viewer.camera.zoom;
    const snap = SnapEngine.getSnapPointSpatial(worldX, worldY, this.doc, tolerance);
    
    let x = snap ? snap.x : worldX;
    let y = snap ? snap.y : worldY;

    // 1. Grid Snap (lower priority than geometric snap)
    if (!snap && this.drafting.snapEnabled) {
        x = Math.round(x / this.drafting.snapSpacing) * this.drafting.snapSpacing;
        y = Math.round(y / this.drafting.snapSpacing) * this.drafting.snapSpacing;
    }

    // 2. Ortho Constraint (lowest priority)
    if (this.drafting.orthoEnabled && this.cmd.active) {
        const basePointCmd = this.cmd.active as unknown as HasBasePoint;
        if (typeof basePointCmd.getBasePoint === 'function') {
            const base = basePointCmd.getBasePoint();
            if (base && this.cmd.active.step && this.cmd.active.step >= 1) {
                const dx = Math.abs(x - base.x);
                const dy = Math.abs(y - base.y);
                if (dx > dy) {
                    y = base.y;
                } else {
                    x = base.x;
                }
            }
        }
    }

    return { x, y, snap };
  }

  private reportSelectionDimensions() {
    if (this.selectedEntityIds.size === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count = 0;

    this.selectedEntityIds.forEach(id => {
      const entity = this.doc.getEntity(id);
      if (entity) {
        const box = entity.getBoundingBox();
        minX = Math.min(minX, box.minX);
        minY = Math.min(minY, box.minY);
        maxX = Math.max(maxX, box.maxX);
        maxY = Math.max(maxY, box.maxY);
        count++;
      }
    });

    if (count > 0 && this.commandLinePrint) {
      const width = maxX - minX;
      const height = maxY - minY;
      this.commandLinePrint(`[Selection] ${count} objects. Width: ${width.toFixed(2)}, Height: ${height.toFixed(2)}`);
    }
  }

  private isEditCommand(name?: string): boolean {
    if (!name) return false;
    const editCommands = ['EraseCommand', 'MoveCommand', 'CopyCommand', 'RotateCommand', 'ScaleCommand', 'MirrorCommand', 'TrimCommand', 'ExtendCommand', 'ArrayCommand', 'OffsetCommand', 'BlockCommand'];
    const cmdName = name.endsWith('Command') ? name : name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() + 'Command';
    return editCommands.includes(cmdName);
  }

  async execute(cmd:string){
    if (cmd === 'PAN' || cmd === 'P') {
      this.viewer.setLeftPanEnabled(true);
    }

    const cmdName = cmd.toUpperCase();
    const isEdit = ['ERASE', 'MOVE', 'COPY', 'ROTATE', 'SCALE', 'MIRROR'].includes(cmdName);
    let selection = Array.from(this.selectedEntityIds);

    if (isEdit) {
      const currentLayer = this.doc.layers.currentLayerName;
      selection = selection.filter(id => {
        const entity = this.doc.getEntity(id);
        return entity && entity.layer === currentLayer;
      });
    }

    const res = this.cmd.execute(cmd, this.doc.units, selection, this.doc.entities);
    return await this.handleResult(res);
  }

  async inputText(text:string){
    // Handle Enter key (empty text) when there are selected entities
    if (text === "" && this.selectedEntityIds.size > 0) {
      const activeName = this.cmd.active?.constructor.name;
      const isEditCommand = this.isEditCommand(activeName);
      
      // Step 0: Initial selection for commands like ERASE, MOVE, ARRAY, etc.
      if (isEditCommand && this.cmd.active && this.cmd.active.step === 0) {
        const currentLayer = this.doc.layers.currentLayerName;
        const ids = Array.from(this.selectedEntityIds).filter(id => {
          const entity = this.doc.getEntity(id);
          return entity && entity.layer === currentLayer;
        });
        const cmdName = activeName?.replace('Command', '').toUpperCase();
        if (cmdName && ids.length > 0) {
          const res = this.cmd.execute(cmdName, this.doc.units, ids, this.doc.entities);
          return await this.handleResult(res);
        }
      }
      
      // Step 2: Object selection for BLOCK command
      if (activeName === 'BlockCommand' && this.cmd.active && this.cmd.active.step === 2) {
          const ids = Array.from(this.selectedEntityIds);
          // We manually feed the IDs to the command
          const blockCmd = this.cmd.active as unknown as HasSelectedIds;
          blockCmd.selectedIds = ids;
          // Trigger finish by passing empty string
          const result = this.cmd.inputString("", this.doc.units, (p) => this.doc.getNextId(p));
          return await this.handleResult(result);
      }
    }
    const result = this.cmd.inputString(text, this.doc.units, (p) => this.doc.getNextId(p))
    return await this.handleResult(result)
  }

  move(screenX: number, screenY: number) {
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
    const { x, y, snap } = snapped;

    this.viewer.setCursor(x, y);
    this.viewer.setSnapMarker(snap);

    if (this.cmd.active) {
        this.viewer.setActivePointMarker(x, y);
    } else {
        this.viewer.setActivePointMarker(null, null);
    }

    const sketchCmd = this.cmd.active as unknown as HasUpdateSketch;
    if (sketchCmd && typeof sketchCmd.updateSketch === 'function') {
      sketchCmd.updateSketch(x, y);
    }

    if (this.selectionStartPoint) {
        this.viewer.setSelectionBox(this.selectionStartPoint, worldPt); // Box selection uses raw mouse
    }

    if (this.cmd.active && this.cmd.active.getPreview) {
      const preview = this.cmd.active.getPreview(worldPt.x, worldPt.y, this.doc.units);
      this.viewer.setPreview(preview);
    } else {
      this.viewer.setPreview(null);
    }

    if (this.cmd.active && this.cmd.active.getReferencePoints) {
      this.viewer.setHelpers(this.cmd.active.getReferencePoints());
    } else {
      this.viewer.setHelpers(null);
    }

    const basePointCmd = this.cmd.active as unknown as HasBasePoint;
    if (basePointCmd && typeof basePointCmd.getBasePoint === 'function') {
      const basePt = basePointCmd.getBasePoint();
      if (basePt && this.cmd.active && this.cmd.active.step && this.cmd.active.step >= 1) {
        this.viewer.setBaseLine(basePt, { x, y });
      } else {
        this.viewer.setBaseLine(null, null);
      }
    } else {
      this.viewer.setBaseLine(null, null);
    }
  }

  pointerDown(screenX: number, screenY: number) {
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
    const { x, y } = snapped;

    const sketchCmd = this.cmd.active as unknown as HasStartSketch;
    if (sketchCmd && typeof sketchCmd.startSketch === 'function') {
      const res = sketchCmd.startSketch(x, y);
      if (res) this.handleResult(res as CommandResponse);
      return;
    }

    this.selectionStartPoint = worldPt;
  }

  async pointerUp(screenX: number, screenY: number): Promise<CommandResponse | undefined> {
    const sketchCmd = this.cmd.active as unknown as HasFinishSketch;
    if (sketchCmd && typeof sketchCmd.finishSketch === 'function') {
      const id = this.doc.getNextId("SK");
      const res = sketchCmd.finishSketch(id);
      if (res) return await this.handleResult(res as CommandResponse);
    }

    if (!this.selectionStartPoint) return;

    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const dx = Math.abs(worldPt.x - this.selectionStartPoint.x);
    const dy = Math.abs(worldPt.y - this.selectionStartPoint.y);
    const tolerance = 5 / this.viewer.camera.zoom;

    const activeName = this.cmd.active?.constructor.name;
    const isEditCommand = this.isEditCommand(activeName);
    const isSelectionStep = !this.cmd.active || 
        (this.cmd.active && this.cmd.active.step === 0 && isEditCommand) ||
        (this.cmd.active && this.cmd.active.step === 1 && (activeName === 'TrimCommand' || activeName === 'ExtendCommand' || activeName === 'OffsetCommand')) ||
        (this.cmd.active && (this.cmd.active.step === 0 || this.cmd.active.step === 1) && activeName === 'FilletCommand') ||
        (this.cmd.active && this.cmd.active.step === 2 && activeName === 'BlockCommand');

    let result: CommandResponse | undefined;

    if (dx < tolerance && dy < tolerance) {
        // Single click
        result = await this.click(screenX, screenY);
    } else if (isSelectionStep) {
        // Box selection only allowed during selection steps
        const isCrossing = worldPt.x < this.selectionStartPoint.x;
        let found: Entity[] = [];
        const currentLayer = this.doc.layers.currentLayerName;
        const selectableEntities = isEditCommand 
          ? this.doc.getAllEntities().filter(e => e.layer === currentLayer)
          : this.doc.getAllEntities();

        if (isCrossing) {
            found = SelectionEngine.getEntitiesInCrossingSpatial(this.selectionStartPoint.x, this.selectionStartPoint.y, worldPt.x, worldPt.y, this.doc, selectableEntities);
        } else {
            found = SelectionEngine.getEntitiesInWindowSpatial(this.selectionStartPoint.x, this.selectionStartPoint.y, worldPt.x, worldPt.y, this.doc, selectableEntities);
        }
        
        found.forEach(e => this.selectedEntityIds.add(e.id));
        this.reportSelectionDimensions();
    }

    this.selectionStartPoint = null;
    this.viewer.setSelectionBox(null);
    this.viewer.setHighlight(Array.from(this.selectedEntityIds));
    
    return result;
  }

  async click(screenX:number, screenY:number){
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
    const { x, y } = snapped;

    // Handle initial selection step for edit commands if clicking an entity
    const activeName = this.cmd.active?.constructor.name;
    const isEditCommand = this.isEditCommand(activeName);
    const isSelectionStep = !this.cmd.active || 
        (this.cmd.active && this.cmd.active.step === 0 && isEditCommand) ||
        (this.cmd.active && this.cmd.active.step === 1 && (activeName === 'TrimCommand' || activeName === 'ExtendCommand' || activeName === 'OffsetCommand')) ||
        (this.cmd.active && (this.cmd.active.step === 0 || this.cmd.active.step === 1) && activeName === 'FilletCommand') ||
        (this.cmd.active && this.cmd.active.step === 2 && activeName === 'BlockCommand');
    let tolerance = 5 / this.viewer.camera.zoom;
    
    if (isSelectionStep) {
        const currentLayer = this.doc.layers.currentLayerName;
        const selectableEntities = isEditCommand 
            ? this.doc.getAllEntities().filter(e => e.layer === currentLayer)
            : this.doc.getAllEntities();

        // Check if clicking near an Ellipse - use larger tolerance for better selection
        const entityType = SelectionEngine.getEntityAtSpatial(worldPt.x, worldPt.y, 200 / this.viewer.camera.zoom, this.doc, selectableEntities)?.constructor.name;
        if (entityType === 'Ellipse') {
            tolerance = 200 / this.viewer.camera.zoom;
            console.log("[TOLERANCE] Using tolerance 200 for Ellipse");
        }

        // Use original raw coordinate for single-click object selection (snapping is for geometry points)
        const entity = SelectionEngine.getEntityAtSpatial(worldPt.x, worldPt.y, tolerance, this.doc, selectableEntities);
        if (entity) {
            if (this.selectedEntityIds.has(entity.id)) {
                this.selectedEntityIds.delete(entity.id);
            } else {
                this.selectedEntityIds.add(entity.id);
            }

            this.reportSelectionDimensions();

            // For commands that pick a target for immediate action (Trim, Extend, Offset at Step 1, Fillet at Step 0/1)
            const activeName = this.cmd.active?.constructor.name;
            const isImmediatePick = (activeName === 'TrimCommand' || activeName === 'ExtendCommand' || activeName === 'OffsetCommand') && this.cmd.active?.step === 1;
            const isFilletPick = activeName === 'FilletCommand' && (this.cmd.active?.step === 0 || this.cmd.active?.step === 1);
            
            console.log("[CLICK DEBUG] activeName:", activeName, "step:", this.cmd.active?.step, "isImmediatePick:", isImmediatePick, "entity:", entity.id);

            if (this.cmd.active && (isImmediatePick || isFilletPick)) {
                const res = await this.cmd.inputString(entity.id, this.doc.units, (p) => this.doc.getNextId(p), { x: worldPt.x, y: worldPt.y });
                console.log("[CLICK DEBUG] inputString result:", res);
                if (res && typeof res === 'object' && ('action' in res) && (res.action === 'trim' || res.action === 'extend' || res.action === 'fillet')) {
                    (res as CommandAction).pickPt = { x: worldPt.x, y: worldPt.y };
                }
                return await this.handleResult(res);
            }
            return;
        }
 else if (!this.cmd.active) {
            this.selectedEntityIds.clear();
        }

        // If there's an active edit command at step 0 and user has selected entities, re-run command with selection
        if (this.cmd.active && this.cmd.active.step === 0 && isEditCommand && this.selectedEntityIds.size > 0) {
            const ids = Array.from(this.selectedEntityIds).filter(id => {
                const e = this.doc.getEntity(id);
                return e && e.layer === currentLayer;
            });
            const cmdName = activeName?.replace('Command', '').toUpperCase();
            if (cmdName && ids.length > 0) {
                const res = this.cmd.execute(cmdName, this.doc.units, ids, this.doc.entities);
                return await this.handleResult(res);
            }
        }
    }

    const result = this.cmd.inputPoint(x, y, this.doc.units, (p) => this.doc.getNextId(p))
    return await this.handleResult(result)
  }

  private async handleResult(result: CommandResponse | undefined): Promise<CommandResponse | undefined> {
    console.log('handleResult called', result);
    if (result && typeof result === 'object') {
      // Case: New Entity Created (Standard or via 'close')
      let entity: Entity | undefined;
      let isCloseAction = false;
      
      if (result instanceof Line || result instanceof Circle || result instanceof Arc || result instanceof Point || result instanceof Polyline || result instanceof Text || result instanceof Solid || result instanceof Donut || result instanceof Ellipse || result instanceof Trace || result instanceof Hatch || result instanceof Shape) {
        entity = result as Entity;
      } else if (result && typeof result === 'object' && 'action' in result && result.action === 'close' && result.entity) {
        entity = result.entity;
        isCloseAction = true;
      }

      if (entity) {
        const activeName = this.cmd.active?.constructor.name;
        const isPolyline = activeName === 'PolylineCommand';
        const isSolid = activeName === 'SolidCommand';
        const isMultiPoint = isPolyline || isSolid;

        // Check if we are updating an existing entity in the same command
        const existing = this.doc.getEntity(entity.id);
        
        // Start transaction only if the entity doesn't exist yet
        if (!existing) {
            this.doc.history.startTransaction();
        }

        // Always record history. addEntity handles recordTransform if existing, or recordAdd if new.
        this.addEntity(entity, true);

        // Commit immediately for standard entities, or at the end of a multi-point command
        if (!isMultiPoint || isCloseAction) {
            this.doc.history.commitTransaction();
        }

        const isContinuous = activeName === 'LineCommand' || activeName === 'PolylineCommand' || activeName === 'SolidCommand' || activeName === 'TraceCommand' || activeName === 'HatchCommand' || activeName === 'LayerCommand' || activeName === 'OffsetCommand' || activeName === 'TrimCommand' || activeName === 'ExtendCommand';

        if (!isContinuous || isCloseAction) {
          this.terminateActiveCommand();
        }

        if (isCloseAction) {
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
          return `${FormatUtils.formatPoint(entity.x2, entity.y2, this.doc.units, "P" + pIdx)}\nLine created. ${FormatUtils.formatDistance(len, this.doc.units)}`;
        }

        if (entity instanceof Polyline) {
          const last = entity.vertices[entity.vertices.length - 1];
          return `${FormatUtils.formatPoint(last.x, last.y, this.doc.units, "P" + entity.vertices.length)}\nPolyline segment added.`;
        }

        return entity;
      }

      // Case: Specialized Actions - Delegate to Dispatcher
      const appContext: AppContext = {
        doc: this.doc,
        viewer: this.viewer,
        cmd: this.cmd,
        drafting: this.drafting,
        selectedEntityIds: this.selectedEntityIds,
        addEntity: (e, rh, ucl) => this.addEntity(e, rh, ucl),
        syncFromDocument: () => this.syncFromDocument(),
        updateLayerVisibility: () => this.updateLayerVisibility(),
        terminateActiveCommand: () => this.terminateActiveCommand(),
        onStatusBarUpdate: (l) => { if (this.statusBarUpdate) this.statusBarUpdate(l); }
      };

      const actionResult = await (async () => {
          this.doc.history.startTransaction();
          const res = await this.dispatcher.dispatch(result as CommandAction, appContext);
          this.doc.history.commitTransaction();
          return res;
      })();

      if (actionResult !== undefined) {
        // If the action resulted in clearing the active command, ensure markers are cleared too
        const activeName = this.cmd.active?.constructor.name;
        const isContinuous = activeName === 'LayerCommand' || activeName === 'OffsetCommand' || activeName === 'TrimCommand' || activeName === 'ExtendCommand'; // Actions that keep command active

        if (!this.cmd.active || (this.cmd.active && !isContinuous)) {
            this.terminateActiveCommand();
        }
        return actionResult;
      }
    }
    return result
  }

  public addEntity(entity: Entity, recordHistory = true, useCurrentLayer = true) {
    const existing = this.doc.getEntity(entity.id);
    if (existing) {
      if (recordHistory) {
        // Record transformation from old state to new state
        this.doc.recordTransform(existing.clone(existing.id), entity);
      }
      this.viewer.removeObject(entity.id);
    } else {
      if (recordHistory) {
        this.doc.recordAdd(entity);
      }
    }

    if (useCurrentLayer) {
      entity.layer = this.doc.layers.currentLayerName;
    }

    this.doc.addEntity(entity);
    const layer = entity.layer;
    const layerObj = this.doc.layers.getLayer(layer);
    const isVisible = layerObj ? layerObj.isVisible && !layerObj.isFrozen : true;

    const layerColor = layerObj ? layerObj.color : 7;
    const linetype = layerObj ? layerObj.linetype : "CONTINUOUS";

    if (entity instanceof Line) {
      this.viewer.addLine(entity.x1, entity.y1, entity.x2, entity.y2, entity.id, layer, layerColor, isVisible, linetype);
    } else if (entity instanceof Circle) {
      this.viewer.addCircle(entity.cx, entity.cy, entity.r, entity.id, layer, layerColor, isVisible, linetype);
    } else if (entity instanceof Arc) {

      this.viewer.addArc(entity.cx, entity.cy, entity.r, entity.startAngle, entity.endAngle, entity.ccw, entity.id, layer, layerColor, isVisible, linetype);
    } else if (entity instanceof Point) {
      this.viewer.addPoint(entity.x, entity.y, entity.id, layer, layerColor, isVisible);
    } else if (entity instanceof Polyline) {
      this.viewer.addPolyline(entity, layer, layerColor, isVisible, linetype);
    } else if (entity instanceof Text) {
      this.viewer.addText(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Solid) {
      this.viewer.addSolid(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Donut) {
      this.viewer.addDonut(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Ellipse) {
      this.viewer.addEllipse(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Trace) {
      this.viewer.addTrace(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Shape) {
      this.viewer.addShape(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Hatch) {
      this.viewer.addHatch(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Insert) {
      const block = this.doc.blocks.getBlock(entity.blockName);
      if (block) {
        // Pass all layer properties for internal entity resolution
        const layerProps = new Map<string, {color: number, linetype: string}>();
        this.doc.layers.listLayers().forEach(l => {
            layerProps.set(l.name, { color: l.color, linetype: l.linetype });
        });
        this.viewer.addInsert(entity, block, layerProps, layer, isVisible);
      }
    }
    this.viewer.render();
  }

  public syncFromDocument() {
    this.viewer.clear();
    for (const entity of this.doc.getAllEntities()) {
      this.addEntity(entity, false, false);
    }
    this.viewer.render();
  }

  public updateLayerVisibility() {
    const layerMap = new Map<string, { isVisible: boolean, isFrozen: boolean }>()
    for (const layer of this.doc.layers.layers.values()) {
      layerMap.set(layer.name, { isVisible: layer.isVisible, isFrozen: layer.isFrozen })
    }
    this.viewer.updateLayerVisibility(layerMap)
  }

  public terminateActiveCommand() {
    this.cmd.clearActive();
    this.doc.history.commitTransaction(); // Commit any dangling transaction (e.g. from PLINE)
    this.viewer.setHelpers(null);
    this.viewer.setPreview(null);
    this.viewer.setActivePointMarker(null, null);
    this.viewer.setBaseLine(null, null);
    this.viewer.clearBoundaryMarkers();
    this.viewer.render();
  }

  private getLayerDebugInfo() {
    const info: string[] = []
    for (const [name, layer] of this.doc.layers.layers) {
      info.push(`${name}(v:${layer.isVisible},f:${layer.isFrozen},l:${layer.isLocked})`)
    }
    return info.join(", ")
  }
}
