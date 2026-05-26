
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
import { solveDocumentConstraints, DocumentConstraint, DocumentPointRef, getPointCoords } from "./core/engine/SketchSolver"
import { analyzeDocumentDoF } from "./core/engine/DocumentDoFAnalyzer"
import { FormatUtils } from "./core/engine/FormatUtils"
import { Note } from "./core/model/Note"
import { SelectionEngine } from "./core/engine/SelectionEngine"
import { Selection3DEngine } from "./core/engine/Selection3DEngine"
import {SnapEngine, SnapPoint, SnapType} from "./core/engine/SnapEngine"
import {getLineLineIntersectionInfinite} from "./core/engine/MathUtils"
import * as THREE from "three"

import { Layer } from "./core/model/Layer"
import { DynamicInput } from "./ui/DynamicInput"
import { DynamicMenu } from "./ui/DynamicMenu"
import { ResultDispatcher } from "./core/engine/handlers/ResultDispatcher"
import { GeneratorHandler } from "./core/engine/handlers/GeneratorHandler"
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
import { OpenCascadeService } from "./core/io/OpenCascadeService"
import { NotificationManager } from "./ui/NotificationManager"

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
  private objectsWindowUpdate: (() => void) | null = null
  private filesWindowUpdate: (() => void) | null = null
  private promptUpdate: (() => void) | null = null;
  public propertiesWindow: any = null;
  public sketchToolWindow: any = null;
  private dispatcher: ResultDispatcher;
  public activeGrip: { entityId: string, gripId: string, startPoint: { x: number, y: number } } | null = null;
  public activeCenterGrip: { center: {x: number, y: number}, mode: 'move'|'scale'|'rotate', startMouse: {x: number, y: number}, startScreenMouse: {x: number, y: number}, originalEntities: import('./core/model/Entity').Entity[] } | null = null;
  public setPropertiesWindow(pw: any) {
    this.propertiesWindow = pw;
  }
  public setSketchToolWindow(stw: any) {
    this.sketchToolWindow = stw;
  }
  private lastMode3d: boolean = false;
  currentZ: number = 0;
  public gizmoManager!: GizmoManager;
  public persistence: PersistenceService;

  setPromptUpdate(updateFn: () => void) {
    this.promptUpdate = updateFn;
  }
  private dynamicInput: DynamicInput;
  private dynamicMenu: DynamicMenu;
  private lastScreenX: number = 0;
  private lastScreenY: number = 0;
  public contextMenuVisible: boolean = false;

  setLayersWindowUpdate(updateFn: () => void) {
    this.layersWindowUpdate = updateFn;
  }

  triggerLayersWindowUpdate() {
    if (this.layersWindowUpdate) this.layersWindowUpdate();
  }

  setObjectsWindowUpdate(updateFn: () => void) {
    this.objectsWindowUpdate = updateFn;
  }

  triggerObjectsWindowUpdate() {
    if (this.objectsWindowUpdate) this.objectsWindowUpdate();
  }

  setFilesWindowUpdate(updateFn: () => void) {
    this.filesWindowUpdate = updateFn;
  }

  triggerFilesWindowUpdate() {
    if (this.filesWindowUpdate) this.filesWindowUpdate();
  }

  setCommandLine(printFn: (msg: string) => void) {
    this.commandLinePrint = printFn;
  }

  printToCommandLine(msg: string) {
    if (this.commandLinePrint) {
      this.commandLinePrint(msg);
    }
  }

  setStatusBar(updateFn: (layer: Layer) => void) {
    this.statusBarUpdate = updateFn;
    updateFn(this.doc.layers.getCurrentLayer());
  }

  constructor(viewer:Viewer){
    this.viewer = viewer
    this.cmd = new CommandManager()
    this.doc = new Document()
    
    this.viewer.getBlockCallback = (blockName: string) => this.doc.blocks.getBlock(blockName) || null;
    this.viewer.getLayerPropertiesCallback = () => {
      const layerProps = new Map<string, {color: number, linetype: string}>();
      this.doc.layers.listLayers().forEach(l => {
          layerProps.set(l.name, { color: l.color, linetype: l.linetype });
      });
      return layerProps;
    };
    
    this.gizmoManager = new GizmoManager(this.viewer, this);
    this.viewer.onBeforeRender = () => this.gizmoManager.update();
    this.persistence = PersistenceService.getInstance();
    
    // Wire up error reporting from OCC and Persistence services to the command line log
    OpenCascadeService.getInstance().onError((msg: string) => {
      if (this.commandLinePrint) this.commandLinePrint(msg);
    });
    this.persistence.setOnErrorMessage((msg: string) => {
      if (this.commandLinePrint) this.commandLinePrint(msg);
    });

    // Add lighting for 3D meshes
    const ambient = new THREE.HemisphereLight(0xffffff, 0x888888, 1.1); // Much brighter ambient to wash out shadows
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.7); // Stronger fill light from opposite side
    fillLight.position.set(-200, -100, -100);
    this.viewer.scene.add(fillLight);
    const camLight = new THREE.PointLight(0xffffff, 0.8, 0, 0.5); // Point light attached to camera
    this.viewer.camera.add(camLight);
    this.viewer.scene.add(this.viewer.camera);
    
    this.viewer.directionalLight = new THREE.DirectionalLight(0xffffff, 0.8); // Softer main light to reduce shadow contrast
    this.viewer.directionalLight.position.set(200, 400, 500);
    this.viewer.directionalLight.castShadow = true;
    this.viewer.directionalLight.shadow.mapSize.width = 2048;
    this.viewer.directionalLight.shadow.mapSize.height = 2048;
    this.viewer.directionalLight.shadow.camera.near = 0.5;
    this.viewer.directionalLight.shadow.camera.far = 2000;
    const d = 500;
    this.viewer.directionalLight.shadow.camera.left = -d;
    this.viewer.directionalLight.shadow.camera.right = d;
    this.viewer.directionalLight.shadow.camera.top = d;
    this.viewer.directionalLight.shadow.camera.bottom = -d;
    
    this.viewer.scene.add(ambient, this.viewer.directionalLight);

    this.dispatcher = new ResultDispatcher();
    this.dynamicInput = new DynamicInput();
    this.dynamicMenu = new DynamicMenu();
    
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
    this.dispatcher.registerHandler(new GeneratorHandler());
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
    
    let snap = SnapEngine.getSnapPointSpatial(worldX, worldY, this.doc, tolerance);
    
    if (!snap && this.selectedEntityIds.size > 0 && !this.cmd.active) {
      const center = this.viewer.getCenterOfObjects(Array.from(this.selectedEntityIds));
      if (center) {
        const dist = Math.sqrt((worldX - center.x) ** 2 + (worldY - center.y) ** 2);
        if (dist <= tolerance) {
          snap = { x: center.x, y: center.y, type: SnapType.CENTER };
        }
      }
    }
    
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

      // If exactly one Polyline is selected, output its path coordinates directly!
      if (this.selectedEntityIds.size === 1) {
        const id = Array.from(this.selectedEntityIds)[0];
        const entity = this.doc.getEntity(id);
        if (entity instanceof Polyline) {
          const elevation = entity.elevation || 0;
          const coords = entity.vertices.map(v => {
            const vz = v.z !== undefined ? v.z : elevation;
            return `[${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${vz.toFixed(2)}]`;
          });
          const pathStr = `[${coords.join(", ")}]`;
          this.commandLinePrint(`[Selection] Polyline '${entity.id}' path coordinates copied to command line:`);
          this.commandLinePrint(`path=${pathStr}`);
        }
      }
    }
  }

  private isEditCommand(name?: string): boolean {
    if (!name) return false;
    const editCommands = ['EraseCommand', 'MoveCommand', 'CopyCommand', 'RotateCommand', 'ScaleCommand', 'MirrorCommand', 'TrimCommand', 'ExtendCommand', 'ArrayCommand', 'OffsetCommand', 'BlockCommand', 'JoinCommand', 'LengthenCommand', 'SFilletCommand', 'SChamferCommand'];
    const cmdName = name.endsWith('Command') ? name : name.charAt(0).toUpperCase() + name.slice(1).toLowerCase() + 'Command';
    return editCommands.includes(cmdName);
  }

  private isInSelectionStep(): boolean {
    const active = this.cmd.active;
    if (!active) return true;

    const activeName = active.constructor.name;
    const isEditCommand = this.isEditCommand(activeName);

    const step = active.step ?? -1;

    return (activeName === 'ListCommand') ||
        (activeName === 'GeneratorCommand') ||
        (step === 0 && isEditCommand) ||
        ((step === 0 || step === 1) && activeName === 'DimAngularCommand') ||
        (step === 0 && (activeName === 'DimRadiusCommand' || activeName === 'DimDiameterCommand')) ||
        (step === 0 && (activeName === 'ExtrudeCommand' || activeName === 'RevolveCommand')) ||
        ((step === 1 || step === 2) && activeName === 'SweepCommand') ||
        ('operation' in active && (step === 0 || step === 1)) ||
        (step === 1 && (activeName === 'TrimCommand' || activeName === 'ExtendCommand' || activeName === 'OffsetCommand')) ||
        ((step === 0 || step === 1 || step === 2) && activeName === 'FilletCommand') ||
        ((step === 0 || step === 1 || step === 2) && activeName === 'ChamferCommand') ||
        (step >= 2 && (activeName === 'SFilletCommand' || activeName === 'SChamferCommand')) ||
        ((step === 0 || step === 1 || step === 2) && activeName === 'BreakCommand') ||
        (step === 2 && activeName === 'BlockCommand') ||
        (step === 2 && activeName === 'LengthenCommand');
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

  private getSolid3DSelectables(): Entity[] {
    return this.getSelectableEntities().filter(e => {
      if ((e as any).type === "Solid3D" || e instanceof Solid3D) return true;
      if (e instanceof Insert) {
        const block = this.doc.blocks.getBlock(e.blockName);
        return block ? block.entities.some(be => be instanceof Solid3D) : false;
      }
      return false;
    });
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

    const res = this.cmd.execute(cmd, this.doc.units, selection, this.doc.entities, this.doc);
    const activeCmdName = this.cmd.active?.constructor.name;
    const isViewCmd = activeCmdName === 'PanCommand' || activeCmdName === 'ZoomCommand';
    this.viewer.setControlPointsVisibility(this.cmd.active !== null && !isViewCmd);
    return await this.handleResult(res);
  }

  async inputText(text:string){
    const callHandleResult = async (res: any) => {
      // Update dynamic input after state change (before awaiting result)
      const worldPt = this.viewer.screenToWorld(this.lastScreenX, this.lastScreenY);
      const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
      this.updateDynamicInput(snapped.x, snapped.y, this.lastScreenX, this.lastScreenY, true);

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
          const res = this.cmd.execute(cmdName, this.doc.units, ids, this.doc.entities, this.doc);
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

  private getConstrainedPreview(originalEntities: Entity[], dx: number, dy: number, mode: 'move'|'rotate'|'scale', cx: number, cy: number, screenY: number): PreviewObject {
    const mockDoc: any = {
      entities: new Map<string, Entity>(),
      getEntity(id: string) { return (this as any).entities.get(id); },
      updateSpatialIndex() {}
    };
    this.doc.entities.forEach((ent, id) => {
      mockDoc.entities.set(id, ent.clone(id));
    });

    originalEntities.forEach(orig => {
      const cl = mockDoc.getEntity(orig.id);
      if (cl) {
        if (mode === 'move') {
          if (cl.move) cl.move(dx, dy);
        } else if (mode === 'scale') {
          const dyScreen = this.lastScreenY - screenY;
          const scaleFactor = Math.max(0.01, 1 + dyScreen * 0.01);
          if (cl.scale) cl.scale(cx, cy, scaleFactor);
        } else if (mode === 'rotate') {
          const startPt = this.activeCenterGrip ? this.activeCenterGrip.startMouse : { x: cx + 1, y: cy }; // Fallback
          const mousePt = this.viewer.screenToWorld(this.lastScreenX, screenY);
          const origAngle = Math.atan2(startPt.y - cy, startPt.x - cx);
          const newAngle = Math.atan2(mousePt.y - cy, mousePt.x - cx);
          if (cl.rotate) cl.rotate(cx, cy, newAngle - origAngle);
        }
      }
    });

    try {
      solveDocumentConstraints(mockDoc, this.doc.constraints || []);
    } catch (err) {
      // Ignore solver errors in preview
    }

    const previewEntities: Entity[] = [];
    mockDoc.entities.forEach((ent: Entity) => {
      previewEntities.push(ent);
    });

    return { type: 'entities', entities: previewEntities };
  }

  move(screenX: number, screenY: number, ctrlKey = false, shiftKey = false) {
    if (this.viewer.isPanningActive()) {
      if (this.selectionStartPoint) {
        this.selectionStartPoint = null;
        if (this.selectionBoxEl) {
          document.body.removeChild(this.selectionBoxEl);
          this.selectionBoxEl = null;
        }
      }
      return;
    }

    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    
    if (this.activeCenterGrip) {
      const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
      const { x, y } = snapped;
      
      const cx = this.activeCenterGrip.center.x;
      const cy = this.activeCenterGrip.center.y;
      const dx = x - this.activeCenterGrip.startMouse.x;
      const dy = y - this.activeCenterGrip.startMouse.y;
      
      const hasConstraints = this.doc.constraints && this.doc.constraints.length > 0;

      if (hasConstraints) {
        const mockDoc: any = {
          entities: new Map<string, Entity>(),
          getEntity(id: string) { return this.entities.get(id); },
          updateSpatialIndex() {}
        };
        this.doc.entities.forEach((ent, id) => {
          mockDoc.entities.set(id, ent.clone(id));
        });

        this.activeCenterGrip.originalEntities.forEach(orig => {
          const cl = mockDoc.getEntity(orig.id);
          if (cl) {
            if (this.activeCenterGrip!.mode === 'move') {
              if (cl.move) cl.move(dx, dy);
            } else if (this.activeCenterGrip!.mode === 'scale') {
              const dyScreen = this.activeCenterGrip!.startScreenMouse.y - screenY;
              const scaleFactor = Math.max(0.01, 1 + dyScreen * 0.01);
              if (cl.scale) cl.scale(cx, cy, scaleFactor);
            } else if (this.activeCenterGrip!.mode === 'rotate') {
              const origAngle = Math.atan2(this.activeCenterGrip!.startMouse.y - cy, this.activeCenterGrip!.startMouse.x - cx);
              const newAngle = Math.atan2(y - cy, x - cx);
              if (cl.rotate) cl.rotate(cx, cy, newAngle - origAngle);
            }
          }
        });

        try {
          solveDocumentConstraints(mockDoc, this.doc.constraints);
        } catch (err) {
          console.error("Constraint solver error during center grip preview:", err);
        }

        const previewEntities: Entity[] = [];
        mockDoc.entities.forEach((ent: Entity) => {
          previewEntities.push(ent);
        });

        this.viewer.setPreview({ type: 'entities', entities: previewEntities } as any, this.doc.units);
      } else {
        const clonedEntities: import('./core/model/Entity').Entity[] = [];

        this.activeCenterGrip.originalEntities.forEach(orig => {
          const cloned = orig.clone(orig.id + '_preview');
          
          if (this.activeCenterGrip!.mode === 'move') {
            if (cloned.move) cloned.move(dx, dy);
          } else if (this.activeCenterGrip!.mode === 'scale') {
            const dyScreen = this.activeCenterGrip!.startScreenMouse.y - screenY;
            const scaleFactor = Math.max(0.01, 1 + dyScreen * 0.01);
            if (cloned.scale) {
              cloned.scale(cx, cy, scaleFactor);
            }
          } else if (this.activeCenterGrip!.mode === 'rotate') {
            const origAngle = Math.atan2(this.activeCenterGrip!.startMouse.y - cy, this.activeCenterGrip!.startMouse.x - cx);
            const newAngle = Math.atan2(y - cy, x - cx);
            if (cloned.rotate) {
              cloned.rotate(cx, cy, newAngle - origAngle);
            }
          }
          
          clonedEntities.push(cloned);
        });

        this.viewer.setPreview({ type: 'entities', entities: clonedEntities } as any, this.doc.units);
      }
      this.updateDynamicInput(x, y, screenX, screenY, true);
      return;
    }

    if (this.activeGrip) {
      const entity = this.doc.getEntity(this.activeGrip.entityId);
      if (entity && entity.moveGrip) {
        const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
        const { x, y } = snapped;
        
        const isConstrained = this.doc.constraints && this.doc.constraints.some(c => {
          const checkRef = (ref: any) => !!(ref && ref.entityId && ref.entityId === this.activeGrip?.entityId);
          const checkList = (list: any[]) => !!(list && Array.isArray(list) && list.some(ref => checkRef(ref)));

          if (!c) return false;

          if (c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'angular' || c.type === 'equal_length') {
            return checkList((c as any).l1) || checkList((c as any).l2);
          } else if (c.type === 'tangent') {
            return checkList((c as any).l1) || checkRef((c as any).circle);
          } else if (c.type === 'symmetric' || c.type === 'tangent_smooth') {
            return checkRef((c as any).p1) || checkRef((c as any).p2) || checkRef((c as any).p3);
          } else if (c.type === 'midpoint') {
            return checkRef((c as any).pm) || checkRef((c as any).ps) || checkRef((c as any).pe);
          } else {
            return checkRef((c as any).p1) || checkRef((c as any).p2);
          }
        });

        if (isConstrained) {
          this.viewer.setMainGroupVisibility(false);
          const mockDoc: any = {
            entities: new Map<string, Entity>(),
            getEntity(id: string) { return this.entities.get(id); },
            updateSpatialIndex() {}
          };
          this.doc.entities.forEach((ent, id) => {
            mockDoc.entities.set(id, ent.clone(id));
          });

          const clonedTarget = mockDoc.getEntity(this.activeGrip.entityId);
          if (clonedTarget && clonedTarget.moveGrip) {
            clonedTarget.moveGrip(this.activeGrip.gripId, { x, y });
          }

          const lockedPoint = {
            entityId: this.activeGrip.entityId,
            pointId: this.activeGrip.gripId
          };

          try {
            solveDocumentConstraints(mockDoc, this.doc.constraints, lockedPoint);
          } catch (err) {
            console.error("Constraint solver error during mousemove preview:", err);
          }

          const previewEntities: Entity[] = [];
          mockDoc.entities.forEach((ent: Entity) => {
            previewEntities.push(ent);
          });

          this.viewer.setPreview({ type: 'entities', entities: previewEntities } as any, this.doc.units);
        } else {
          this.viewer.setMainGroupVisibility(true);
          // Create ghost preview
          const cloned = entity.clone(entity.id + '_preview');
          if (cloned.moveGrip) {
            cloned.moveGrip(this.activeGrip.gripId, { x, y });
          }
          this.viewer.setPreview(cloned, this.doc.units);
        }
        
        this.updateDynamicInput(x, y, screenX, screenY, true);
        return;
      }
    }
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
    
    let subEntity: { entity: Entity, faceIndex?: number, edgeIndex?: number } | null = null;
    
    if (hoveredEntity === null) {
        const ndc = this.viewer.getNormalizedDeviceCoordinates(screenX, screenY);
        
        // Smart selection mode (no modifiers needed)
        subEntity = Selection3DEngine.getSubEntityAtSmart(ndc, this.viewer.camera, this.viewer.selectableMeshes, this.viewer.edgeLines, this.doc, this.getSolid3DSelectables());
        if (subEntity) {
          hoveredEntity = subEntity.entity;
          if (subEntity.faceIndex !== undefined) {
            // console.log("[Face Hover] Detected face index:", subEntity.faceIndex);
          } else if (subEntity.edgeIndex !== undefined) {
            // console.log("[Edge Hover] Detected edge index:", subEntity.edgeIndex);
          }
        } else {
          // Fallback to full object hover if no sub-entity is found
          hoveredEntity = Selection3DEngine.getHoveredSolid3D(
              ndc,
              this.viewer.camera,
              this.viewer.selectableMeshes,
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

    // Re-apply selected faces so they remain highlighted during mouse move
    if (this.selectedFaces && this.selectedFaces.length > 0) {
      this.selectedFaces.forEach(f => {
        this.viewer.highlightFace(f.entityId, f.faceIndex);
      });
    }

    const activeCmdName = this.cmd.active?.constructor.name;
    const isViewCmd = activeCmdName === 'PanCommand' || activeCmdName === 'ZoomCommand';

    if (this.cmd.active && !isViewCmd) {
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
      let preview = this.cmd.active.getPreview(worldPt.x, worldPt.y, this.doc.units, this.doc);
      
      const activeName = this.cmd.active.constructor.name;
      const hasConstraints = this.doc.constraints && this.doc.constraints.length > 0;

      if (hasConstraints && (activeName === 'MoveCommand' || activeName === 'CopyCommand') && this.cmd.active.step === 2) {
          const moveCmd = this.cmd.active as any;
          const dx = x - moveCmd.basePoint.x;
          const dy = y - moveCmd.basePoint.y;
          const targets = moveCmd.targetIds.map((id: string) => this.doc.getEntity(id)).filter((e: any) => e !== undefined);
          preview = this.getConstrainedPreview(targets, dx, dy, 'move', moveCmd.basePoint.x, moveCmd.basePoint.y, screenY);
      }

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

    this.lastScreenX = screenX;
    this.lastScreenY = screenY;
    this.updateDynamicInput(x, y, screenX, screenY);
  }

  updateDynamicInput(x: number, y: number, screenX: number, screenY: number, force: boolean = false) {
    if (this.contextMenuVisible) {
      return;
    }
    if (this.cmd.active && this.cmd.active.getDynamicInput) {
      const lines = this.cmd.active.getDynamicInput(x, y, this.doc.units);
      if (lines) {
        const options = this.cmd.active.getOptions ? this.cmd.active.getOptions(this.doc.units) : [];
        const cmdName = this.cmd.active.constructor.name;
        const lastLine = lines[lines.length - 1];
        const needsInput = !!(lastLine && lastLine.includes("(enter value)"));
        const isSolidCmd = ['BoxCommand', 'CylinderCommand', 'ConeCommand', 'SphereCommand', 'PolyhedronCommand', 'HullCommand'].includes(cmdName);
        
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
        
        const prompt = this.cmd.active.getPrompt ? this.cmd.active.getPrompt() : "";
        this.dynamicInput.show(screenX, screenY, lines, options, showInput, controls, footer, prompt, force);
      } else {
        this.dynamicInput.hide();
      }
    } else {
      this.dynamicInput.hide();
    }
  }

  public focusDynamicInput() {
    this.dynamicInput.focus();
  }

  getClosestPointRef(worldX: number, worldY: number, entityId: string): DocumentPointRef | null {
    const entity = this.doc.getEntity(entityId);
    if (!entity) return null;

    let closestPointId = '';
    let minDistance = Infinity;

    const checkPoint = (pointId: string, px: number, py: number) => {
      const dist = Math.sqrt((worldX - px) ** 2 + (worldY - py) ** 2);
      if (dist < minDistance) {
        minDistance = dist;
        closestPointId = pointId;
      }
    };

    if (entity instanceof Line) {
      checkPoint('start', entity.x1, entity.y1);
      checkPoint('end', entity.x2, entity.y2);
    } else if (entity instanceof Circle) {
      checkPoint('center', entity.cx, entity.cy);
    } else if (entity instanceof Arc) {
      checkPoint('center', entity.cx, entity.cy);
      checkPoint('start', entity.cx + entity.r * Math.cos(entity.startAngle), entity.cy + entity.r * Math.sin(entity.startAngle));
      checkPoint('end', entity.cx + entity.r * Math.cos(entity.endAngle), entity.cy + entity.r * Math.sin(entity.endAngle));
    } else if (entity instanceof Polyline) {
      entity.vertices.forEach((v, idx) => {
        checkPoint(`vertex_${idx}`, v.x, v.y);
      });
    } else if (entity instanceof Point) {
      checkPoint('position', entity.x, entity.y);
    }

    if (closestPointId) {
      return { entityId, pointId: closestPointId };
    }
    return null;
  }

  applyDirectConstraint(c: DocumentConstraint) {
    if (!this.doc.constraints) {
      this.doc.constraints = [];
    }

    // Check for duplicate constraint
    const isDuplicate = this.doc.constraints.some(existing => {
      if (existing.type !== c.type) return false;
      
      const arePointRefsEqual = (r1: any, r2: any) => 
        !!(r1 && r2 && r1.entityId === r2.entityId && r1.pointId === r2.pointId);

      const arePointListsEqual = (l1: any[], l2: any[]) => {
        if (!l1 || !l2 || l1.length !== l2.length) return false;
        // Check exact order or swapped order for 2-point segments
        if (l1.length === 2) {
          return (arePointRefsEqual(l1[0], l2[0]) && arePointRefsEqual(l1[1], l2[1])) ||
                 (arePointRefsEqual(l1[0], l2[1]) && arePointRefsEqual(l1[1], l2[0]));
        }
        return l1.every((ref, idx) => arePointRefsEqual(ref, l2[idx]));
      };

      if (c.type === 'fix') {
        return arePointRefsEqual((existing as any).p1, (c as any).p1);
      }
      
      if (c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'angular' || c.type === 'equal_length') {
        const e = existing as any, cn = c as any;
        return (arePointListsEqual(e.l1, cn.l1) && arePointListsEqual(e.l2, cn.l2)) ||
               (arePointListsEqual(e.l1, cn.l2) && arePointListsEqual(e.l2, cn.l1));
      }

      if (c.type === 'tangent') {
        const e = existing as any, cn = c as any;
        return arePointListsEqual(e.l1, cn.l1) && arePointRefsEqual(e.circle, cn.circle);
      }

      if (c.type === 'tangent_smooth' || c.type === 'symmetric') {
        const e = existing as any, cn = c as any;
        // Check p1, p2 (outer) and p3 (center)
        const outerMatch = (arePointRefsEqual(e.p1, cn.p1) && arePointRefsEqual(e.p2, cn.p2)) ||
                           (arePointRefsEqual(e.p1, cn.p2) && arePointRefsEqual(e.p2, cn.p1));
        return outerMatch && arePointRefsEqual(e.p3, cn.p3);
      }

      if (c.type === 'midpoint') {
        const e = existing as any, cn = c as any;
        // pm is midpoint, ps/pe are endpoints
        const endpointsMatch = (arePointRefsEqual(e.ps, cn.ps) && arePointRefsEqual(e.pe, cn.pe)) ||
                               (arePointRefsEqual(e.ps, cn.pe) && arePointRefsEqual(e.pe, cn.ps));
        return arePointRefsEqual(e.pm, cn.pm) && endpointsMatch;
      }

      // Default fallback for simple p1/p2 constraints (coincident, distance, concentric)
      if ('p1' in c && 'p2' in c) {
        const e = existing as any, cn = c as any;
        return (arePointRefsEqual(e.p1, cn.p1) && arePointRefsEqual(e.p2, cn.p2)) ||
               (arePointRefsEqual(e.p1, cn.p2) && arePointRefsEqual(e.p2, cn.p1));
      }
      
      return false;
    });

    if (isDuplicate) {
      this.printToCommandLine("Constraint is already applied.");
      return;
    }

    // Ensure constraints array is extensible (it might be frozen if assigned from a DB document)
    if (!this.doc.constraints) {
      this.doc.constraints = [];
    } else if (Object.isFrozen(this.doc.constraints) || !Array.isArray(this.doc.constraints)) {
      this.doc.constraints = Array.from(this.doc.constraints);
    }

    this.doc.history.startTransaction(this.doc.constraints);
    this.doc.constraints.push(c);

    try {
      solveDocumentConstraints(this.doc, this.doc.constraints);
    } catch (err) {
      console.error("Constraint solver execution failed:", err);
      this.printToCommandLine("Conflict: Solver could not resolve constraints.");
      this.doc.constraints.pop();
      this.doc.history.commitTransaction(this.doc.constraints);
      return;
    }

    this.doc.history.commitTransaction(this.doc.constraints);

    // Refresh representations in Three.js and on-screen
    this.viewer.updateConstraints(this.doc);
    this.doc.entities.forEach(ent => {
      this.addEntity(ent, false, false);
    });

    // Re-render highlights and grips for currently selected entities
    this.viewer.setHighlight(Array.from(this.selectedEntityIds));
    const selectedEntitiesForGrips = Array.from(this.selectedEntityIds)
      .map(id => this.doc.getEntity(id))
      .filter((ent): ent is Entity => ent !== undefined);
    this.viewer.renderGrips(selectedEntitiesForGrips);

    this.viewer.requestRender();
    this.printToCommandLine(`Constraint '${c.type}' applied successfully.`);
  }

  showDraftingContextMenu(screenX: number, screenY: number) {
    console.log("1. ContextMenu, 2. showDraftingContextMenu");
    if (this.cmd.active) {
      return;
    }
    this.contextMenuVisible = true;

    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const selectedIds = Array.from(this.selectedEntityIds);
    const selectedEntities = selectedIds
      .map(id => this.doc.getEntity(id))
      .filter((ent): ent is Entity => ent !== undefined);

    const headers: string[] = ["APPLY SKETCH RELATION"];
    const options: string[] = [];

    // Case 1: Grip active
    if (this.activeGrip) {
      headers.push(`Grip: ${this.activeGrip.entityId.split('_')[0]} (${this.activeGrip.gripId})`);
      options.push("Fix Coordinate", "Cancel Grip Edit");
      
      this.dynamicMenu.show(screenX, screenY, headers, options);
      this.dynamicMenu.onOptionClicked((option) => {
        if (option === "Fix Coordinate" && this.activeGrip) {
          console.log("1. ContextMenu, Fix, applyDirectConstraint");
          const coords = getPointCoords(this.doc, { entityId: this.activeGrip.entityId, pointId: this.activeGrip.gripId });
          if (coords) {
            this.applyDirectConstraint({
              type: 'fix',
              p1: { entityId: this.activeGrip.entityId, pointId: this.activeGrip.gripId },
              x: coords.x,
              y: coords.y
            });
          }
        } else if (option === "Cancel Grip Edit") {
          this.activeGrip = null;
          this.viewer.setPreview(null);
          this.printToCommandLine("*Cancel Grip Edit*");
          this.viewer.requestRender();
        }
        this.dynamicMenu.hide();
        this.contextMenuVisible = false;
      });
      return;
    }

    // Case 2: No entities selected
    if (selectedEntities.length === 0) {
      return;
    }

    // Case 3: Exactly 1 entity selected
    if (selectedEntities.length === 1) {
      const ent = selectedEntities[0];
      headers.push(`Selection: 1 ${ent.constructor.name} (${ent.id.split('_')[0]})`);

      if (ent instanceof Line) {
        options.push("Horizontal", "Vertical", "Fix", "Cancel");
      } else if (ent instanceof Circle || ent instanceof Arc) {
        options.push("Fix Center", "Cancel");
      } else {
        options.push("Fix", "Cancel");
      }

      this.dynamicMenu.show(screenX, screenY, headers, options);
      this.dynamicMenu.onOptionClicked((option) => {
        if (option === "Horizontal" && ent instanceof Line) {
          console.log("1. ContextMenu, Horizontal, applyDirectConstraint");
          this.applyDirectConstraint({
            type: 'horizontal',
            p1: { entityId: ent.id, pointId: 'start' },
            p2: { entityId: ent.id, pointId: 'end' }
          });
        } else if (option === "Vertical" && ent instanceof Line) {
          console.log("1. ContextMenu, Vertical, applyDirectConstraint");
          this.applyDirectConstraint({
            type: 'vertical',
            p1: { entityId: ent.id, pointId: 'start' },
            p2: { entityId: ent.id, pointId: 'end' }
          });
        } else if (option === "Fix") {
          const closestRef = this.getClosestPointRef(worldPt.x, worldPt.y, ent.id);
          if (closestRef) {
            console.log("1. ContextMenu, Fix, applyDirectConstraint");
            const coords = getPointCoords(this.doc, closestRef);
            if (coords) {
              this.applyDirectConstraint({ type: 'fix', p1: closestRef, x: coords.x, y: coords.y });
            }
          }
        } else if (option === "Fix Center" && (ent instanceof Circle || ent instanceof Arc)) {
          const ref = { entityId: ent.id, pointId: 'center' };
          console.log("1. ContextMenu, Fix, applyDirectConstraint");
          const coords = getPointCoords(this.doc, ref);
          if (coords) {
            this.applyDirectConstraint({ type: 'fix', p1: ref, x: coords.x, y: coords.y });
          }
        }
        this.dynamicMenu.hide();
        this.contextMenuVisible = false;
      });
      return;
    }

    // Case 4: Exactly 2 entities selected
    if (selectedEntities.length === 2) {
      const ent1 = selectedEntities[0];
      const ent2 = selectedEntities[1];
      headers.push(`Selection: ${ent1.constructor.name} + ${ent2.constructor.name}`);

      const hasLine1 = ent1 instanceof Line;
      const hasLine2 = ent2 instanceof Line;
      const hasCircle1 = ent1 instanceof Circle || ent1 instanceof Arc;
      const hasCircle2 = ent2 instanceof Circle || ent2 instanceof Arc;

      const hasSegment1 = ent1 instanceof Line || ent1 instanceof Polyline;
      const hasSegment2 = ent2 instanceof Line || ent2 instanceof Polyline;

      const isJoinable1 = ent1 instanceof Line || ent1 instanceof Polyline || ent1 instanceof Arc;
      const isJoinable2 = ent2 instanceof Line || ent2 instanceof Polyline || ent2 instanceof Arc;

      const hasPointLike1 = ent1 instanceof Point || ent1 instanceof Circle || ent1 instanceof Arc;
      const hasPointLike2 = ent2 instanceof Point || ent2 instanceof Circle || ent2 instanceof Arc;

      if (isJoinable1 && isJoinable2) {
        // TOP ORDER: JOIN
        options.push("Join", "---");
      }

      if ((hasSegment1 && hasPointLike2) || (hasSegment2 && hasPointLike1)) {
        options.push("Midpoint", "---");
      }

      if (hasLine1 && hasLine2) {
        options.push("Coincident", "Parallel", "Perpendicular", "Equal Length", "Angular", "Distance", "Cancel");
      } else if (hasCircle1 && hasCircle2) {
        options.push("Coincident", "Concentric", "Tangent", "Distance", "Cancel");
      } else if ((hasLine1 && hasCircle2) || (hasLine2 && hasCircle1)) {
        options.push("Coincident", "Tangent", "Distance", "Cancel");
      } else if (hasLine1 || hasLine2) {
        options.push("Coincident", "Distance", "Cancel");
      } else if (hasCircle1 || hasCircle2) {
        options.push("Coincident", "Distance", "Cancel");
      } else {
        options.push("Coincident", "Distance", "Cancel");
      }

      this.dynamicMenu.show(screenX, screenY, headers, options);
      this.dynamicMenu.onOptionClicked((option) => {
        if (option === "Cancel") {
          this.dynamicMenu.hide();
          this.contextMenuVisible = false;
          return;
        }

        if (option === "Join") {
          this.execute(`JOIN`).then(result => {
            if (typeof result === 'string') {
              this.printToCommandLine(result);
              const isError = result.toLowerCase().includes("cannot") || 
                              result.toLowerCase().includes("fail") || 
                              result.toLowerCase().includes("invalid") ||
                              result.toLowerCase().includes("not found");
              NotificationManager.getInstance().show(result, isError ? "error" : "success");
            }
          });
          this.dynamicMenu.hide();
          this.contextMenuVisible = false;
          return;
        }

        // Midpoint Relation (Line/Polyline + Point/Center)
        if (option === "Midpoint") {
          const segmentEnt = selectedEntities.find(e => e instanceof Line || e instanceof Polyline);
          const pointEnt = selectedEntities.find(e => e instanceof Point || e instanceof Circle || e instanceof Arc);

          if (segmentEnt && pointEnt) {
            console.log("1. ContextMenu, Midpoint, applyDirectConstraint");
            const getPointRef = (e: any): DocumentPointRef => {
              if (e instanceof Point) return { entityId: e.id, pointId: 'position' };
              return { entityId: e.id, pointId: 'center' };
            };

            const pm = getPointRef(pointEnt);
            let ps: DocumentPointRef | null = null;
            let pe: DocumentPointRef | null = null;

            if (segmentEnt instanceof Line) {
              ps = { entityId: segmentEnt.id, pointId: 'start' };
              pe = { entityId: segmentEnt.id, pointId: 'end' };
            } else if (segmentEnt instanceof Polyline) {
              let minIdx = 0;
              let minDist = Infinity;
              const numVerts = segmentEnt.vertices.length;
              const numSegs = segmentEnt.closed ? numVerts : numVerts - 1;

              for (let i = 0; i < numSegs; i++) {
                const v1 = segmentEnt.vertices[i];
                const v2 = segmentEnt.vertices[(i + 1) % numVerts];
                const mx = (v1.x + v2.x) / 2;
                const my = (v1.y + v2.y) / 2;
                const dist = Math.sqrt((worldPt.x - mx) ** 2 + (worldPt.y - my) ** 2);
                if (dist < minDist) { minDist = dist; minIdx = i; }
              }
              ps = { entityId: segmentEnt.id, pointId: `vertex_${minIdx}` };
              pe = { entityId: segmentEnt.id, pointId: `vertex_${(minIdx + 1) % numVerts}` };
            }

            if (ps && pe) {
              this.applyDirectConstraint({ type: 'midpoint', pm, ps, pe });
            }
          }
          this.dynamicMenu.hide();
          this.contextMenuVisible = false;
          return;
        }

        // Geometric Constraints (Line + Line)
        if (option === "Parallel" && ent1 instanceof Line && ent2 instanceof Line) {
          console.log("1. ContextMenu, Parallel, applyDirectConstraint");
          this.applyDirectConstraint({
            type: 'parallel',
            l1: [{ entityId: ent1.id, pointId: 'start' }, { entityId: ent1.id, pointId: 'end' }],
            l2: [{ entityId: ent2.id, pointId: 'start' }, { entityId: ent2.id, pointId: 'end' }]
          });
          this.dynamicMenu.hide();
          this.contextMenuVisible = false;
          return;
        }

        if (option === "Perpendicular" && ent1 instanceof Line && ent2 instanceof Line) {
          console.log("1. ContextMenu, Perpendicular, applyDirectConstraint");
          this.applyDirectConstraint({
            type: 'perpendicular',
            l1: [{ entityId: ent1.id, pointId: 'start' }, { entityId: ent1.id, pointId: 'end' }],
            l2: [{ entityId: ent2.id, pointId: 'start' }, { entityId: ent2.id, pointId: 'end' }]
          });
          this.dynamicMenu.hide();
          this.contextMenuVisible = false;
          return;
        }

        if (option === "Equal Length" && ent1 instanceof Line && ent2 instanceof Line) {
          console.log("1. ContextMenu, Equal Length, applyDirectConstraint");
          this.applyDirectConstraint({
            type: 'equal_length',
            l1: [{ entityId: ent1.id, pointId: 'start' }, { entityId: ent1.id, pointId: 'end' }],
            l2: [{ entityId: ent2.id, pointId: 'start' }, { entityId: ent2.id, pointId: 'end' }]
          });
          this.dynamicMenu.hide();
          this.contextMenuVisible = false;
          return;
        }

        if (option === "Angular" && ent1 instanceof Line && ent2 instanceof Line) {
          console.log("1. ContextMenu, Angular, applyDirectConstraint");
          this.dynamicMenu.hide();
          
          const intersect = getLineLineIntersectionInfinite(
            { x: ent1.x1, y: ent1.y1 }, { x: ent1.x2, y: ent1.y2 },
            { x: ent2.x1, y: ent2.y1 }, { x: ent2.x2, y: ent2.y2 }
          );

          if (!intersect) return;

          // Determine which endpoint of each line is closer to the intersection
          const d1a = Math.sqrt((ent1.x1 - intersect.x)**2 + (ent1.y1 - intersect.y)**2);
          const d1b = Math.sqrt((ent1.x2 - intersect.x)**2 + (ent1.y2 - intersect.y)**2);
          const l1Refs: [DocumentPointRef, DocumentPointRef] = d1a < d1b 
            ? [{ entityId: ent1.id, pointId: 'start' }, { entityId: ent1.id, pointId: 'end' }]
            : [{ entityId: ent1.id, pointId: 'end' }, { entityId: ent1.id, pointId: 'start' }];

          const d2a = Math.sqrt((ent2.x1 - intersect.x)**2 + (ent2.y1 - intersect.y)**2);
          const d2b = Math.sqrt((ent2.x2 - intersect.x)**2 + (ent2.y2 - intersect.y)**2);
          const l2Refs: [DocumentPointRef, DocumentPointRef] = d2a < d2b
            ? [{ entityId: ent2.id, pointId: 'start' }, { entityId: ent2.id, pointId: 'end' }]
            : [{ entityId: ent2.id, pointId: 'end' }, { entityId: ent2.id, pointId: 'start' }];

          const pStart1 = getPointCoords(this.doc, l1Refs[0]);
          const pEnd1 = getPointCoords(this.doc, l1Refs[1]);
          const pStart2 = getPointCoords(this.doc, l2Refs[0]);
          const pEnd2 = getPointCoords(this.doc, l2Refs[1]);

          if (!pStart1 || !pEnd1 || !pStart2 || !pEnd2) return;

          const vx1 = pEnd1.x - pStart1.x, vy1 = pEnd1.y - pStart1.y;
          const vx2 = pEnd2.x - pStart2.x, vy2 = pEnd2.y - pStart2.y;
          
          const diff = Math.atan2(vy2, vx2) - Math.atan2(vy1, vx1);
          let d = diff; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
          
          const currentDeg = (Math.abs(d) * 180 / Math.PI).toFixed(1);
          const rect = this.viewer.canvas.getBoundingClientRect();
          
          this.dynamicInput.show(rect.left + rect.width / 2 - 80, rect.top + rect.height / 2 - 40, ["SET TARGET ANGLE", `Current: ${currentDeg}°`], [], true, [], "Type angle in degrees and press Enter", currentDeg);
          this.dynamicInput.onInputSubmitted((text) => {
            const val = parseFloat(text);
            if (!isNaN(val) && val > 0 && val < 180) {
              let targetDiff = val * Math.PI / 180;
              if (d < 0) targetDiff = -targetDiff;
              
              this.applyDirectConstraint({ 
                type: 'angular', 
                l1: l1Refs, 
                l2: l2Refs, 
                value: targetDiff 
              });
            }
            this.dynamicInput.hide();
          });
          this.contextMenuVisible = false;
          return;
        }

        // Tangent Relations
        if (option === "Tangent" && (ent1 instanceof Arc || ent1 instanceof Circle) && (ent2 instanceof Arc || ent2 instanceof Circle)) {
          console.log("1. ContextMenu, Tangent, applyDirectConstraint");
          const tol = 1e-3;
          const pts1 = ent1 instanceof Arc ? ['start', 'end'] : [], pts2 = ent2 instanceof Arc ? ['start', 'end'] : [];
          let shared: DocumentPointRef | null = null;
          for (const p1id of pts1) { for (const p2id of pts2) {
              const p1 = getPointCoords(this.doc, { entityId: ent1.id, pointId: p1id }), p2 = getPointCoords(this.doc, { entityId: ent2.id, pointId: p2id });
              if (p1 && p2 && Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2) < tol) { shared = { entityId: ent1.id, pointId: p1id }; break; }
          } if (shared) break; }
          if (shared) { this.applyDirectConstraint({ type: 'tangent_smooth', p1: { entityId: ent1.id, pointId: 'center' }, p2: shared, p3: { entityId: ent2.id, pointId: 'center' } }); }
          this.dynamicMenu.hide(); this.contextMenuVisible = false;
          return;
        }

        if (option === "Tangent") {
          const lineEnt = ent1 instanceof Line ? ent1 : ent2 as Line;
          const circleEnt = (ent1 instanceof Circle || ent1 instanceof Arc) ? ent1 : ent2 as Circle | Arc;
          console.log("1. ContextMenu, Tangent, applyDirectConstraint");
          this.applyDirectConstraint({ type: 'tangent', l1: [{ entityId: lineEnt.id, pointId: 'start' }, { entityId: lineEnt.id, pointId: 'end' }], circle: { entityId: circleEnt.id, pointId: 'center' } });
          this.dynamicMenu.hide(); this.contextMenuVisible = false;
          return;
        }

        if (option === "Concentric" && (ent1 instanceof Circle || ent1 instanceof Arc) && (ent2 instanceof Circle || ent2 instanceof Arc)) {
          console.log("1. ContextMenu, Concentric, applyDirectConstraint");
          this.applyDirectConstraint({ type: 'concentric', p1: { entityId: ent1.id, pointId: 'center' }, p2: { entityId: ent2.id, pointId: 'center' } });
          this.dynamicMenu.hide(); this.contextMenuVisible = false;
          return;
        }

        // Point-to-Point Constraints (Need proximity resolution)
        const ref1 = this.getClosestPointRef(worldPt.x, worldPt.y, ent1.id);
        const ref2 = this.getClosestPointRef(worldPt.x, worldPt.y, ent2.id);

        if (!ref1 || !ref2) {
          this.dynamicMenu.hide();
          this.contextMenuVisible = false;
          return;
        }

        if (option === "Coincident") {
          console.log("1. ContextMenu, Coincident, applyDirectConstraint");
          this.applyDirectConstraint({ type: 'coincident', p1: ref1, p2: ref2 });
          this.dynamicMenu.hide(); this.contextMenuVisible = false;
        } else if (option === "Distance") {
          console.log("1. ContextMenu, Distance, applyDirectConstraint");
          this.dynamicMenu.hide();
          const coords1 = getPointCoords(this.doc, ref1), coords2 = getPointCoords(this.doc, ref2);
          if (!coords1 || !coords2) return;
          const currentLen = Math.sqrt((coords2.x - coords1.x) ** 2 + (coords2.y - coords1.y) ** 2);
          const rect = this.viewer.canvas.getBoundingClientRect();
          this.dynamicInput.show(rect.left + rect.width / 2 - 80, rect.top + rect.height / 2 - 40, ["SET TARGET DISTANCE", `Current: ${currentLen.toFixed(3)}`], [], true, [], "Type distance and press Enter", currentLen.toFixed(3));
          this.dynamicInput.onInputSubmitted((text) => {
            const val = parseFloat(text);
            if (!isNaN(val) && val > 0) { this.applyDirectConstraint({ type: 'distance', p1: ref1, p2: ref2, value: val }); }
            this.dynamicInput.hide(); this.contextMenuVisible = false;
          });
        }
      });
      return;
      }
    // Case 5: Exactly 3 entities selected
    if (selectedEntities.length === 3) {
      headers.push(`Selection: 3 objects`);
      
      const allPoints = selectedEntities.every(e => e instanceof Point || e instanceof Circle || e instanceof Arc);
      if (allPoints) {
        options.push("Symmetric", "Midpoint", "---");
      }

      const allJoinable = selectedEntities.every(e => e instanceof Line || e instanceof Polyline || e instanceof Arc);
      if (allJoinable) {
        options.push("Join", "---");
      }
      
      options.push("Cancel");

      this.dynamicMenu.show(screenX, screenY, headers, options);
      this.dynamicMenu.onOptionClicked((option) => {
        if (option === "Symmetric") {
          console.log("1. ContextMenu, Symmetric, applyDirectConstraint");
          // Map entities to point refs. For Point, it's 'position'. For Circle/Arc, it's 'center'.
          const getRef = (e: Entity): DocumentPointRef => {
            if (e instanceof Point) return { entityId: e.id, pointId: 'position' };
            return { entityId: e.id, pointId: 'center' };
          };

          this.applyDirectConstraint({
            type: 'symmetric',
            p1: getRef(selectedEntities[0]),
            p2: getRef(selectedEntities[1]),
            p3: getRef(selectedEntities[2]) // Assuming 3rd is midpoint
          });
        } else if (option === "Midpoint") {
          // Case 5: 3 objects selected. 
          // If all are points, 3rd is midpoint. 
          // If it's a mix (1 line + 1 point), we handle it.
          const lineEnt = selectedEntities.find(e => e instanceof Line) as Line;
          const pointEnts = selectedEntities.filter(e => e instanceof Point || e instanceof Circle || e instanceof Arc);
          
          const getPointRef = (e: any): DocumentPointRef => {
            if (e instanceof Point) return { entityId: e.id, pointId: 'position' };
            return { entityId: e.id, pointId: 'center' };
          };

          if (lineEnt && pointEnts.length === 1) {
            console.log("1. ContextMenu, Midpoint, applyDirectConstraint");
            this.applyDirectConstraint({
              type: 'midpoint',
              pm: getPointRef(pointEnts[0]),
              ps: { entityId: lineEnt.id, pointId: 'start' },
              pe: { entityId: lineEnt.id, pointId: 'end' }
            });
          } else if (pointEnts.length === 3) {
            console.log("1. ContextMenu, Midpoint, applyDirectConstraint");
            this.applyDirectConstraint({
              type: 'midpoint',
              pm: getPointRef(pointEnts[2]),
              ps: getPointRef(pointEnts[0]),
              pe: getPointRef(pointEnts[1])
            });
          }
        } else if (option === "Join") {
          this.execute(`JOIN`).then(result => {
            if (typeof result === 'string') {
              this.printToCommandLine(result);
              const isError = result.toLowerCase().includes("cannot") || 
                              result.toLowerCase().includes("fail") || 
                              result.toLowerCase().includes("invalid") ||
                              result.toLowerCase().includes("not found");
              NotificationManager.getInstance().show(result, isError ? "error" : "success");
            }
          });
        }
        this.dynamicMenu.hide();
        this.contextMenuVisible = false;
      });
      return;
    }

    // Case 6: More than 3 entities selected
    if (selectedEntities.length > 3) {
      headers.push(`Selection: ${selectedEntities.length} objects`);
      
      const allJoinable = selectedEntities.every(e => e instanceof Line || e instanceof Polyline || e instanceof Arc);
      if (allJoinable) {
        options.push("Join", "---");
      }
      
      options.push("Cancel");

      this.dynamicMenu.show(screenX, screenY, headers, options);
      this.dynamicMenu.onOptionClicked((option) => {
        if (option === "Join") {
          this.execute(`JOIN`).then(result => {
            if (typeof result === 'string') {
              this.printToCommandLine(result);
              const isError = result.toLowerCase().includes("cannot") || 
                              result.toLowerCase().includes("fail") || 
                              result.toLowerCase().includes("invalid") ||
                              result.toLowerCase().includes("not found");
              NotificationManager.getInstance().show(result, isError ? "error" : "success");
            }
          });
        }
        this.dynamicMenu.hide();
        this.contextMenuVisible = false;
      });
      return;
    }
  }

  pointerDown(screenX: number, screenY: number, button: number = 0, shiftKey: boolean = false) {
    if (this.contextMenuVisible) {
      this.dynamicMenu.hide();
      this.dynamicInput.hide();
      this.contextMenuVisible = false;
    }

    if (button === 2) {
      return;
    }

    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    
    // Check for grips first
    if (this.selectedEntityIds.size > 0 && !this.cmd.active) {
      const selectedEntities = Array.from(this.selectedEntityIds)
        .map(id => this.doc.getEntity(id))
        .filter((e): e is Entity => e !== undefined);

      // 1. Check Center Grip
      const center = this.viewer.getCenterOfObjects(selectedEntities.map(e => e.id));
      if (center) {
        const dist = Math.sqrt((worldPt.x - center.x) ** 2 + (worldPt.y - center.y) ** 2);
        const centerGripTolerance = 15 / this.viewer.camera.zoom;
        if (dist <= centerGripTolerance) {
          let mode: 'move' | 'scale' | 'rotate' = 'move';
          if (button === 2) mode = 'rotate';
          else if (shiftKey) mode = 'scale';

          this.activeCenterGrip = {
            center: { x: center.x, y: center.y },
            mode,
            startMouse: { x: worldPt.x, y: worldPt.y },
            startScreenMouse: { x: screenX, y: screenY },
            originalEntities: selectedEntities.map(e => e.clone(e.id))
          };
          return;
        }
      }

      // 2. Check Entity Grips
      for (const entity of selectedEntities) {
        if (entity && entity.getGrips) {
          const grips = entity.getGrips();
          for (const grip of grips) {
            const dist = Math.sqrt((worldPt.x - grip.point.x) ** 2 + (worldPt.y - grip.point.y) ** 2);
            const gripTolerance = 10 / this.viewer.camera.zoom; // 10 pixels
            if (dist <= gripTolerance) {
              this.activeGrip = { entityId: entity.id, gripId: grip.id, startPoint: { ...grip.point } };

              if (this.sketchToolWindow) {
                if (entity instanceof Polyline) {
                  if (grip.id.startsWith('midpoint_') || grip.id.startsWith('center_')) {
                    const idxStr = grip.id.split('_')[1];
                    const segKey = `${entity.id}::segment_${idxStr}`;
                    this.sketchToolWindow.selectedElementIds.add(segKey);
                  } else if (grip.id.startsWith('vertex_')) {
                    const idxStr = grip.id.split('_')[1];
                    const refKey = `${entity.id}::vertex_${idxStr}`;
                    this.sketchToolWindow.selectedPointRefs.add(refKey);
                  }
                } else {
                  if (grip.id === 'start' || grip.id === 'end') {
                    const refKey = `${entity.id}::${grip.id}`;
                    this.sketchToolWindow.selectedPointRefs.add(refKey);
                  } else if (grip.id === 'center') {
                    const refKey = `${entity.id}::center`;
                    this.sketchToolWindow.selectedPointRefs.add(refKey);
                  }
                }
                this.sketchToolWindow.syncWithAppSelection();
              }

              return; // Stop processing, start dragging
            }
          }
        }
      }
    }

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

  async pointerUp(screenX: number, screenY: number, isShift = false, isCtrl = false, button: number = 0): Promise<CommandResponse | undefined> {
    if (this.viewer.wasViewportPanEnded()) {
      setTimeout(() => this.viewer.clearViewportPanEndedFlag(), 100);
      return;
    }

    if (this.viewer.wasPanEnded()) {
      this.viewer.clearPanEndedFlag();
      this.terminateActiveCommand();
      return "Pan completed.";
    }

    if (button === 2) {
      return;
    }

    if (this.activeCenterGrip) {
      const worldPt = this.viewer.screenToWorld(screenX, screenY);
      const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
      const { x, y } = snapped;
      
      const cx = this.activeCenterGrip.center.x;
      const cy = this.activeCenterGrip.center.y;
      const dx = x - this.activeCenterGrip.startMouse.x;
      const dy = y - this.activeCenterGrip.startMouse.y;
      
      this.doc.history.startTransaction(this.doc.constraints);
      
      const beforeStates = new Map<string, Entity>();
      this.doc.entities.forEach((ent, id) => {
          beforeStates.set(id, ent.clone(id));
      });

      this.activeCenterGrip.originalEntities.forEach(orig => {
        const entity = this.doc.getEntity(orig.id);
        if (entity) {
          if (this.activeCenterGrip!.mode === 'move') {
            if (entity.move) entity.move(dx, dy);
          } else if (this.activeCenterGrip!.mode === 'scale') {
            const dyScreen = this.activeCenterGrip!.startScreenMouse.y - screenY;
            const scaleFactor = Math.max(0.01, 1 + dyScreen * 0.01);
            if (entity.scale) {
              entity.scale(cx, cy, scaleFactor);
            }
          } else if (this.activeCenterGrip!.mode === 'rotate') {
            const origAngle = Math.atan2(this.activeCenterGrip!.startMouse.y - cy, this.activeCenterGrip!.startMouse.x - cx);
            const newAngle = Math.atan2(y - cy, x - cx);
            if (entity.rotate) {
              entity.rotate(cx, cy, newAngle - origAngle);
            }
          }
        }
      });

      // Solve constraints after the manual transformation
      try {
        solveDocumentConstraints(this.doc, this.doc.constraints);
      } catch (err) {
        console.error("Constraint solver error during center grip commit:", err);
      }

      // Record transforms for entities that actually changed and update viewer
      this.doc.entities.forEach((ent, id) => {
        const before = beforeStates.get(id);
        if (before) {
            const changed = JSON.stringify(before) !== JSON.stringify(ent);
            if (changed) {
                this.doc.recordTransform(before, ent);
                this.addEntity(ent, false, false);
            }
        }
      });
      
      this.doc.history.commitTransaction(this.doc.constraints);

      this.activeCenterGrip = null;
      this.viewer.setPreview(null);

      this.syncFromDocument();
      
      // Refresh highlights and grips
      this.viewer.setHighlight(Array.from(this.selectedEntityIds));
      const selectedEntities = Array.from(this.selectedEntityIds)
        .map(id => this.doc.getEntity(id))
        .filter((e): e is Entity => e !== undefined);
      this.viewer.renderGrips(selectedEntities);
      
      return "Center grip edit completed.";
    }

    if (this.activeGrip) {
      const entity = this.doc.getEntity(this.activeGrip.entityId);
      if (entity && entity.moveGrip) {
        const worldPt = this.viewer.screenToWorld(screenX, screenY);
        const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
        const { x, y } = snapped;
        
        const isConstrained = this.doc.constraints && this.doc.constraints.some(c => {
          const checkRef = (ref: any) => !!(ref && ref.entityId && ref.entityId === this.activeGrip?.entityId);
          const checkList = (list: any[]) => !!(list && Array.isArray(list) && list.some(ref => checkRef(ref)));

          if (!c) return false;

          if (c.type === 'parallel' || c.type === 'perpendicular' || c.type === 'angular' || c.type === 'equal_length') {
            return checkList((c as any).l1) || checkList((c as any).l2);
          } else if (c.type === 'tangent') {
            return checkList((c as any).l1) || checkRef((c as any).circle);
          } else if (c.type === 'symmetric' || c.type === 'tangent_smooth') {
            return checkRef((c as any).p1) || checkRef((c as any).p2) || checkRef((c as any).p3);
          } else if (c.type === 'midpoint') {
            return checkRef((c as any).pm) || checkRef((c as any).ps) || checkRef((c as any).pe);
          } else {
            return checkRef((c as any).p1) || checkRef((c as any).p2);
          }
        });

        if (isConstrained) {
          this.doc.history.startTransaction(this.doc.constraints);
          
          const beforeStates = new Map<string, Entity>();
          this.doc.entities.forEach((ent, id) => {
            beforeStates.set(id, ent.clone(id));
          });

          entity.moveGrip(this.activeGrip.gripId, { x, y });

          const lockedPoint = {
            entityId: this.activeGrip.entityId,
            pointId: this.activeGrip.gripId
          };

          try {
            solveDocumentConstraints(this.doc, this.doc.constraints, lockedPoint);
          } catch (err) {
            console.error("Constraint solver error during mouseup commit:", err);
          }

          this.doc.entities.forEach((ent, id) => {
            const before = beforeStates.get(id);
            if (before) {
              const changed = JSON.stringify(before) !== JSON.stringify(ent);
              if (changed) {
                this.doc.recordTransform(before, ent);
                this.addEntity(ent, false, false);
              }
            }
          });

          this.doc.history.commitTransaction(this.doc.constraints);
        } else {
          this.doc.history.startTransaction(this.doc.constraints);
          const beforeState = entity.clone(entity.id);
          entity.moveGrip(this.activeGrip.gripId, { x, y });
          this.doc.recordTransform(beforeState, entity);
          this.addEntity(entity, true, false); // Update entity in doc
          this.doc.history.commitTransaction(this.doc.constraints);
        }
        
        this.syncFromDocument();
        this.activeGrip = null;
        this.viewer.setMainGroupVisibility(true);
        this.viewer.setPreview(null);
        
        // Refresh highlights and grips
        this.viewer.setHighlight(Array.from(this.selectedEntityIds));
        const selectedEntities = Array.from(this.selectedEntityIds)
          .map(id => this.doc.getEntity(id))
          .filter((e): e is Entity => e !== undefined);
        this.viewer.renderGrips(selectedEntities);
        
        return "Grip edit completed.";
      }
    }

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
                if (res) {
                    const loopRes = await this.handleResult(res, true);
                    if (loopRes) result = loopRes;
                }
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
    
    const selectedEntitiesForGrips = Array.from(this.selectedEntityIds)
        .map(id => this.doc.getEntity(id))
        .filter((e): e is Entity => e !== undefined);
    this.viewer.renderGrips(selectedEntitiesForGrips);
    
    if (this.propertiesWindow) {
        const selectedEntities = Array.from(this.selectedEntityIds)
            .map(id => this.doc.getEntity(id))
            .filter((e): e is Entity => e !== undefined);
        this.propertiesWindow.update(selectedEntities);
    }
    
    // Attach/detach gizmo based on selection
    if (!isCtrl) {
      this.updateGizmoAttachment();
    } else {
      this.gizmoManager.detach();
    }
    
    return result;
  }

  async click(screenX:number, screenY:number, isShift = false, isCtrl = false){
    const worldPt = this.viewer.screenToWorld(screenX, screenY);
    const ndc = this.viewer.getNormalizedDeviceCoordinates(screenX, screenY);
    const subEntity = Selection3DEngine.getSubEntityAtSmart(ndc, this.viewer.camera, this.viewer.selectableMeshes, this.viewer.edgeLines, this.doc, this.getSolid3DSelectables());

    
    if (subEntity) {
      // Point directional light to selected object
      if (this.viewer.directionalLight && subEntity.entity) {
        this.viewer.scene.traverse((obj) => {
          if (obj.userData && obj.userData.entityId === subEntity.entity.id && obj.userData.type === 'Solid3D') {
            this.viewer.directionalLight!.target = obj;
            this.viewer.directionalLight!.target.updateMatrixWorld();
          }
        });
      }
    }

    const activeName = this.cmd.active?.constructor.name;
    const wantsSubEntity = (activeName === 'SFilletCommand' || activeName === 'SChamferCommand' || activeName === 'ShellCommand') || (this.cmd.active === null && this.selectionMode === 'SURFACE');

    if (subEntity && wantsSubEntity) {
      if (subEntity.edgeIndex !== undefined) {
        this.selectedEdge = { entityId: subEntity.entity.id, edgeIndex: subEntity.edgeIndex };
        this.viewer.highlightEdge(subEntity.entity.id, subEntity.edgeIndex);
        
        const text = `EDGE:${subEntity.entity.id}:${subEntity.edgeIndex}`;
        const res = await this.cmd.inputString(text, this.doc.units, (p) => this.doc.getNextId(p), { x: worldPt.x, y: worldPt.y }, this.doc);
        const resResult = await this.handleResult(res);
        return resResult; // Return early to prevent full object selection & gizmo attachment
      } else if (subEntity.faceIndex !== undefined) {
        this.selectedFaces.push({ entityId: subEntity.entity.id, faceIndex: subEntity.faceIndex });
        
        const text = `FACE:${subEntity.entity.id}:${subEntity.faceIndex}`;
        const res = await this.cmd.inputString(text, this.doc.units, (p) => this.doc.getNextId(p), { x: worldPt.x, y: worldPt.y }, this.doc);
        const resResult = await this.handleResult(res);
        
        if (this.selectedFaces.length > 2) {
          this.selectedFaces.shift();
        }
        
        // Highlight the clicked face
        this.viewer.highlightFace(subEntity.entity.id, subEntity.faceIndex);
        
        if (this.selectedFaces.length === 2) {
          const f1 = this.selectedFaces[0];
          const f2 = this.selectedFaces[1];
          if (f1.entityId === f2.entityId && subEntity.entity instanceof Solid3D) {
             const sharedEdgeResult = Selection3DEngine.getSharedEdge(subEntity.entity, f1.faceIndex, f2.faceIndex);
             if (sharedEdgeResult !== null) {
               this.selectedEdge = { entityId: f1.entityId, edgeIndex: sharedEdgeResult.edgeIndex };
               this.viewer.highlightEdge(f1.entityId, sharedEdgeResult.edgeIndex);

               // Clear face highlights
              this.viewer.highlightFace(f1.entityId, null);
              
              this.selectedFaces = []; // Clear for next pair
            } else {

            }
          } else {

          }
        }
        return resResult; // Return early to prevent full object selection & gizmo attachment
      }
    }
    const snapped = this.getSnappedPoint(worldPt.x, worldPt.y);
    const { x, y } = snapped;

    // Handle initial selection step for edit commands if clicking an entity
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
                this.viewer.selectableMeshes,
                this.doc,
                this.getSolid3DSelectables()
            );
            if (solid3D) entity = solid3D;
        }

        if (entity) {
            if (!isCtrl) {
                this.selectedEdge = null; // Clear edge selection on standard click
                this.selectedFaces = [];  // Clear face selection on standard click
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
            const active = this.cmd.active;
            const step = active ? (active.step ?? -1) : -1;
            const isImmediatePick = active && (activeName === 'TrimCommand' || activeName === 'ExtendCommand' || activeName === 'OffsetCommand') && step === 1;
            const isFilletPick = (activeName === 'FilletCommand' && active && (step === 0 || step === 1 || step === 2)) || (activeName === 'SFilletCommand' && active && step === 2);
            const isChamferPick = (activeName === 'ChamferCommand' && active && (step === 0 || step === 1 || step === 2)) || (activeName === 'SChamferCommand' && active && step === 2);
            const isBreakPick = activeName === 'BreakCommand' && active && (step === 0 || step === 1 || step === 2);
            const isLengthenPick = activeName === 'LengthenCommand' && active && step === 2;
            const isBooleanPick = active && 'operation' in active && (step === 0 || step === 1);
            const hasSetEntity = active && 'setEntity' in active;

            if (active && (hasSetEntity || isImmediatePick || isFilletPick || isChamferPick || isBreakPick || isLengthenPick || isBooleanPick)) {       
                if (hasSetEntity) {
                  (active as unknown as any).setEntity(entity);
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
            this.selectedFaces = [];  // Clear face selection on empty space click
        }

        const selectedEntitiesForGrips = Array.from(this.selectedEntityIds)
            .map(id => this.doc.getEntity(id))
            .filter((e): e is Entity => e !== undefined);
        this.viewer.renderGrips(selectedEntitiesForGrips);

        // If there's an active edit command at step 0 and user has selected entities, re-run command with selection
        const activeForEdit = this.cmd.active;
        if (activeForEdit && (activeForEdit.step ?? -1) === 0 && isEditCommand && this.selectedEntityIds.size > 0) {
            const ids = Array.from(this.selectedEntityIds).filter(id => {
                const e = this.doc.getEntity(id);
                if (!e) return false;
                const layer = this.doc.layers.getLayer(e.layer);
                if (!layer) return true;
                return layer.isVisible && !layer.isFrozen && !layer.isLocked;
            });
            const cmdName = activeName?.replace('Command', '').toUpperCase();
            if (cmdName && ids.length > 0) {
                const res = this.cmd.execute(cmdName, this.doc.units, ids, this.doc.entities, this.doc);
                return await this.handleResult(res);
            }
        }
    }

    const result = this.cmd.inputPoint(x, y, this.doc.units, (p) => this.doc.getNextId(p), this.doc, this.currentZ)
    return await this.handleResult(result)
  }

  private isContinuousCommand(activeName: string): boolean {
    return [
      'LineCommand', 'PolylineCommand', 'TraceCommand', 'HatchCommand', 
      'OffsetCommand', 'TrimCommand', 'ExtendCommand', 
      'SFilletCommand', 'SChamferCommand'
    ].includes(activeName);
  }
  private async handleResult(cmdResponse: CommandResponse | Promise<CommandResponse> | undefined, isSelectionLoop: boolean = false): Promise<CommandResponse | undefined> {
    const awaited = await cmdResponse;
    if (!awaited) return undefined;

    let result: CommandResponse = awaited;

    if (typeof result === 'object') {
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
      
      if (result instanceof Entity) {
        entity = result;
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

        const isContinuous = this.isContinuousCommand(activeName || "");

        if (!isContinuous || isCloseAction) {
          if (!isSelectionLoop) {
            this.terminateActiveCommand();
          }
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
        onLayersChange: () => { if (this.layersWindowUpdate) this.layersWindowUpdate(); },
        onEntitiesChange: () => { if (this.objectsWindowUpdate) this.objectsWindowUpdate(); },
        onFilesChange: () => { if (this.filesWindowUpdate) this.filesWindowUpdate(); }
      };

      const actionResult = await (async () => {
          this.doc.history.startTransaction(this.doc.constraints);
          const res = await this.dispatcher.dispatch(result as CommandAction, appContext);
          this.viewer.updateConstraints(this.doc);
          this.doc.history.commitTransaction(this.doc.constraints);
          this.updateDoFVisualization();

          if (typeof res === 'string' && ((result as CommandAction).action === 'fillet' || (result as CommandAction).action === 'chamfer')) {
              this.printToCommandLine(res);
              const isError = res.toLowerCase().includes("cannot") || 
                              result.toLowerCase().includes("fail") || 
                              result.toLowerCase().includes("only supported");
              NotificationManager.getInstance().show(res, isError ? "error" : "success");
          }

          return res;
      })();

      if (actionResult !== undefined) {
        // If the action resulted in clearing the active command, ensure markers are cleared too
        const activeName = this.cmd.active?.constructor.name || "";

        if (!this.cmd.active || (this.cmd.active && !this.isContinuousCommand(activeName))) {
            if (!isSelectionLoop) {
                this.terminateActiveCommand();
            }
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
    
    // Trigger immediate BREP persistence for 3D solids with snapshots (Bug fix)
    // This avoids data loss if the user refreshes within the 2-second auto-save debounce window.
    if (entity instanceof Solid3D && entity.brepSnapshot) {
      this.persistence.persistBRepNow(entity, this.doc);
    }

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
    this.triggerObjectsWindowUpdate();
  }

  public syncFromDocument() {
    this.viewer.clear();
    for (const entity of this.doc.getAllEntities()) {
      this.addEntity(entity, false, false);
    }
    this.viewer.updateConstraints(this.doc);
    this.viewer.render();
    this.updateDoFVisualization();

    if (this.propertiesWindow) {
      const selectedEntities = Array.from(this.selectedEntityIds)
          .map(id => this.doc.getEntity(id))
          .filter((e): e is Entity => e !== undefined);
      this.propertiesWindow.update(selectedEntities);
    }

    this.updateGizmoAttachment();
    this.triggerObjectsWindowUpdate();
  }

  public updateDoFVisualization(): void {
    const constraints = this.doc.constraints;
    if (!constraints || constraints.length === 0) {
      this.viewer.clearDoFColors();
      this.sketchToolWindow?.clearDoFBadge();
      return;
    }
    const result = analyzeDocumentDoF(this.doc, constraints);
    this.viewer.setDoFColors(result.entityStatus, result.dof);
    this.sketchToolWindow?.runDoFAnalysis();
  }

  public updateGizmoAttachment() {
    const activeCmdName = this.cmd.active?.constructor.name;
    if (activeCmdName === 'BooleanCommand') {
      this.gizmoManager.detach();
      return;
    }

    if (this.selectedEntityIds.size === 1) {
      const id = Array.from(this.selectedEntityIds)[0];
      const entity = this.doc.getEntity(id);
      
      const isSolidBlock = entity instanceof Insert && (() => {
        const block = this.doc.blocks.getBlock(entity.blockName);
        if (!block) return false;
        return block.entities.some(e => e instanceof Solid3D);
      })();

      if (entity instanceof Solid3D || isSolidBlock) {
        let obj = this.viewer.scene.getObjectByName(id);
        if (!obj) {
          this.viewer.scene.traverse(child => {
            if (child.name === id) obj = child;
          });
        }
        if (obj && obj.parent && obj.parent.name === id) {
          obj = obj.parent;
        }
        if (obj) {
          this.gizmoManager.attachToObject(obj, entity as any);
          return;
        }
      }
    }
    this.gizmoManager.detach();
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
    this.viewer.setControlPointsVisibility(false);
    this.doc.history.commitTransaction(); // Commit any dangling transaction (e.g. from PLINE)
    this.viewer.setHelpers(null);
    this.viewer.setPreview(null);
    this.viewer.setActivePointMarker(null, null);
    this.viewer.setBaseLine(null, null);
    this.viewer.clearBoundaryMarkers();
    this.viewer.setHighlight(Array.from(this.selectedEntityIds));
    this.updateGizmoAttachment();
    this.updatePropertiesWindow();
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
