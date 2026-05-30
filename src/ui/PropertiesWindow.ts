import { ToolWindow } from "./ToolWindow";
import { Entity } from "../core/model/Entity";
import { App } from "../app";
import { Solid3D } from "../core/model/Solid3D";
import { Insert } from "../core/model/Insert";
import { ImagePlane } from "../core/model/ImagePlane";
import { OpenCascadeService } from "../core/io/OpenCascadeService";
import * as THREE from 'three';
import { Solid3DReevaluator } from "../core/engine/Solid3DReevaluator";


const GLYPHS: Record<string, string> = {
  "Sketch": "▱",
  "Extrude": "▰",
  "Cut": "✂",
  "Fillet": "⌒",
  "Scale": "⤢",
  "Chamfer": "⏃",
  "Shell": "⏍"
};

export class PropertiesWindow {
  private container: HTMLElement;
  private currentEntities: Entity[] = [];
  private activeTab: 'entity' | 'features' = 'entity';
  private expandedFeatures: Set<string> = new Set();

  constructor(private toolWindow: ToolWindow, private app: App) {
    this.container = document.createElement('div');
    this.container.className = 'properties-window-inner';
    this.container.style.padding = '5px';
    this.container.style.color = 'var(--text-color)';
    this.container.style.fontFamily = 'var(--font-mono)';
    this.container.style.fontSize = '10px';
    
    this.toolWindow.setContent(this.container);
    this.renderEmpty();
  }

  public update(entities: Entity[]) {
    this.currentEntities = entities;
    if (entities.length === 0) {
      this.renderEmpty();
    } else if (entities.length === 1) {
      this.renderSingle(entities[0]);
    } else {
      this.renderMulti(entities);
    }
  }

  private renderEmpty() {
    this.container.innerHTML = '<div>No selection</div>';
  }

  private renderSingle(entity: Entity) {
    this.container.innerHTML = '';
    
    if (entity instanceof Solid3D) {
      const solid = entity as Solid3D;
      
      // Render tab bar
      const tabBar = document.createElement('div');
      tabBar.className = 'properties-tab-bar';
      
      const entityTab = document.createElement('div');
      entityTab.className = `properties-tab ${this.activeTab === 'entity' ? 'active' : ''}`;
      entityTab.textContent = 'Entity';
      entityTab.addEventListener('click', () => {
        this.activeTab = 'entity';
        this.renderSingle(entity);
      });
      
      const featuresTab = document.createElement('div');
      featuresTab.className = `properties-tab ${this.activeTab === 'features' ? 'active' : ''}`;
      featuresTab.textContent = 'Features';
      featuresTab.addEventListener('click', () => {
        this.activeTab = 'features';
        this.renderSingle(entity);
      });
      
      tabBar.appendChild(entityTab);
      tabBar.appendChild(featuresTab);
      this.container.appendChild(tabBar);
      
      if (this.activeTab === 'entity') {
        this.renderEntityFields(solid);
      } else {
        this.renderFeaturesTab(solid);
      }
    } else {
      this.activeTab = 'entity'; // Reset
      this.renderEntityFields(entity);
    }
  }

  private renderEntityFields(entity: Entity) {
    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    title.textContent = `Entity: ${entity.constructor.name}`;
    this.container.appendChild(title);

    // ID (Readonly)
    this.addPropertyField("ID", entity.id, true);

    // Layer
    const layers = this.app.doc.layers.listLayers().map(l => l.name);
    this.addSelectField("Layer", entity.layer, layers, (val) => {
      this.updateProperty(entity, 'layer', val);
    });

    // Elevation & Thickness
    this.addNumberField("Elevation", entity.elevation, (val) => { this.updateProperty(entity, 'elevation', val); });
    this.addNumberField("Thickness", entity.thickness, (val) => { this.updateProperty(entity, 'thickness', val); });

    // Entity specific fields
    if (entity.constructor.name === "Line") {
      const line = entity as any;
      this.addNumberField("X1", line.x1, (val) => { this.updateProperty(entity, 'x1', val); });
      this.addNumberField("Y1", line.y1, (val) => { this.updateProperty(entity, 'y1', val); });
      this.addNumberField("X2", line.x2, (val) => { this.updateProperty(entity, 'x2', val); });
      this.addNumberField("Y2", line.y2, (val) => { this.updateProperty(entity, 'y2', val); });
    } else if (entity.constructor.name === "Circle") {
      const circle = entity as any;
      this.addNumberField("X", circle.cx, (val) => { this.updateProperty(entity, 'cx', val); });
      this.addNumberField("Y", circle.cy, (val) => { this.updateProperty(entity, 'cy', val); });
      this.addNumberField("Radius", circle.r, (val) => { this.updateProperty(entity, 'r', val); });
    } else if (entity.constructor.name === "Polyline") {
      const poly = entity as any;
      this.addBooleanField("Closed", poly.closed, (val) => {
        this.updateProperty(entity, 'closed', val);
      });
      this.addPropertyField("Vertices", poly.vertices.length.toString(), true);
    } else if (entity.constructor.name === "Spline") {
      const spline = entity as any;
      this.addBooleanField("Closed", spline.isClosed, (val) => {
        this.app.doc.history.startTransaction();
        const before = spline.clone(spline.id);
        spline.isClosed = val;
        spline.sampledPoints = spline.updateSampledPoints();
        this.app.doc.recordTransform(before, spline);
        this.app.doc.history.commitTransaction();
        this.app.syncFromDocument();
      });
      this.addPropertyField("Control Points", spline.controlPoints.length.toString(), true);
    } else if (entity.constructor.name === "Solid3D") {
      const solid = entity as Solid3D;
      this.addNumberField("Pos X", solid.position.x, (val) => { this.updateSolidPos(solid, 'x', val); });
      this.addNumberField("Pos Y", solid.position.y, (val) => { this.updateSolidPos(solid, 'y', val); });
      this.addNumberField("Pos Z", solid.position.z, (val) => { this.updateSolidPos(solid, 'z', val); });
      
      this.addNumberField("R X", solid.rotation.x * 180 / Math.PI, (val) => { this.updateSolidRot(solid, 'x', val * Math.PI / 180); });
      this.addNumberField("R Y", solid.rotation.y * 180 / Math.PI, (val) => { this.updateSolidRot(solid, 'y', val * Math.PI / 180); });
      this.addNumberField("R Z", solid.rotation.z * 180 / Math.PI, (val) => { this.updateSolidRot(solid, 'z', val * Math.PI / 180); });

      if (solid.creationParams) {
          this.addSeparator();
          const type = solid.creationParams.type;
          const params = solid.creationParams.params as any;

          if (type === "box") {
            this.addNumberField("DX", params.dx ?? 0, (v) => { this.updateCreationParam(solid, 'dx', v); });
            this.addNumberField("DY", params.dy ?? 0, (v) => { this.updateCreationParam(solid, 'dy', v); });
            this.addNumberField("DZ", params.dz ?? 0, (v) => { this.updateCreationParam(solid, 'dz', v); });
          } else if (type === "cylinder") {
            this.addNumberField("Radius", params.radius ?? 0, (v) => { this.updateCreationParam(solid, 'radius', v); });
            this.addNumberField("Height", params.height ?? 0, (v) => { this.updateCreationParam(solid, 'height', v); });
          } else if (type === "sphere") {
            this.addNumberField("Radius", params.r ?? 0, (v) => { this.updateCreationParam(solid, 'r', v); });
          } else if (type === "cone") {
            this.addNumberField("R1", params.r1 ?? 0, (v) => { this.updateCreationParam(solid, 'r1', v); });
            this.addNumberField("R2", params.r2 ?? 0, (v) => { this.updateCreationParam(solid, 'r2', v); });
            this.addNumberField("Height", params.h ?? 0, (v) => { this.updateCreationParam(solid, 'h', v); });
          } else if (type === "torus") {
            this.addNumberField("Major R", params.r1 ?? 0, (v) => { this.updateCreationParam(solid, 'r1', v); });
            this.addNumberField("Minor R", params.r2 ?? 0, (v) => { this.updateCreationParam(solid, 'r2', v); });
          } else if (type === "wedge") {
            this.addNumberField("DX", params.dx ?? 0, (v) => { this.updateCreationParam(solid, 'dx', v); });
            this.addNumberField("DY", params.dy ?? 0, (v) => { this.updateCreationParam(solid, 'dy', v); });
            this.addNumberField("DZ", params.dz ?? 0, (v) => { this.updateCreationParam(solid, 'dz', v); });
            this.addNumberField("LTX", params.ltx ?? 0, (v) => { this.updateCreationParam(solid, 'ltx', v); });
          } else if (type === "pyramid") {
            this.addNumberField("Sides", params.sides ?? 4, (v) => { this.updateCreationParam(solid, 'sides', v); });
            this.addNumberField("Radius", params.radius ?? 0, (v) => { this.updateCreationParam(solid, 'radius', v); });
            this.addNumberField("Height", params.height ?? 0, (v) => { this.updateCreationParam(solid, 'height', v); });
          }
      }
      
      this.addSeparator();

      // Non-editable properties
      this.addPropertyField("Vertices", (solid.positions.length / 3).toString(), true);
      this.addPropertyField("Faces", (solid.indices.length / 3).toString(), true);
      const vol = this.calculateVolume(solid.positions, solid.indices);
      this.addPropertyField("Volume", vol.toFixed(2), true);
    } else if (entity instanceof Insert) {
      const ins = entity;
      this.addNumberField("Pos X", ins.x, (val) => { this.updateProperty(ins, 'x', val); });
      this.addNumberField("Pos Y", ins.y, (val) => { this.updateProperty(ins, 'y', val); });
      this.addNumberField("Pos Z", ins.z || 0, (val) => { this.updateProperty(ins, 'z', val); });
      
      this.addPropertyField("R X", "0", true);
      this.addPropertyField("R Y", "0", true);
      this.addNumberField("R Z", ins.rotation, (val) => { this.updateProperty(ins, 'rotation', val); });
    } else if (entity instanceof ImagePlane) {
      const plane = entity as ImagePlane;
      this.addNumberField("Center X", plane.cx, (val) => { this.updateProperty(plane, 'cx', val); });
      this.addNumberField("Center Y", plane.cy, (val) => { this.updateProperty(plane, 'cy', val); });
      this.addNumberField("Width", plane.width, (val) => { this.updateProperty(plane, 'width', val); });
      this.addNumberField("Height", plane.height, (val) => { this.updateProperty(plane, 'height', val); });
      this.addNumberField("Rotation", plane.rotation * 180 / Math.PI, (val) => { this.updateProperty(plane, 'rotation', val * Math.PI / 180); });
      this.addTextField("Image URL", plane.imageUrl, (val) => { this.updateProperty(plane, 'imageUrl', val); });
      this.addSelectField("Display Mode", plane.displayMode, ['STRETCH', 'FIT', 'ZOOM'], (val) => { this.updateProperty(plane, 'displayMode', val); });
      this.addNumberField("Opacity (0-100)", plane.opacity * 100, (val) => { this.updateProperty(plane, 'opacity', val / 100); });
      if (plane.displayMode === 'ZOOM') {
        this.addNumberField("Zoom Factor", plane.zoomFactor, (val) => { this.updateProperty(plane, 'zoomFactor', val); });
      }
    }
  }

  private addTextField(label: string, value: string, onChange: (val: string) => void) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = '5px';
    
    const lbl = document.createElement('span');
    lbl.textContent = label;
    row.appendChild(lbl);
    
    const input = document.createElement('input');
    input.type = 'text';
    input.value = value;
    input.style.width = '80px';
    input.style.backgroundColor = 'var(--bg-color)';
    input.style.border = '1px solid var(--border-color)';
    input.style.color = 'var(--text-color)';
    input.style.fontFamily = 'var(--font-mono)';
    
    input.addEventListener('change', () => {
      onChange(input.value);
    });
    
    row.appendChild(input);
    this.container.appendChild(row);
  }

  private updateCreationParam(solid: Solid3D, key: string, val: any) {
    if (solid.creationParams) {
      (solid.creationParams.params as any)[key] = val;
      // Also update the base feature node
      const baseFeat = solid.features.find(f => f.id === solid.id + "_base");
      if (baseFeat) {
        baseFeat.parameters[key] = val;
      }
      this.triggerReevaluate(solid);
    }
  }

  private renderFeaturesTab(solid: Solid3D) {
    const container = document.createElement('div');
    container.className = 'feature-tree-container';
    
    solid.features.forEach((feat) => {
      const isBase = feat.id.endsWith('_base');
      const item = document.createElement('div');
      item.className = `feature-node-item ${!feat.isActive ? 'inactive' : ''}`;
      
      const header = document.createElement('div');
      header.className = 'feature-node-header';
      
      // Collapse arrow
      const arrow = document.createElement('span');
      arrow.className = `feature-node-collapse-btn ${this.expandedFeatures.has(feat.id) ? 'expanded' : ''}`;
      arrow.textContent = '▶';
      header.appendChild(arrow);
      
      // Icon
      const icon = document.createElement('div');
      icon.className = 'feature-node-icon';
      icon.textContent = GLYPHS[feat.type] || '■';
      header.appendChild(icon);
      
      // Title
      const title = document.createElement('div');
      title.className = 'feature-node-title';
      title.textContent = feat.type + (isBase ? ' (Base)' : '');
      header.appendChild(title);
      
      // Actions
      const actions = document.createElement('div');
      actions.className = 'feature-node-actions';
      
      // Visibility Toggle
      const toggle = document.createElement('button');
      toggle.className = `feature-node-action-btn active-toggle ${feat.isActive ? 'active' : ''}`;
      toggle.textContent = feat.isActive ? '👁' : '❌';
      toggle.title = feat.isActive ? 'Suppress Feature' : 'Activate Feature';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        feat.isActive = !feat.isActive;
        this.triggerReevaluate(solid);
      });
      actions.appendChild(toggle);
      
      // Delete (Non-base only)
      if (!isBase) {
        const delBtn = document.createElement('button');
        delBtn.className = 'feature-node-action-btn btn-delete';
        delBtn.textContent = '🗑';
        delBtn.title = 'Delete Feature';
        delBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const idx = solid.features.indexOf(feat);
          if (idx > -1) {
            solid.features.splice(idx, 1);
            this.expandedFeatures.delete(feat.id);
            this.triggerReevaluate(solid);
          }
        });
        actions.appendChild(delBtn);
      }

      // NEW: Edit Profile button for Sketches and Extrudes
      if (feat.type === "Sketch" || feat.type === "Extrude") {
        const editBtn = document.createElement('button');
        editBtn.className = 'feature-node-action-btn';
        editBtn.textContent = '✎';
        editBtn.title = 'Cycle Profile Shape (Test UI)';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.onEditProfile(feat, solid);
        });
        actions.appendChild(editBtn);
      }
      
      header.appendChild(actions);
      
      // Header toggle collapse logic
      header.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.feature-node-action-btn')) return;
        
        const isExpanded = this.expandedFeatures.has(feat.id);
        if (isExpanded) {
          this.expandedFeatures.delete(feat.id);
        } else {
          this.expandedFeatures.add(feat.id);
        }
        this.renderSingle(solid);
      });
      
      item.appendChild(header);
      
      // Parameters Panel
      const params = feat.parameters;
      const paramContainer = document.createElement('div');
      paramContainer.className = `feature-node-parameters ${this.expandedFeatures.has(feat.id) ? 'expanded' : ''}`;
      
      if (feat.type === "Sketch" || feat.type === "Extrude") {
        const primType = params.primitiveType || solid.creationParams?.type;
        if (primType === "box") {
          paramContainer.appendChild(this.createParamRow("x", params.x ?? 0, (v) => { params.x = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("y", params.y ?? 0, (v) => { params.y = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("z", params.z ?? 0, (v) => { params.z = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("dx", params.dx ?? 1, (v) => { params.dx = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("dy", params.dy ?? 1, (v) => { params.dy = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("dz", params.dz ?? 1, (v) => { params.dz = v; this.triggerReevaluate(solid); }));
        } else if (primType === "cylinder") {
          paramContainer.appendChild(this.createParamRow("x", params.x ?? 0, (v) => { params.x = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("y", params.y ?? 0, (v) => { params.y = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("z", params.z ?? 0, (v) => { params.z = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("radius", params.radius ?? 1, (v) => { params.radius = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("height", params.height ?? 1, (v) => { params.height = v; this.triggerReevaluate(solid); }));
        } else if (primType === "sphere") {
          paramContainer.appendChild(this.createParamRow("x", params.x ?? 0, (v) => { params.x = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("y", params.y ?? 0, (v) => { params.y = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("z", params.z ?? 0, (v) => { params.z = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("r", params.r ?? 1, (v) => { params.r = v; this.triggerReevaluate(solid); }));
        } else if (primType === "cone") {
          paramContainer.appendChild(this.createParamRow("x", params.x ?? 0, (v) => { params.x = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("y", params.y ?? 0, (v) => { params.y = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("z", params.z ?? 0, (v) => { params.z = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("r", params.r ?? 1, (v) => { params.r = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("h", params.h ?? 1, (v) => { params.h = v; this.triggerReevaluate(solid); }));
        } else if (primType === "torus") {
          paramContainer.appendChild(this.createParamRow("x", params.x ?? 0, (v) => { params.x = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("y", params.y ?? 0, (v) => { params.y = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("z", params.z ?? 0, (v) => { params.z = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("r1", params.r1 ?? 2, (v) => { params.r1 = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("r2", params.r2 ?? 0.5, (v) => { params.r2 = v; this.triggerReevaluate(solid); }));
        } else if (primType === "extrude") {
          paramContainer.appendChild(this.createParamRow("height", params.height ?? 1, (v) => { params.height = v; this.triggerReevaluate(solid); }));
          paramContainer.appendChild(this.createParamRow("thickness", params.thickness ?? 0, (v) => { params.thickness = v; this.triggerReevaluate(solid); }));
        }
      } else if (feat.type === "Fillet") {
        paramContainer.appendChild(this.createParamRow("radius", params.radius ?? 1.0, (v) => { params.radius = v; this.triggerReevaluate(solid); }));
        if (params.edgeIndex !== undefined) {
          paramContainer.appendChild(this.createParamRow("edgeIndex", params.edgeIndex, (v) => { params.edgeIndex = v; this.triggerReevaluate(solid); }));
        } else if (params.faceIndex !== undefined) {
          paramContainer.appendChild(this.createParamRow("faceIndex", params.faceIndex, (v) => { params.faceIndex = v; this.triggerReevaluate(solid); }));
        } else {
          paramContainer.appendChild(this.createParamRow("edgeIndex", 0, (v) => { params.edgeIndex = v; this.triggerReevaluate(solid); }));
        }
      } else if (feat.type === "Scale") {
        paramContainer.appendChild(this.createParamRow("factorX", params.factorX ?? params.factor ?? 1.0, (v) => { params.factorX = v; this.triggerReevaluate(solid); }));
        paramContainer.appendChild(this.createParamRow("factorY", params.factorY ?? params.factor ?? 1.0, (v) => { params.factorY = v; this.triggerReevaluate(solid); }));
        paramContainer.appendChild(this.createParamRow("factorZ", params.factorZ ?? params.factor ?? 1.0, (v) => { params.factorZ = v; this.triggerReevaluate(solid); }));
      } else if (feat.type === "Cut") {
        paramContainer.appendChild(this.createParamRow("x", params.x ?? 0, (v) => { params.x = v; this.triggerReevaluate(solid); }));
        paramContainer.appendChild(this.createParamRow("y", params.y ?? 0, (v) => { params.y = v; this.triggerReevaluate(solid); }));
        paramContainer.appendChild(this.createParamRow("z", params.z ?? 0, (v) => { params.z = v; this.triggerReevaluate(solid); }));
        paramContainer.appendChild(this.createParamRow("dx", params.dx ?? 1, (v) => { params.dx = v; this.triggerReevaluate(solid); }));
        paramContainer.appendChild(this.createParamRow("dy", params.dy ?? 1, (v) => { params.dy = v; this.triggerReevaluate(solid); }));
        paramContainer.appendChild(this.createParamRow("dz", params.dz ?? 1, (v) => { params.dz = v; this.triggerReevaluate(solid); }));
      } else if (feat.type === "Chamfer") {
        paramContainer.appendChild(this.createParamRow("distance", params.distance ?? 1.0, (v) => { params.distance = v; this.triggerReevaluate(solid); }));
        if (params.edgeIndex !== undefined) {
          paramContainer.appendChild(this.createParamRow("edgeIndex", params.edgeIndex, (v) => { params.edgeIndex = v; this.triggerReevaluate(solid); }));
        } else if (params.faceIndex !== undefined) {
          paramContainer.appendChild(this.createParamRow("faceIndex", params.faceIndex, (v) => { params.faceIndex = v; this.triggerReevaluate(solid); }));
        } else {
          paramContainer.appendChild(this.createParamRow("edgeIndex", 0, (v) => { params.edgeIndex = v; this.triggerReevaluate(solid); }));
        }
      } else if (feat.type === "Shell") {
        paramContainer.appendChild(this.createParamRow("thickness", params.thickness ?? 1.0, (v) => { params.thickness = v; this.triggerReevaluate(solid); }));
        const faceIndicesVal = Array.isArray(params.faceIndices) ? params.faceIndices.join(', ') : String(params.faceIndices ?? '');
        paramContainer.appendChild(this.createParamRow("faceIndices", faceIndicesVal, (v) => {
          if (typeof v === 'string') {
            params.faceIndices = v.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
          } else if (typeof v === 'number') {
            params.faceIndices = [v];
          }
          this.triggerReevaluate(solid);
        }));
      }
      
      item.appendChild(paramContainer);
      container.appendChild(item);
    });
    
    this.container.appendChild(container);
    
    // Add dropdown menu at bottom
    const addBar = document.createElement('div');
    addBar.className = 'add-feature-bar';
    
    const dropdown = document.createElement('div');
    dropdown.className = 'add-feature-dropdown';
    
    const btn = document.createElement('button');
    btn.className = 'add-feature-btn';
    btn.textContent = '+ Add Feature';
    
    const menu = document.createElement('div');
    menu.className = 'add-feature-menu';
    
    const featTypes = [
      { type: "Fillet", label: "⌒ Fillet", defaultParams: { radius: 1.0, edgeIndex: 0 } },
      { type: "Chamfer", label: "⏃ Chamfer", defaultParams: { distance: 1.0, edgeIndex: 0 } },
      { type: "Shell", label: "⏍ Shell", defaultParams: { thickness: 1.0, faceIndices: [] } },
      { type: "Scale", label: "⤢ Scale", defaultParams: { factorX: 1.0, factorY: 1.0, factorZ: 1.0 } },
      { type: "Cut", label: "✂ Box Cut", defaultParams: { x: 0, y: 0, z: 0, dx: 2, dy: 2, dz: 2 } }
    ];
    
    featTypes.forEach(ft => {
      const item = document.createElement('div');
      item.className = 'add-feature-menu-item';
      item.textContent = ft.label;
      item.addEventListener('click', () => {
        const newFeat = {
          id: `${solid.id}_feat_${Date.now()}`,
          type: ft.type as any,
          parameters: { ...ft.defaultParams },
          isActive: true
        };
        solid.features.push(newFeat);
        this.expandedFeatures.add(newFeat.id);
        menu.classList.remove('show');
        this.triggerReevaluate(solid);
      });
      menu.appendChild(item);
    });
    
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      menu.classList.toggle('show');
    });
    
    document.addEventListener('click', () => {
      menu.classList.remove('show');
    });
    
    dropdown.appendChild(btn);
    dropdown.appendChild(menu);
    addBar.appendChild(dropdown);
    this.container.appendChild(addBar);
  }

  private createParamRow(label: string, value: any, onChange: (val: any) => void): HTMLElement {
    const row = document.createElement('div');
    row.className = 'parameter-field-row';
    
    const lbl = document.createElement('span');
    lbl.className = 'parameter-field-label';
    lbl.textContent = label;
    row.appendChild(lbl);
    
    const input = document.createElement('input');
    input.className = 'parameter-input';
    input.value = typeof value === 'number' ? value.toFixed(3).replace(/\.?0+$/, '') : String(value ?? '');
    
    const handleValueChange = () => {
      const parsed = parseFloat(input.value);
      onChange(isNaN(parsed) ? input.value : parsed);
    };
    
    input.addEventListener('change', handleValueChange);
    input.addEventListener('blur', handleValueChange);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        handleValueChange();
        input.blur();
      }
    });
    
    row.appendChild(input);
    return row;
  }

  private async onEditProfile(feat: any, solid: Solid3D) {
    console.log(`[PropertiesWindow] onEditProfile for feature: ${feat.type}`);
    const { SketchModel } = await import("../core/sketcher/SketchModel");

    // If sketchData is missing, start with an empty model
    const model = feat.parameters.sketchData 
        ? SketchModel.deserialize(feat.parameters.sketchData)
        : new SketchModel();

    const pts = model.getProfilePoints();
    const newModel = new SketchModel();

    // Use current solid center to keep the new shape in view
    // (Circle at 166, 125 -> Square should be around 166, 125)
    const center = solid.position || { x: 0, y: 0, z: 0 };
    const ox = center.x - 50;
    const oy = center.y - 50;

    if (pts.length <= 4 && pts.length > 3) {
        // Change to Triangle
        const p1 = newModel.addPoint(ox, oy);
        const p2 = newModel.addPoint(ox + 100, oy);
        const p3 = newModel.addPoint(ox + 50, oy + 80);
        newModel.addLine(p1, p2);
        newModel.addLine(p2, p3);
        newModel.addLine(p3, p1);
        this.app.printToCommandLine("UI Test: Switched profile to TRIANGLE");
    } else if (pts.length === 3) {
        // Change to L-Shape (6 points)
        const p1 = newModel.addPoint(ox, oy);
        const p2 = newModel.addPoint(ox + 100, oy);
        const p3 = newModel.addPoint(ox + 100, oy + 40);
        const p4 = newModel.addPoint(ox + 40, oy + 40);
        const p5 = newModel.addPoint(ox + 40, oy + 100);
        const p6 = newModel.addPoint(ox, oy + 100);
        newModel.addLine(p1, p2);
        newModel.addLine(p2, p3);
        newModel.addLine(p3, p4);
        newModel.addLine(p4, p5);
        newModel.addLine(p5, p6);
        newModel.addLine(p6, p1);
        this.app.printToCommandLine("UI Test: Switched profile to L-SHAPE");
    } else {
        // Back to Square
        const p1 = newModel.addPoint(ox, oy);
        const p2 = newModel.addPoint(ox + 100, oy);
        const p3 = newModel.addPoint(ox + 100, oy + 100);
        const p4 = newModel.addPoint(ox, oy + 100);
        newModel.addLine(p1, p2);
        newModel.addLine(p2, p3);
        newModel.addLine(p3, p4);
        newModel.addLine(p4, p1);
        this.app.printToCommandLine("UI Test: Switched profile to SQUARE");
    }

    feat.parameters.sketchData = newModel.serialize();

    // If it's a legacy Extrude feature (no linked sketchId), 
    // update the points property directly so it's consumed by the reevaluator
    if (feat.type === "Extrude" && !feat.parameters.sketchId) {
        feat.parameters.points = newModel.getProfilePoints();
    }

    this.triggerReevaluate(solid);
  }
  private async triggerReevaluate(solid: Solid3D) {
    console.log(`[PropertiesWindow] Triggering re-evaluation for ${solid.id}`);
    
    // SYNC: Before re-evaluating, ensure the base feature parameters 
    // are pushed back to the main creationParams if they are linked.
    if (solid.creationParams && solid.features.length > 0) {
        const baseFeat = solid.features[0];
        // Ensure we are syncing correctly for both Extrude and Sketch types
        if (baseFeat.type === "Extrude" || (baseFeat.type === "Sketch" && solid.creationParams.type === "extrude")) {
            console.log(`[PropertiesWindow] Syncing profile points to creationParams`);
            solid.creationParams.params.points = baseFeat.parameters.points || [];
        }
    }

    try {
        const facetres = (this.app.doc as any).facetres || 5.0;
        
        // 1. Perform the heavy B-Rep regeneration
        const geom = await Solid3DReevaluator.reevaluate(solid, facetres, this.app.doc as any);
        
        // 2. Update Solid3D with new mesh data
        solid.positions = Array.from(geom.getAttribute('position').array) as number[];
        solid.indices = geom.getIndex() ? Array.from(geom.getIndex()!.array) : [];
        
        if (geom.userData) {
          solid.faceMapping = geom.userData.faceMapping;
          solid.edgeLines = geom.userData.edgeLines;
          // IMPORTANT: Update the BRep snapshot so the new shape is what gets saved/loaded
          solid.brepSnapshot = geom.userData.brepSnapshot;
          // Also update baseBrepSnapshot if this is intended to be the new base
          (solid as any).baseBrepSnapshot = geom.userData.brepSnapshot;
          console.log(`[PropertiesWindow] Updated BRep snapshots (${solid.brepSnapshot?.length} bytes)`);
        }

        solid.updateAbsolutePosition();

        // 3. FORCE VIEWER REFRESH
        // We must remove and re-add to ensure Three.js builds a new mesh
        this.app.viewer.removeObject(solid.id);
        this.app.addEntity(solid, false, false);
        
        // 4. Request Render
        this.app.viewer.requestRender();
        console.log(`[PropertiesWindow] Solid ${solid.id} updated and viewer refreshed.`);
        
        // 5. Re-render the UI tab to show updated parameters if any
        this.renderSingle(solid);
        
    } catch (e) {
        console.error("[PropertiesWindow] Re-evaluation failed:", e);
        this.app.printToCommandLine(`Error during regeneration: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private renderMulti(entities: Entity[]) {
    this.container.innerHTML = '';
    
    const title = document.createElement('div');
    title.style.fontWeight = 'bold';
    title.style.marginBottom = '10px';
    title.textContent = `${entities.length} objects selected`;
    this.container.appendChild(title);

    // Common properties like Layer
    const firstLayer = entities[0].layer;
    const allSameLayer = entities.every(e => e.layer === firstLayer);
    
    const layers = this.app.doc.layers.listLayers().map(l => l.name);
    this.addSelectField("Layer", allSameLayer ? firstLayer : "", layers, (val) => {
      this.app.doc.history.startTransaction();
      entities.forEach(entity => {
        const before = entity.clone(entity.id);
        entity.layer = val;
        this.app.doc.recordTransform(before, entity);
      });
      this.app.doc.history.commitTransaction();
      this.app.syncFromDocument();
    });
  }

  private addPropertyField(label: string, value: string, readonly = false) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = '5px';
    
    const lbl = document.createElement('span');
    lbl.textContent = label;
    row.appendChild(lbl);
    
    const val = document.createElement('span');
    val.textContent = value;
    if (readonly) {
      val.style.color = '#888';
    }
    row.appendChild(val);
    
    this.container.appendChild(row);
  }

  private addBooleanField(label: string, value: boolean, onChange: (val: boolean) => void) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = '5px';
    row.style.alignItems = 'center';
    
    const lbl = document.createElement('span');
    lbl.textContent = label;
    row.appendChild(lbl);
    
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = value;
    input.style.backgroundColor = '#222';
    input.style.border = '1px solid #444';
    input.style.color = '#fff';
    
    input.addEventListener('change', () => {
      onChange(input.checked);
    });
    
    row.appendChild(input);
    this.container.appendChild(row);
  }

  private addNumberField(label: string, value: number | undefined | null, onChange: (val: number) => void) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = '5px';
    
    const lbl = document.createElement('span');
    lbl.textContent = label;
    row.appendChild(lbl);
    
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value !== undefined && value !== null ? value.toString() : '0';
    input.style.width = '80px';
    input.style.backgroundColor = 'var(--bg-color)';
    input.style.border = '1px solid var(--border-color)';
    input.style.color = 'var(--text-color)';
    input.style.fontFamily = 'var(--font-mono)';
    
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) {
        onChange(val);
      }
    });
    
    row.appendChild(input);
    this.container.appendChild(row);
  }

  private addSeparator() {
    const hr = document.createElement('hr');
    hr.style.border = 'none';
    hr.style.borderTop = '1px solid var(--border-color)';
    hr.style.margin = '10px 0';
    this.container.appendChild(hr);
  }

  private addSelectField(label: string, value: string, options: string[], onChange: (val: string) => void) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = '5px';
    
    const lbl = document.createElement('span');
    lbl.textContent = label;
    row.appendChild(lbl);
    
    const select = document.createElement('select');
    select.style.width = '85px';
    select.style.backgroundColor = 'var(--bg-color)';
    select.style.border = '1px solid var(--border-color)';
    select.style.color = 'var(--text-color)';
    select.style.fontFamily = 'var(--font-mono)';
    
    if (value === "") {
      const opt = document.createElement('option');
      opt.value = "";
      opt.textContent = "*Varies*";
      select.appendChild(opt);
    }
    
    options.forEach(o => {
      const opt = document.createElement('option');
      opt.value = o;
      opt.textContent = o;
      if (o === value) {
        opt.selected = true;
      }
      select.appendChild(opt);
    });
    
    select.addEventListener('change', () => {
      onChange(select.value);
    });
    
    row.appendChild(select);
    this.container.appendChild(row);
  }

  private updateProperty(entity: Entity, property: string, value: any) {
    this.app.doc.history.startTransaction();
    const before = entity.clone(entity.id);
    (entity as any)[property] = value;
    this.app.doc.recordTransform(before, entity);
    this.app.doc.history.commitTransaction();
    this.app.syncFromDocument();
  }

  private updateSolidPos(solid: Solid3D, axis: 'x' | 'y' | 'z', value: number) {
    const dx = axis === 'x' ? value - solid.position.x : 0;
    const dy = axis === 'y' ? value - solid.position.y : 0;
    const dz = axis === 'z' ? value - solid.position.z : 0;
    
    if (dx === 0 && dy === 0 && dz === 0) return;
    
    const before = solid.clone(solid.id) as Solid3D;
    
    const isRawMesh = !solid.creationParams && !solid.brepSnapshot;
    if (isRawMesh) {
      solid.move3D(dx, dy, dz);
      
      this.app.doc.history.startTransaction();
      this.app.doc.recordTransform(before, solid);
      this.app.doc.history.commitTransaction();
      
      this.app.addEntity(solid, false, false);
      this.app.syncFromDocument();
      return;
    }
    
    const importPromise = solid.brepSnapshot 
      ? OpenCascadeService.getInstance().importBRep(solid.id, solid.brepSnapshot)
      : Promise.resolve();
      
    importPromise.then(() => {
      return OpenCascadeService.getInstance().transformShape(solid.id, dx, dy, dz);
    }).then((geom) => {
      solid.positions = Array.from(geom.attributes.position.array);
      solid.indices = geom.index ? Array.from(geom.index.array) : [];
      if (geom.userData) {
        solid.faceMapping = geom.userData.faceMapping;
        solid.edgeLines = geom.userData.edgeLines;
        solid.brepSnapshot = geom.userData.brepSnapshot;
      }
      solid.updateAbsolutePosition();
      
      this.app.doc.history.startTransaction();
      this.app.doc.recordTransform(before, solid);
      this.app.doc.history.commitTransaction();
      
      this.app.addEntity(solid, false, false);
      this.app.syncFromDocument();
    }).catch((err: unknown) => {
      console.error("Failed to sync transform to worker:", err);
      this.app.syncFromDocument();
    });
  }

  private updateSolidRot(solid: Solid3D, axis: 'x' | 'y' | 'z', value: number) {
    const drx = axis === 'x' ? value - solid.rotation.x : 0;
    const dry = axis === 'y' ? value - solid.rotation.y : 0;
    const drz = axis === 'z' ? value - solid.rotation.z : 0;
    
    if (drx === 0 && dry === 0 && drz === 0) return;
    
    const before = solid.clone(solid.id) as Solid3D;
    
    const isRawMesh = !solid.creationParams && !solid.brepSnapshot;
    if (isRawMesh) {
      const center = new THREE.Vector3(solid.position.x, solid.position.y, solid.position.z);
      const euler = new THREE.Euler(drx, dry, drz, 'XYZ');
      const quat = new THREE.Quaternion().setFromEuler(euler);
      
      const pos = solid.positions;
      const len = pos.length;
      const v = new THREE.Vector3();
      for (let i = 0; i < len; i += 3) {
        v.set(pos[i], pos[i + 1], pos[i + 2]).sub(center).applyQuaternion(quat).add(center);
        pos[i] = v.x;
        pos[i + 1] = v.y;
        pos[i + 2] = v.z;
      }
      
      const edgeLines = solid.edgeLines;
      if (edgeLines) {
        const numEdges = edgeLines.length;
        for (let e = 0; e < numEdges; e++) {
          const edge = edgeLines[e];
          const edgeLen = edge.length;
          for (let i = 0; i < edgeLen; i += 3) {
            v.set(edge[i], edge[i + 1], edge[i + 2]).sub(center).applyQuaternion(quat).add(center);
            edge[i] = v.x;
            edge[i + 1] = v.y;
            edge[i + 2] = v.z;
          }
        }
      }
      
      solid.rotation[axis] = value;
      solid.updateAbsolutePosition();
      
      this.app.doc.history.startTransaction();
      this.app.doc.recordTransform(before, solid);
      this.app.doc.history.commitTransaction();
      
      this.app.addEntity(solid, false, false);
      this.app.syncFromDocument();
      return;
    }
    
    const importPromise = solid.brepSnapshot 
      ? OpenCascadeService.getInstance().importBRep(solid.id, solid.brepSnapshot)
      : Promise.resolve();
      
    importPromise.then(() => {
      return OpenCascadeService.getInstance().rotateShape(solid.id, drx, dry, drz, solid.position.x, solid.position.y, solid.position.z);
    }).then((geom) => {
      solid.positions = Array.from(geom.attributes.position.array);
      solid.indices = geom.index ? Array.from(geom.index.array) : [];
      if (geom.userData) {
        solid.faceMapping = geom.userData.faceMapping;
        solid.edgeLines = geom.userData.edgeLines;
        solid.brepSnapshot = geom.userData.brepSnapshot;
      }
      solid.rotation[axis] = value;
      solid.updateAbsolutePosition();
      
      this.app.doc.history.startTransaction();
      this.app.doc.recordTransform(before, solid);
      this.app.doc.history.commitTransaction();
      
      this.app.addEntity(solid, false, false);
      this.app.syncFromDocument();
    }).catch((err: unknown) => {
      console.error("Failed to sync transform to worker:", err);
      this.app.syncFromDocument();
    });
  }

  private calculateVolume(positions: number[], indices: number[]): number {
    let volume = 0;
    for (let i = 0; i < indices.length; i += 3) {
      const i1 = indices[i] * 3;
      const i2 = indices[i+1] * 3;
      const i3 = indices[i+2] * 3;
      
      const x1 = positions[i1], y1 = positions[i1+1], z1 = positions[i1+2];
      const x2 = positions[i2], y2 = positions[i2+1], z2 = positions[i2+2];
      const x3 = positions[i3], y3 = positions[i3+1], z3 = positions[i3+2];
      
      volume += (-x3*y2*z1 + x2*y3*z1 + x3*y1*z2 - x1*y3*z2 - x2*y1*z3 + x1*y2*z3);
    }
    return Math.abs(volume / 6);
  }
}
