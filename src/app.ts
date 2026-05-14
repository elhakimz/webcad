
import { Viewer } from "./render/Viewer"
import { CommandManager } from "./core/engine/CommandManager"
import { Document } from "./core/model/Document"
import { CommandResponse, CommandAction, HasSetEntity } from "./core/commands/types"
import { Entity } from "./core/model/Entity"
import { Line } from "./core/model/Line"
import { Solid3D } from "./core/model/Solid3D"
import { Circle } from "./core/model/Circle"
import { Arc } from "./core/model/Arc"
import { Point } from "./core/model/Point"
import { Polyline } from "./core/model/Polyline"
import { Text } from "./core/model/Text"
import { MText } from "./core/model/MText"
import { Solid } from "./core/model/Solid"
import { Donut } from "./core/model/Donut"
import { Ellipse } from "./core/model/Ellipse"
import { Dimension } from "./core/model/Dimension"
import { Trace } from "./core/model/Trace"
import { Shape } from "./core/model/Shape"
import { Hatch } from "./core/model/Hatch"
import { getAllPatternNames } from "./core/io/Patterns"
import { Insert } from "./core/model/Insert"
import { Spline } from "./core/model/Spline"
import { Note } from "./core/model/Note"
import { FormatUtils } from "./core/engine/FormatUtils"
import { SelectionEngine } from "./core/engine/SelectionEngine"
import { Selection3DEngine } from "./core/engine/Selection3DEngine"
import { SnapEngine, SnapPoint } from "./core/engine/SnapEngine"
import * as THREE from "three"

import { Layer } from "./core/model/Layer"
import { DynamicInput } from "./ui/DynamicInput"
import { ResultDispatcher } from "./core/engine/handlers/ResultDispatcher"
import { LayerHandler } from "./core/engine/handlers/LayerHandler"
import { BooleanHandler } from "./core/engine/handlers/transform/BooleanHandler"
import { ArrayHandler } from "./core/engine/handlers/transform/ArrayHandler"
import { FilletHandler } from "./core/engine/handlers/transform/FilletHandler"
import { SFilletHandler } from "./core/engine/handlers/transform/SFilletHandler"
import { SChamferHandler } from "./core/engine/handlers/transform/SChamferHandler"
import { ShellHandler } from "./core/engine/handlers/transform/ShellHandler"
import { ChamferHandler } from "./core/engine/handlers/transform/ChamferHandler"
import { BreakHandler } from "./core/engine/handlers/transform/BreakHandler"
import { CopyHandler } from "./core/engine/handlers/transform/CopyHandler"
import { JoinHandler } from "./core/engine/handlers/transform/JoinHandler"
import { SweepHandler } from "./core/engine/handlers/transform/SweepHandler"
import { LoftHandler } from "./core/engine/handlers/transform/LoftHandler"
import { LengthenHandler } from "./core/engine/handlers/transform/LengthenHandler"
import { MirrorHandler } from "./core/engine/handlers/transform/MirrorHandler"
import { MoveHandler } from "./core/engine/handlers/transform/MoveHandler"
import { OffsetHandler } from "./core/engine/handlers/transform/OffsetHandler"
import { RotateHandler } from "./core/engine/handlers/transform/RotateHandler"
import { ScaleHandler } from "./core/engine/handlers/transform/ScaleHandler"
import { StretchHandler } from "./core/engine/handlers/transform/StretchHandler"
import { TrimHandler } from "./core/engine/handlers/transform/TrimHandler"
import { ExtendHandler } from "./core/engine/handlers/transform/ExtendHandler"
import { ViewHandler } from "./core/engine/handlers/ViewHandler"
import { SystemHandler } from "./core/engine/handlers/SystemHandler"
import { IOHandler } from "./core/engine/handlers/IOHandler"
import { PlotHandler } from "./core/engine/handlers/PlotHandler"
import { DraftingHandler } from "./core/engine/handlers/DraftingHandler"
import { BlockHandler } from "./core/engine/handlers/BlockHandler"
import { InquiryHandler } from "./core/engine/handlers/InquiryHandler"
import { AppContext } from "./core/engine/handlers/types"
import { DraftingState } from "./core/engine/DraftingState"
import { HasBasePoint, HasUpdateSketch, HasStartSketch, HasFinishSketch, HasSelectedIds } from "./core/commands/types"
import { GizmoManager } from "./core/engine/GizmoManager"
import { PersistenceService } from "./core/persistence/PersistenceService"

export class App {
  viewer:Viewer
  cmd:CommandManager
  doc: Document
  drafting: DraftingState
  selectedEntityIds: Set<string> = new Set()
  selectedEdge: { entityId: string, edgeIndex: number } | null = null;
  selectedFaces: { entityId: string, faceIndex: number }[] = [];
  private selectionStartPoint: { x: number, y: number, screenX?: number, screenY?: number } | null = null;
  private selectionBoxEl: HTMLDivElement | null = null;
  private selectionMode: 'OBJECT' | 'SURFACE' = 'OBJECT';
  private lastWorldPt: { x: number, y: number, z?: number } | null = null;
  private commandLinePrint: ((msg: string) => void) | null = null
  private currentControls: any[] | null | undefined = null;
  private statusBarUpdate: ((layer: Layer) => void) | null = null
  private layersWindowUpdate: (() => void) | null = null
  private promptUpdate: (() => void) | null = null;
  private propertiesWindow: any = null;
  private dispatcher: ResultDispatcher;

  public setPropertiesWindow(pw: any) {
    this.propertiesWindow = pw;
  }
  private lastMode3d: boolean = false;
  currentZ: number = 0;
  public gizmoManager!: GizmoManager;
  public persistence: PersistenceService;

  setPromptUpdate(updateFn: () => void) {
    this.promptUpdate = updateFn;
  }
  private dynamicInput: DynamicInput;

  setLayersWindowUpdate(updateFn: () => void) {
    this.layersWindowUpdate = updateFn;
  }

  triggerLayersWindowUpdate() {
    if (this.layersWindowUpdate) this.layersWindowUpdate();
  }

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
    
    this.gizmoManager = new GizmoManager(this.viewer, this);
    this.viewer.onBeforeRender = () => this.gizmoManager.update();
    this.persistence = PersistenceService.getInstance();

    // Add lighting for 3D meshes
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    const directional = new THREE.DirectionalLight(0xffffff, 1);
    directional.position.set(100, 100, 500);
    this.viewer.scene.add(ambient, directional);

    this.dispatcher = new ResultDispatcher();
    this.dynamicInput = new DynamicInput();
    
    this.dynamicInput.onInputSubmitted(async (text) => {
      const res = await this.inputText(text);
      if (typeof res === 'string' && this.commandLinePrint) {
        this.commandLinePrint(res);
      }
    });
    
    this.dynamicInput.onOptionClicked(async (option) => {
      if (option === "Apply" && this.currentControls) {
        const pattern = this.currentControls.find(c => c.key === 'pattern')?.value;
        const scale = this.currentControls.find(c => c.key === 'scale')?.value;
        
        if (pattern) await this.inputText(pattern);
        if (scale !== undefined) await this.inputText(scale.toString());
        return;
      }
      const res = await this.inputText(option);
      if (typeof res === 'string' && this.commandLinePrint) {
        this.commandLinePrint(res);
      }
    });

    this.dispatcher.registerHandler(new LayerHandler());
    this.dispatcher.registerHandler(new BooleanHandler());
    this.dispatcher.registerHandler(new ArrayHandler());
    this.dispatcher.registerHandler(new FilletHandler());
    this.dispatcher.registerHandler(new SFilletHandler());
    this.dispatcher.registerHandler(new ChamferHandler());
    this.dispatcher.registerHandler(new SChamferHandler());
    this.dispatcher.registerHandler(new ShellHandler());
    this.dispatcher.registerHandler(new BreakHandler());
    this.dispatcher.registerHandler(new CopyHandler());
    this.dispatcher.registerHandler(new JoinHandler());
    this.dispatcher.registerHandler(new SweepHandler());
    this.dispatcher.registerHandler(new LoftHandler());
    this.dispatcher.registerHandler(new LengthenHandler());
    this.dispatcher.registerHandler(new MirrorHandler());
    this.dispatcher.registerHandler(new MoveHandler());
    this.dispatcher.registerHandler(new OffsetHandler());
    this.dispatcher.registerHandler(new RotateHandler());
    this.dispatcher.registerHandler(new ScaleHandler());
    this.dispatcher.registerHandler(new StretchHandler());
    this.dispatcher.registerHandler(new TrimHandler());
    this.dispatcher.registerHandler(new ExtendHandler());
    this.dispatcher.registerHandler(new ViewHandler());
    this.dispatcher.registerHandler(new SystemHandler());
    this.dispatcher.registerHandler(new IOHandler());
    this.dispatcher.registerHandler(new PlotHandler());
    this.dispatcher.registerHandler(new DraftingHandler());
    this.dispatcher.registerHandler(new BlockHandler());
    this.dispatcher.registerHandler(new InquiryHandler());

    this.drafting = new DraftingState()
    this.drafting.subscribe(() => {
      let spacing = this.drafting.gridSpacing;
      if (this.doc.units.type === 'architectural') {
        spacing = spacing * 25.4;
      }
      this.viewer.updateGrid(spacing, this.drafting.gridEnabled);
      
      if (this.drafting.mode3d !== this.lastMode3d) {
        this.viewer.set3DMode(this.drafting.mode3d);
        this.lastMode3d = this.drafting.mode3d;
      }

      if (this.statusBarUpdate) {
          this.statusBarUpdate(this.doc.layers.getCurrentLayer());
      }
    });
  }

  private getSnappedPoint(worldX: number, worldY: number): { x: number, y: number, snap: SnapPoint | null } {
    const tolerance = 10 / this.viewer.camera.zoom;
    
    // Get base point from active command if available for PERPENDICULAR snap
    const basePointCmd = this.cmd.active as unknown as HasBasePoint;
    const base = (typeof basePointCmd?.getBasePoint === 'function') ? basePointCmd.getBasePoint() : null;
    
    const snap = SnapEngine.getSnapPointSpatial(worldX, worldY, this.doc, tolerance);
    
    let x = snap ? snap.x : worldX;
    let y = snap ? snap.y : worldY;

    // 1. Grid Snap (lower priority than geometric snap)
    if (!snap && this.drafting.snapEnabled) {
        let spacing = this.drafting.snapSpacing;
        if (this.doc.units.type === 'architectural') {
          spacing = spacing * 25.4;
        }
        x = Math.round(x / spacing) * spacing;
        y = Math.round(y / spacing) * spacing;
    }

    // 2. Ortho Constraint (lowest priority)
    if (this.drafting.orthoEnabled && this.cmd.active) {
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

    return { x, y, snap };
  }

  private reportSelectionDimensions() {
    if (this.selectedEntityIds.size === 0) return;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let count2D = 0;
    let count3D = 0;

    this.selectedEntityIds.forEach(id => {
      const entity = this.doc.getEntity(id);
      if (entity) {
        const box = entity.getBoundingBox();
        minX = Math.min(minX, box.minX);
        minY = Math.min(minY, box.minY);
        maxX = Math.max(maxX, box.maxX);
        maxY = Math.max(maxY, box.maxY);
        
        if (entity instanceof Solid3D) {
          count3D++;
        } else {
          count2D++;
        }
      }
    });

    const totalCount = count2D + count3D;
    if (totalCount > 0 && this.commandLinePrint) {
      const width = maxX - minX;
      const height = maxY - minY;
      
      const parts = [];
      if (count2D > 0) parts.push(`${count2D} object${count2D > 1 ? 's' : ''}`);
      if (count3D > 0) parts.push(`${count3D} solid${count3D > 1 ? 's' : ''}`);
      
      this.commandLinePrint(`[Selection] ${parts.join(', ')}. Width: ${width.toFixed(2)}, Height: ${height.toFixed(2)}`);
    }
  }

  private isEditCommand(name?: string): boolean {
    if (!name) return false;
    const editCommands = ['EraseCommand', 'MoveCommand', 'CopyCommand', 'RotateCommand', 'ScaleCommand', 'MirrorCommand', 'TrimCommand', 'ExtendCommand', 'ArrayCommand', 'OffsetCommand', 'BlockCommand', 'JoinCommand', 'LengthenCommand'];
    const cmdName = name.endsWith('Command') ? name : name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() + 'Command';
    return editCommands.includes(cmdName);
  }

  private isInSelectionStep(): boolean {
    const activeName = this.cmd.active?.constructor.name;
    const isEditCommand = this.isEditCommand(activeName);
    return !this.cmd.active || 
        (activeName === 'ListCommand') ||
        (this.cmd.active && this.cmd.active.step === 0 && isEditCommand) ||
        (this.cmd.active && (this.cmd.active.step === 0 || this.cmd.active.step === 1) && activeName === 'DimAngularCommand') ||
        (this.cmd.active && this.cmd.active.step === 0 && (activeName === 'DimRadiusCommand' || activeName === 'DimDiameterCommand')) ||
        (this.cmd.active && this.cmd.active.step === 0 && (activeName === 'ExtrudeCommand' || activeName === 'RevolveCommand')) ||
        (this.cmd.active && (this.cmd.active.step === 1 || this.cmd.active.step === 2) && activeName === 'SweepCommand') ||
        (this.cmd.active && 'operation' in this.cmd.active && (this.cmd.active.step === 0 || this.cmd.active.step === 1)) ||
        (this.cmd.active && this.cmd.active.step === 1 && (activeName === 'TrimCommand' || activeName === 'ExtendCommand' || activeName === 'OffsetCommand')) ||

        (this.cmd.active && (this.cmd.active.step === 0 || this.cmd.active.step === 1) && activeName === 'FilletCommand') ||
        (this.cmd.active && (this.cmd.active.step === 0 || this.cmd.active.step === 1) && activeName === 'ChamferCommand') ||
        (this.cmd.active && (this.cmd.active.step === 0 || this.cmd.active.step === 1 || this.cmd.active.step === 2) && activeName === 'BreakCommand') ||
        (this.cmd.active && this.cmd.active.step === 2 && activeName === 'BlockCommand') ||
        (this.cmd.active && this.cmd.active.step === 2 && activeName === 'LengthenCommand');
  }

  private getSelectableEntities(): Entity[] {
    return this.doc.getAllEntities().filter(e => {
      const layer = this.doc.layers.getLayer(e.layer);
      if (!layer) return true;
      if (!layer.isVisible) return false;
      if (layer.isFrozen) return false;
      return true;
    });
  }

  private getSolid3DSelectables(): Solid3D[] {
    return this.getSelectableEntities().filter(e => (e as any).type === "Solid3D" || e instanceof Solid3D) as Solid3D[];
  }

  private getEditableEntities(entities: Entity[]): Entity[] {
    return entities.filter(e => {
      const layer = this.doc.layers.getLayer(e.layer);
      return !layer?.isLocked;
    });
  }

  async execute(cmd:string){
    if (cmd === 'PAN' || cmd === 'P') {
      this.viewer.setLeftPanEnabled(true);
    }

    const cmdName = cmd.toUpperCase();
    const isEdit = ['ERASE', 'MOVE', 'COPY', 'ROTATE', 'SCALE', 'MIRROR'].includes(cmdName);
    let selection = Array.from(this.selectedEntityIds);

    if (isEdit) {
      selection = selection.filter(id => {
        const entity = this.doc.getEntity(id);
        if (!entity) return false;
        const layer = this.doc.layers.getLayer(entity.layer);
        if (!layer) return true;
        return layer.isVisible && !layer.isFrozen && !layer.isLocked;
      });
    }

    const res = this.cmd.execute(cmd, this.doc.units, selection, this.doc.entities);
    return await this.handleResult(res);
  }

  async inputText(text:string){
    const callHandleResult = async (res: any) => {
      const output = await this.handleResult(res);
      if (this.promptUpdate) this.promptUpdate();
      return output;
    }

    // Handle Enter key (empty text) when there are selected entities
    if (text === "" && this.selectedEntityIds.size > 0) {
      const activeName = this.cmd.active?.constructor.name;
      const isEditCommand = this.isEditCommand(activeName);
      
      // Step 0: Initial selection for commands like ERASE, MOVE, ARRAY, etc.
      if (isEditCommand && this.cmd.active && this.cmd.active.step === 0) {
        const ids = Array.from(this.selectedEntityIds).filter(id => {
          const entity = this.doc.getEntity(id);
          if (!entity) return false;
          const layer = this.doc.layers.getLayer(entity.layer);
          if (!layer) return true;
          return layer.isVisible && !layer.isFrozen && !layer.isLocked;
        });
        const cmdName = activeName?.replace('Command', '').toUpperCase();
        if (cmdName && ids.length > 0) {
          const res = this.cmd.execute(cmdName, this.doc.units, ids, this.doc.entities);
          return await callHandleResult(res);
        }
      }
      
      // Step 2: Object selection for BLOCK command
      if (activeName === 'BlockCommand' && this.cmd.active && this.cmd.active.step === 2) {
          const ids = Array.from(this.selectedEntityIds);
          // We manually feed the IDs to the command
          const blockCmd = this.cmd.active as unknown as HasSelectedIds;
          blockCmd.selectedIds = ids;
          // Trigger finish by passing empty string
          const result = this.cmd.inputString("", this.doc.units, (p) => this.doc.getNextId(p), undefined, this.doc);
          return await callHandleResult(result);
      }
    }
    const result = this.cmd.inputString(text, this.doc.units, (p) => this.doc.getNextId(p), this.lastWorldPt || undefined, this.doc)
    return await callHandleResult(result)
  }

  move(screenX: number, screenY: number, ctrlKey = false, shiftKey = false) {
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const actualPt = this.viewer.screenToWorldActual(screenX, screenY);
    const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
    const { x, y, snap } = snapped;
    this.lastWorldPt = { x, y, z: this.currentZ };

    // Determine actual world position of the snapped point
    let worldX = actualPt.x;
    let worldY = actualPt.y;
    let worldZ = actualPt.z;
    
    const pos = this.viewer.camera.position;
    const absX = Math.abs(pos.x);
    const absY = Math.abs(pos.y);
    const absZ = Math.abs(pos.z);
    
    if (absZ > absX && absZ > absY) {
      // TOP or BOTTOM view
      worldX = x;
      worldY = y;
    } else if (absY > absX && absY > absZ) {
      // FRONT or BACK view
      worldX = x;
      worldZ = y; // mapped Y is world Z
    } else if (absX > absY && absX > absZ) {
      // LEFT or RIGHT view
      worldY = x; // mapped X is world Y
      worldZ = y; // mapped Y is world Z
    }

    this.viewer.setCursor(worldX, worldY, worldZ, this.viewer.camera.quaternion);
    this.viewer.setSnapMarker(snap);
    this.viewer.setZPreviewLine(x, y, this.currentZ);

    // Check for hover over selectable objects
    const selectableEntities = this.getSelectableEntities();
    const tolerance = 10 / this.viewer.camera.zoom;
    let hoveredEntity = SelectionEngine.getEntityAtSpatial(worldPt.x, worldPt.y, tolerance, this.doc, selectableEntities);
    
    let subEntity: { entity: Solid3D, faceIndex?: number, edgeIndex?: number } | null = null;
    
    if (hoveredEntity === null) {
        const ndc = this.viewer.getNormalizedDeviceCoordinates(screenX, screenY);
        
        if (ctrlKey && shiftKey) {
          // Face selection mode
          subEntity = Selection3DEngine.getSubEntityAt(ndc, this.viewer.camera, this.viewer.scene, this.doc, this.getSolid3DSelectables(), 'FACE');
          if (subEntity) {
            hoveredEntity = subEntity.entity;
            console.log("[Face Hover] Detected face index:", subEntity.faceIndex);
          }
        } else if (ctrlKey) {
          // Edge selection mode
          subEntity = Selection3DEngine.getSubEntityAt(ndc, this.viewer.camera, this.viewer.scene, this.doc, this.getSolid3DSelectables(), 'EDGE');
          if (subEntity) {
            hoveredEntity = subEntity.entity;
            console.log("[Edge Hover] Detected edge index:", subEntity.edgeIndex);
          }
        } else {
          hoveredEntity = Selection3DEngine.getHoveredSolid3D(
              ndc,
              this.viewer.camera,
              this.viewer.scene,
              this.doc,
              this.getSolid3DSelectables()
          );
        }
    }
    
    const isEdgeHover = !!(subEntity && subEntity.edgeIndex !== undefined);
    this.viewer.setCursorHover(!!hoveredEntity, isEdgeHover);
    
    // Clear highlights first for visible solids
    const allSolids = this.getSolid3DSelectables() as Solid3D[];
    allSolids.forEach(s => {
      this.viewer.highlightFace(s.id, null);
      this.viewer.highlightEdge(s.id, null);
    });

    if (subEntity) {
      if (subEntity.faceIndex !== undefined) {
        this.viewer.highlightFace(subEntity.entity.id, subEntity.faceIndex);
      } else if (subEntity.edgeIndex !== undefined) {
        this.viewer.highlightEdge(subEntity.entity.id, subEntity.edgeIndex);
      }
    }

    // Re-apply selected edge LAST so it always wins over hover resets
    if (this.selectedEdge) {
      this.viewer.highlightEdge(this.selectedEdge.entityId, this.selectedEdge.edgeIndex);
    }

    if (this.cmd.active) {
        this.viewer.setActivePointMarker(worldX, worldY, worldZ, this.viewer.camera.quaternion);
    } else {
        this.viewer.setActivePointMarker(null, null);
    }

    const sketchCmd = this.cmd.active as unknown as HasUpdateSketch;
    if (sketchCmd && typeof sketchCmd.updateSketch === 'function') {
      sketchCmd.updateSketch(x, y);
    }

    if (this.selectionStartPoint) {
        if (!this.selectionBoxEl) {
            this.selectionBoxEl = document.createElement('div');
            this.selectionBoxEl.style.position = 'absolute';
            this.selectionBoxEl.style.pointerEvents = 'none';
            this.selectionBoxEl.style.zIndex = '1000'; // Ensure it's on top
            document.body.appendChild(this.selectionBoxEl);
        }
        
        const x1 = this.selectionStartPoint.screenX !== undefined ? this.selectionStartPoint.screenX : screenX;
        const y1 = this.selectionStartPoint.screenY !== undefined ? this.selectionStartPoint.screenY : screenY;
        const x2 = screenX;
        const y2 = screenY;
        
        const minX = Math.min(x1, x2);
        const maxX = Math.max(x1, x2);
        const minY = Math.min(y1, y2);
        const maxY = Math.max(y1, y2);
        
        this.selectionBoxEl.style.left = `${minX}px`;
        this.selectionBoxEl.style.top = `${minY}px`;
        this.selectionBoxEl.style.width = `${maxX - minX}px`;
        this.selectionBoxEl.style.height = `${maxY - minY}px`;
        
        const isCrossing = worldPt.x < this.selectionStartPoint.x;
        if (isCrossing) {
            this.selectionBoxEl.style.border = '1px dashed #55ff55';
            this.selectionBoxEl.style.backgroundColor = 'rgba(0, 255, 0, 0.15)';
        } else {
            this.selectionBoxEl.style.border = '1px solid #5555ff';
            this.selectionBoxEl.style.backgroundColor = 'rgba(0, 0, 255, 0.15)';
        }
    }

    if (this.cmd.active && this.cmd.active.getPreview) {
      const preview = this.cmd.active.getPreview(worldPt.x, worldPt.y, this.doc.units);
      this.viewer.setPreview(preview, this.doc.units);
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

    if (this.cmd.active && this.cmd.active.getDynamicInput) {
      const lines = this.cmd.active.getDynamicInput(x, y, this.doc.units);
      if (lines) {
        const options = this.cmd.active.getOptions ? this.cmd.active.getOptions(this.doc.units) : [];
        const cmdName = this.cmd.active.constructor.name;
        const lastLine = lines[lines.length - 1];
        const needsInput = !!(lastLine && lastLine.includes("(enter value)"));
        const isSolidCmd = ['BoxCommand', 'CylinderCommand', 'ConeCommand', 'SphereCommand'].includes(cmdName);
        
        const showInput = isSolidCmd ? needsInput : !['LineCommand', 'CircleCommand', 'ArcCommand', 'EllipseCommand', 'HatchCommand', 'RectangCommand'].includes(cmdName);
        
        let controls: any[] | undefined = undefined;
        if (cmdName === 'HatchCommand') {
          const hatchCmd = this.cmd.active as any;
          if (hatchCmd.step < 3) {
            controls = [
              { type: 'select', label: 'Pattern', key: 'pattern', value: hatchCmd.pattern, options: getAllPatternNames(), onChange: (val: string) => { hatchCmd.pattern = val; } },
              { type: 'number', label: 'Scale', key: 'scale', value: hatchCmd.scale, onChange: (val: number) => { hatchCmd.scale = val; } }
            ];
            if (!options.includes('Apply')) {
              options.push('Apply');
            }
          }
        }
        this.currentControls = controls;
        
        let footer: string | undefined = undefined;
        if (cmdName === 'HatchCommand') {
          footer = "Esc to end hatch command";
        }
        
        this.dynamicInput.show(screenX, screenY, lines, options, showInput, controls, footer);
      } else {
        this.dynamicInput.hide();
      }
    } else {
      this.dynamicInput.hide();
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

    this.selectionStartPoint = { x: worldPt.x, y: worldPt.y, screenX, screenY };
  }

  async pointerUp(screenX: number, screenY: number, isShift = false, isCtrl = false): Promise<CommandResponse | undefined> {
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

    const isSelectionStep = this.isInSelectionStep();

    let result: CommandResponse | undefined;

    if (dx < tolerance && dy < tolerance) {
        // Single click
        result = await this.click(screenX, screenY, isShift, isCtrl);
    } else if (isSelectionStep) {
        // Box selection only allowed during selection steps
        const isCrossing = worldPt.x < this.selectionStartPoint.x;
        let found: Entity[] = [];
        const selectableEntities = this.getSelectableEntities();

        let entities2D: Entity[] = [];
        let entities3D: Entity[] = [];
        const screenX1 = this.selectionStartPoint.screenX !== undefined ? this.selectionStartPoint.screenX : screenX;
        const screenY1 = this.selectionStartPoint.screenY !== undefined ? this.selectionStartPoint.screenY : screenY;
        const ndc1 = this.viewer.getNormalizedDeviceCoordinates(screenX1, screenY1);
        const ndc2 = this.viewer.getNormalizedDeviceCoordinates(screenX, screenY);

        if (isCrossing) {
            entities2D = SelectionEngine.getEntitiesInCrossingSpatial(this.selectionStartPoint.x, this.selectionStartPoint.y, worldPt.x, worldPt.y, this.doc, selectableEntities);
            entities3D = Selection3DEngine.getSolid3DsInCrossing(ndc1, ndc2, this.viewer.camera, this.getSolid3DSelectables());
        } else {
            entities2D = SelectionEngine.getEntitiesInWindowSpatial(this.selectionStartPoint.x, this.selectionStartPoint.y, worldPt.x, worldPt.y, this.doc, selectableEntities);
            entities3D = Selection3DEngine.getSolid3DsInWindow(ndc1, ndc2, this.viewer.camera, this.getSolid3DSelectables());
        }
        found = [...entities2D, ...entities3D].filter((e, i, arr) => arr.findIndex(x => x.id === e.id) === i);
        
        for (const e of found) {
            if (!isCtrl) {
                this.selectedEntityIds.add(e.id);
            }
            if (this.cmd.active) {
                if ('setEntity' in this.cmd.active) {
                    (this.cmd.active as unknown as HasSetEntity).setEntity(e);
                }
                const res = await this.cmd.inputString(e.id, this.doc.units);
                if (res) result = res;
            }
        }
        this.reportSelectionDimensions();
    }

    this.selectionStartPoint = null;
    if (this.selectionBoxEl) {
        document.body.removeChild(this.selectionBoxEl);
        this.selectionBoxEl = null;
    }
    this.viewer.setHighlight(Array.from(this.selectedEntityIds));
    
    if (this.propertiesWindow) {
        const selectedEntities = Array.from(this.selectedEntityIds)
            .map(id => this.doc.getEntity(id))
            .filter((e): e is Entity => e !== undefined);
        this.propertiesWindow.update(selectedEntities);
    }
    
    // Attach/detach gizmo based on selection
    if (this.selectedEntityIds.size === 1 && !isCtrl) {
      const id = Array.from(this.selectedEntityIds)[0];
      const entity = this.doc.getEntity(id);
      if (entity instanceof Solid3D) {
        let obj = this.viewer.scene.getObjectByName(id);
        if (!obj) {
          // Fallback: traverse scene to find object with matching name
          this.viewer.scene.traverse(child => {
            if (child.name === id) obj = child;
          });
        }
        
        // If the found object is a child of a group with the same name,
        // use the parent group so that Gizmo reads the correct world position!
        if (obj && obj.parent && obj.parent.name === id) {
          obj = obj.parent;
        }
        
        console.log("Gizmo attachment - entity id:", id, "found obj:", obj);
        
        if (obj) {
          this.gizmoManager.attachToObject(obj, entity);
        } else {
          this.gizmoManager.detach();
        }
      } else {
        this.gizmoManager.detach();
      }
    } else {
      this.gizmoManager.detach();
    }
    
    return result;
  }

  async click(screenX:number, screenY:number, isShift = false, isCtrl = false){
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    if (isCtrl) {
        console.log(`[app.click] Ctrl+Click detected. Mode: ${isShift ? 'FACE' : 'EDGE'}`);
        const ndc = this.viewer.getNormalizedDeviceCoordinates(screenX, screenY);
        const subEntity = Selection3DEngine.getSubEntityAt(ndc, this.viewer.camera, this.viewer.scene, this.doc, this.getSolid3DSelectables(), isShift ? 'FACE' : 'EDGE');
        console.log(`[app.click] getSubEntityAt result:`, subEntity);
        
        if (subEntity) {
          if (subEntity.edgeIndex !== undefined) {
            this.selectedEdge = { entityId: subEntity.entity.id, edgeIndex: subEntity.edgeIndex };
            this.viewer.highlightEdge(subEntity.entity.id, subEntity.edgeIndex);
            
            const text = `EDGE:${subEntity.entity.id}:${subEntity.edgeIndex}`;
            const res = await this.cmd.inputString(text, this.doc.units, (p) => this.doc.getNextId(p), { x: worldPt.x, y: worldPt.y }, this.doc);
            await this.handleResult(res);
            
            // Get coordinates and paint it
            if (subEntity.entity.edgeLines) {
              const edgePoints = subEntity.entity.edgeLines[subEntity.edgeIndex];
              if (edgePoints && edgePoints.length >= 6) {
                const p1 = { x: edgePoints[0], y: edgePoints[1], z: edgePoints[2] };
                const p2 = { x: edgePoints[edgePoints.length-3], y: edgePoints[edgePoints.length-2], z: edgePoints[edgePoints.length-1] };
                
                console.log(`[app.click] Found edge: ${subEntity.edgeIndex}`);
                console.log(`[app.click] p1: [${p1.x.toFixed(3)}, ${p1.y.toFixed(3)}, ${p1.z.toFixed(3)}]`);
                console.log(`[app.click] p2: [${p2.x.toFixed(3)}, ${p2.y.toFixed(3)}, ${p2.z.toFixed(3)}]`);
                
                this.viewer.drawDebugLine(p1, p2, 0xffa500);
              }
            }
          } else if (subEntity.faceIndex !== undefined) {
            this.selectedFaces.push({ entityId: subEntity.entity.id, faceIndex: subEntity.faceIndex });
            
            const text = `FACE:${subEntity.entity.id}:${subEntity.faceIndex}`;
            const res = await this.cmd.inputString(text, this.doc.units, (p) => this.doc.getNextId(p), { x: worldPt.x, y: worldPt.y }, this.doc);
            await this.handleResult(res);
            
            if (this.selectedFaces.length > 2) {
              this.selectedFaces.shift();
            }
            
            console.log(`[app.click] Selected faces:`, this.selectedFaces);
            
            // Highlight the clicked face
            this.viewer.highlightFace(subEntity.entity.id, subEntity.faceIndex);
            
            if (this.selectedFaces.length === 2) {
              const f1 = this.selectedFaces[0];
              const f2 = this.selectedFaces[1];
              if (f1.entityId === f2.entityId) {
                 const sharedEdgeResult = Selection3DEngine.getSharedEdge(subEntity.entity, f1.faceIndex, f2.faceIndex);
                 if (sharedEdgeResult !== null) {
                   this.selectedEdge = { entityId: f1.entityId, edgeIndex: sharedEdgeResult.edgeIndex };
                   this.viewer.highlightEdge(f1.entityId, sharedEdgeResult.edgeIndex);
                   console.log(`[app.click] Found shared edge: ${sharedEdgeResult.edgeIndex}`);
                   console.log(`[app.click] p1: [${sharedEdgeResult.p1.x.toFixed(3)}, ${sharedEdgeResult.p1.y.toFixed(3)}, ${sharedEdgeResult.p1.z.toFixed(3)}]`);
                   console.log(`[app.click] p2: [${sharedEdgeResult.p2.x.toFixed(3)}, ${sharedEdgeResult.p2.y.toFixed(3)}, ${sharedEdgeResult.p2.z.toFixed(3)}]`);
                   // Paint the line across those coords
                   this.viewer.drawDebugLine(sharedEdgeResult.p1, sharedEdgeResult.p2, 0xffa500);
                  
                  // Clear face highlights
                  this.viewer.highlightFace(f1.entityId, null);
                  
                  this.selectedFaces = []; // Clear for next pair
                } else {
                  console.log(`[app.click] No shared edge between face ${f1.faceIndex} and ${f2.faceIndex}`);
                }
              } else {
                console.log(`[app.click] Faces belong to different entities`);
              }
            }
          }
        }
    }
    const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
    const { x, y } = snapped;

    // Handle initial selection step for edit commands if clicking an entity
    const activeName = this.cmd.active?.constructor.name;
    const isEditCommand = this.isEditCommand(activeName);
    const isSelectionStep = this.isInSelectionStep();
    let tolerance = 5 / this.viewer.camera.zoom;
    
    if (isSelectionStep) {
        const selectableEntities = this.getSelectableEntities();

        // Check if clicking near an Ellipse - use larger tolerance for better selection
        const entityType = SelectionEngine.getEntityAtSpatial(worldPt.x, worldPt.y, 200 / this.viewer.camera.zoom, this.doc, selectableEntities)?.constructor.name;
        if (entityType === 'Ellipse') {
            tolerance = 200 / this.viewer.camera.zoom;
        }

        let entity = SelectionEngine.getEntityAtSpatial(worldPt.x, worldPt.y, tolerance, this.doc, selectableEntities);
        if (entity === null) {
            const ndc = this.viewer.getNormalizedDeviceCoordinates(screenX, screenY);
            const solid3D = Selection3DEngine.getSolid3DAtCycling(
                ndc,
                worldPt.x, worldPt.y,
                this.viewer.camera,
                this.viewer.scene,
                this.doc,
                this.getSolid3DSelectables()
            );
            if (solid3D) entity = solid3D;
        }

        if (entity) {
            if (!isCtrl) {
                this.selectedEdge = null; // Clear edge selection on standard click
                if (isShift) {
                    if (entity instanceof Solid3D && this.selectionMode === 'OBJECT') {
                        const allSolids = this.getSolid3DSelectables().filter((e): e is Solid3D => e instanceof Solid3D);
                        const connected = Selection3DEngine.getConnectedSolid3Ds(entity, allSolids);
                        const anySelected = connected.some(s => this.selectedEntityIds.has(s.id));
                        
                        if (anySelected) {
                            connected.forEach(s => this.selectedEntityIds.delete(s.id));
                        } else {
                            connected.forEach(s => this.selectedEntityIds.add(s.id));
                        }
                    } else {
                        if (this.selectedEntityIds.has(entity.id)) {
                            this.selectedEntityIds.delete(entity.id);
                        } else {
                            this.selectedEntityIds.add(entity.id);
                        }
                    }
                } else {
                    this.selectedEntityIds.clear();
                    if (entity instanceof Solid3D && this.selectionMode === 'OBJECT') {
                        const allSolids = this.getSolid3DSelectables().filter((e): e is Solid3D => e instanceof Solid3D);
                        const connected = Selection3DEngine.getConnectedSolid3Ds(entity, allSolids);
                        connected.forEach(s => this.selectedEntityIds.add(s.id));
                    } else {
                        this.selectedEntityIds.add(entity.id);
                    }
                }
            }

            this.reportSelectionDimensions();

            // For commands that pick a target for immediate action (Trim, Extend, Offset at Step 1, Fillet at Step 0/1, Lengthen at Step 2)       
            const isImmediatePick = (activeName === 'TrimCommand' || activeName === 'ExtendCommand' || activeName === 'OffsetCommand') && this.cmd.active?.step === 1;
            const isFilletPick = activeName === 'FilletCommand' && (this.cmd.active?.step === 0 || this.cmd.active?.step === 1);
            const isChamferPick = activeName === 'ChamferCommand' && (this.cmd.active?.step === 0 || this.cmd.active?.step === 1);
            const isBreakPick = activeName === 'BreakCommand' && (this.cmd.active?.step === 0 || this.cmd.active?.step === 1 || this.cmd.active?.step === 2);
            const isLengthenPick = activeName === 'LengthenCommand' && this.cmd.active?.step === 2;
            const isDimRadiusPick = (activeName === 'DimRadiusCommand' || activeName === 'DimDiameterCommand') && this.cmd.active?.step === 0;
            const isDimAngularPick = activeName === 'DimAngularCommand' && (this.cmd.active?.step === 0 || this.cmd.active?.step === 1);
            const isListPick = activeName === 'ListCommand';
            const isBooleanPick = this.cmd.active && 'operation' in this.cmd.active && (this.cmd.active.step === 0 || this.cmd.active.step === 1);
            const hasSetEntity = this.cmd.active && 'setEntity' in this.cmd.active;

            if (this.cmd.active && (hasSetEntity || isImmediatePick || isFilletPick || isChamferPick || isBreakPick || isLengthenPick || isBooleanPick)) {       
                if (hasSetEntity) {
                  (this.cmd.active as unknown as any).setEntity(entity);
                }
                const res = await this.cmd.inputString(entity.id, this.doc.units, (p) => this.doc.getNextId(p), { x: worldPt.x, y: worldPt.y }, this.doc);

                if (res && typeof res === 'object' && ('action' in res) && (res.action === 'trim' || res.action === 'extend' || res.action === 'fillet' || res.action === 'chamfer' || res.action === 'break' || res.action === 'lengthen')) {
                    (res as CommandAction).pickPt = { x: worldPt.x, y: worldPt.y };
                }
                return await this.handleResult(res);
            }
            return;
        } else if (!isShift) {
            this.selectedEntityIds.clear();
            this.selectedEdge = null; // Clear edge selection on empty space click
        }

        // If there's an active edit command at step 0 and user has selected entities, re-run command with selection
        if (this.cmd.active && this.cmd.active.step === 0 && isEditCommand && this.selectedEntityIds.size > 0) {
            const ids = Array.from(this.selectedEntityIds).filter(id => {
                const e = this.doc.getEntity(id);
                if (!e) return false;
                const layer = this.doc.layers.getLayer(e.layer);
                if (!layer) return true;
                return layer.isVisible && !layer.isFrozen && !layer.isLocked;
            });
            const cmdName = activeName?.replace('Command', '').toUpperCase();
            if (cmdName && ids.length > 0) {
                const res = this.cmd.execute(cmdName, this.doc.units, ids, this.doc.entities);
                return await this.handleResult(res);
            }
        }
    }

    const result = this.cmd.inputPoint(x, y, this.doc.units, (p) => this.doc.getNextId(p), this.doc, this.currentZ)
    return await this.handleResult(result)
  }

  private async handleResult(result: CommandResponse | Promise<CommandResponse> | undefined): Promise<CommandResponse | undefined> {
    result = await result;
    if (result && typeof result === 'object') {
      // Handle tagged responses
      if ('type' in result) {
        const tagged = result as any;
        if (tagged.type === 'prompt') {
          return tagged.text;
        } else if (tagged.type === 'entity') {
          result = tagged.entity;
        } else if (tagged.type === 'action') {
          const { type, ...action } = tagged;
          result = action;
        }
      }

      // Case: New Entity Created (Standard or via 'close')
      let entity: Entity | undefined;
      let isCloseAction = false;
      
      if (result && (result instanceof Line || result instanceof Circle || result instanceof Arc || result instanceof Point || result instanceof Polyline || result instanceof Text || result instanceof MText || result instanceof Solid || result instanceof Donut || result instanceof Ellipse || result instanceof Dimension || result instanceof Trace || result instanceof Hatch || result instanceof Shape || result instanceof Spline || result instanceof Note || (result as any).type === "Solid3D" || result instanceof Solid3D)) {
        entity = result as Entity;
      } else if (result && typeof result === 'object' && 'action' in result && result.action === 'close') {
        if (result.entity) {
          entity = result.entity;
        }
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
        if (entity instanceof Spline) {
          return `Spline created with ${entity.controlPoints.length} control points.`;
        }

        if (entity instanceof Polyline) {
          const last = entity.vertices[entity.vertices.length - 1];
          return `${FormatUtils.formatPoint(last.x, last.y, this.doc.units, "P" + entity.vertices.length)}\nPolyline segment added.`;
        }

        if (entity.constructor.name === "Solid3D" || entity instanceof Solid3D) {
          return `3D Solid created.`;
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
        onStatusBarUpdate: (l) => { if (this.statusBarUpdate) this.statusBarUpdate(l); },
        onLayersChange: () => { if (this.layersWindowUpdate) this.layersWindowUpdate(); }
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
        const isContinuous = activeName === 'LayerCommand' || activeName === 'OffsetCommand' || activeName === 'TrimCommand' || activeName === 'ExtendCommand' || activeName === 'LengthenCommand'; // Actions that keep command active

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
    this.persistence.scheduleAutoSave(
      this.doc,
      () => this.viewer.canvas.toDataURL('image/jpeg', 0.5)
    );
    const layer = entity.layer;
    const layerObj = this.doc.layers.getLayer(layer);
    const isVisible = layerObj ? layerObj.isVisible && !layerObj.isFrozen : true;

    const layerColor = layerObj ? layerObj.color : 7;
    const linetype = layerObj ? layerObj.linetype : "CONTINUOUS";

    if (entity instanceof Line) {
      this.viewer.addLine(entity.x1, entity.y1, entity.x2, entity.y2, entity.id, layer, layerColor, isVisible, linetype, entity.elevation, entity.thickness);
    } else if (entity instanceof Circle) {
      this.viewer.addCircle(entity.cx, entity.cy, entity.r, entity.id, layer, layerColor, isVisible, linetype, entity.elevation, entity.thickness);
    } else if (entity instanceof Arc) {

      this.viewer.addArc(entity.cx, entity.cy, entity.r, entity.startAngle, entity.endAngle, entity.ccw, entity.id, layer, layerColor, isVisible, linetype, entity.elevation, entity.thickness);
    } else if (entity instanceof Point) {
      this.viewer.addPoint(entity.x, entity.y, entity.id, layer, layerColor, isVisible, entity.elevation, entity.thickness);
    } else if (entity instanceof Polyline) {
      this.viewer.addPolyline(entity, layer, layerColor, isVisible, linetype);
    } else if (entity instanceof Text) {
      this.viewer.addText(entity, layer, layerColor, isVisible);
    } else if (entity instanceof MText) {
      this.viewer.addMText(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Solid) {
      this.viewer.addSolid(entity, layer, layerColor, isVisible);
    } else if ((entity as any).type === "Solid3D" || entity instanceof Solid3D) {
      this.viewer.addSolid3D(entity as Solid3D, layer, layerColor, isVisible);
    } else if (entity instanceof Donut) {
      this.viewer.addDonut(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Spline) {
      this.viewer.addSpline(entity, layer, layerColor, isVisible, linetype);
    } else if (entity instanceof Ellipse) {
      this.viewer.addEllipse(entity, layer, layerColor, isVisible);
    } else if (entity instanceof Dimension) {
      this.viewer.addDimension(entity, this.doc.units, layer, layerColor, isVisible);
    } else if (entity instanceof Note) {
      this.viewer.addNote(entity, layer, layerColor, isVisible);
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
    
    if (this.propertiesWindow) {
      const selectedEntities = Array.from(this.selectedEntityIds)
          .map(id => this.doc.getEntity(id))
          .filter((e): e is Entity => e !== undefined);
      this.propertiesWindow.update(selectedEntities);
    }
  }

  public updatePropertiesWindow() {
    if (this.propertiesWindow) {
      const selectedEntities = Array.from(this.selectedEntityIds)
          .map(id => this.doc.getEntity(id))
          .filter((e): e is Entity => e !== undefined);
      this.propertiesWindow.update(selectedEntities);
    }
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
