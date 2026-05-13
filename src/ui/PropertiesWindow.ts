import { ToolWindow } from "./ToolWindow";
import { Entity } from "../core/model/Entity";
import { App } from "../app";
import { Solid3D } from "../core/model/Solid3D";
import { Polyline } from "../core/model/Polyline";
import { OpenCascadeService } from "../core/io/OpenCascadeService";

export class PropertiesWindow {
  private container: HTMLElement;
  private currentEntities: Entity[] = [];

  constructor(private toolWindow: ToolWindow, private app: App) {
    this.container = document.createElement('div');
    this.container.className = 'properties-window-inner';
    this.container.style.padding = '10px';
    this.container.style.color = 'var(--text-color)';
    this.container.style.fontFamily = 'var(--font-mono)';
    
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
    } else if (entity.constructor.name === "Solid3D") {
      const solid = entity as Solid3D;
      this.addNumberField("Pos X", solid.position.x, (val) => { this.updateSolidPos(solid, 'x', val); });
      this.addNumberField("Pos Y", solid.position.y, (val) => { this.updateSolidPos(solid, 'y', val); });
      this.addNumberField("Pos Z", solid.position.z, (val) => { this.updateSolidPos(solid, 'z', val); });
      
      // Non-editable properties
      this.addPropertyField("Vertices", (solid.positions.length / 3).toString(), true);
      this.addPropertyField("Faces", (solid.indices.length / 3).toString(), true);
      const vol = this.calculateVolume(solid.positions, solid.indices);
      this.addPropertyField("Volume", vol.toFixed(2), true);
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

  private addNumberField(label: string, value: number, onChange: (val: number) => void) {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.marginBottom = '5px';
    
    const lbl = document.createElement('span');
    lbl.textContent = label;
    row.appendChild(lbl);
    
    const input = document.createElement('input');
    input.type = 'number';
    input.value = value.toString();
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
    this.app.doc.history.startTransaction();
    const before = solid.clone(solid.id);
    
    const dx = axis === 'x' ? value - solid.position.x : 0;
    const dy = axis === 'y' ? value - solid.position.y : 0;
    const dz = axis === 'z' ? value - solid.position.z : 0;
    
    solid.position[axis] = value;
    
    this.app.doc.recordTransform(before, solid);
    this.app.doc.history.commitTransaction();
    
    // Sync with worker if it's a transform!
    if (dx !== 0 || dy !== 0 || dz !== 0) {
        OpenCascadeService.getInstance().transformShape(solid.id, dx, dy, dz).then(() => {
            this.app.syncFromDocument();
        }).catch((err: any) => {
            console.error("Failed to sync transform to worker:", err);
            this.app.syncFromDocument();
        });
    } else {
        this.app.syncFromDocument();
    }
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
