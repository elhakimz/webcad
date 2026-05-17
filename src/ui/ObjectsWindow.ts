import { ToolWindow } from "./ToolWindow";
import { App } from "../app";
import { Entity } from "../core/model/Entity";
import { Solid3D } from "../core/model/Solid3D";
import { Dimension } from "../core/model/Dimension";
import { Insert } from "../core/model/Insert";
import { PersistenceService } from "../core/persistence/PersistenceService";
import { OpenCascadeService } from "../core/io/OpenCascadeService";

export class ObjectsWindow {
  private container: HTMLElement;
  private expandedPaths: Set<string> = new Set([
    "Project",
    "Project/2D/Sketch",
    "Project/3D/Solid",
    "Project/Dimensions/Constraints",
    "Project/2D/Sketch/objects",
    "Project/2D/Sketch/blocks",
    "Project/3D/Solid/objects",
    "Project/3D/Solid/blocks"
  ]);

  constructor(private toolWindow: ToolWindow, private app: App) {
    this.container = document.createElement("div");
    this.container.className = "objects-window-inner";
    this.container.style.padding = "10px";
    this.container.style.overflowY = "auto";
    this.container.style.height = "100%";
    this.container.style.color = "var(--text-color)";
    this.container.style.fontFamily = "var(--font-family)";
    
    // Inject Custom Styles dynamically
    this.injectStyles();

    this.toolWindow.setContent(this.container);

    // Register observer callback
    this.app.setObjectsWindowUpdate(() => this.refresh());

    // Initial render
    this.refresh();
  }

  private injectStyles() {
    const styleId = "objects-window-styles";
    if (document.getElementById(styleId)) return;

    const style = document.createElement("style");
    style.id = styleId;
    style.textContent = `
      .objects-window-inner {
        scrollbar-width: thin;
        scrollbar-color: var(--border-color) transparent;
      }
      .objects-tree {
        list-style-type: none;
        padding-left: 0;
        margin: 0;
        user-select: none;
      }
      .objects-tree ul {
        list-style-type: none;
        padding-left: 14px;
        margin: 0;
      }
      .tree-item {
        margin: 2px 0;
      }
      .tree-node-row {
        display: flex;
        align-items: center;
        padding: 4px 6px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        transition: all 0.15s ease;
        position: relative;
        font-family: var(--font-mono);
        font-size: 11px;
        color: var(--text-color);
        gap: 6px;
        border: 1px solid transparent;
      }
      .tree-node-row:hover {
        background-color: rgba(255, 255, 255, 0.05);
        border-color: rgba(255, 255, 255, 0.02);
      }
      .tree-node-row.selected {
        background-color: rgba(59, 130, 246, 0.15);
        border-color: rgba(59, 130, 246, 0.3);
        color: #ffffff;
      }
      .tree-node-chevron {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 12px;
        height: 12px;
        cursor: pointer;
        transition: transform 0.2s ease;
        opacity: 0.6;
        font-size: 9px;
      }
      .tree-node-chevron.expanded {
        transform: rotate(90deg);
      }
      .tree-node-icon {
        font-size: 12px;
        opacity: 0.85;
      }
      .tree-node-label {
        font-weight: 600;
      }
      .tree-node-sublabel {
        opacity: 0.5;
        font-weight: normal;
        margin-left: 4px;
      }
      .tree-node-actions {
        margin-left: auto;
        display: none;
        gap: 4px;
        align-items: center;
      }
      .tree-node-row:hover .tree-node-actions {
        display: flex;
      }
      .tree-action-btn {
        cursor: pointer;
        width: 16px;
        height: 16px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-sm);
        transition: all 0.15s ease;
        opacity: 0.6;
        font-size: 10px;
        background-color: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
      }
      .tree-action-btn:hover {
        opacity: 1;
        transform: scale(1.1);
      }
      .tree-action-btn.zoom-btn:hover {
        color: var(--accent-color);
        background-color: rgba(59, 130, 246, 0.2);
        border-color: var(--accent-color);
      }
      .tree-action-btn.delete-btn:hover {
        color: #ff4d4d;
        background-color: rgba(239, 68, 68, 0.2);
        border-color: #ff4d4d;
      }
      .empty-tree-message {
        padding: 12px;
        text-align: center;
        opacity: 0.4;
        font-style: italic;
        font-size: 11px;
      }
    `;
    document.head.appendChild(style);
  }

  public refresh() {
    this.container.innerHTML = "";

    const entities = this.app.doc.getAllEntities();
    const projName = PersistenceService.getInstance().activeProjectName || "Untitled";

    // Build the dynamic categorization tree
    const rootUl = document.createElement("ul");
    rootUl.className = "objects-tree";

    const sketchObjects: Entity[] = [];
    const sketchBlocks: Insert[] = [];
    const solidObjects: Entity[] = [];
    const solidBlocks: Insert[] = [];
    const dimensionsList: Entity[] = [];

    for (const entity of entities) {
      if (entity instanceof Dimension || (entity as any).type === "Dimension") {
        dimensionsList.push(entity);
      } else if (entity instanceof Insert) {
        // Classify block inserts based on contents
        const blockDef = this.app.doc.blocks.getBlock(entity.blockName);
        const hasSolids = blockDef?.entities.some(e => e instanceof Solid3D || (e as any).type === "Solid3D") ?? false;
        if (hasSolids) {
          solidBlocks.push(entity);
        } else {
          sketchBlocks.push(entity);
        }
      } else if (entity instanceof Solid3D || (entity as any).type === "Solid3D") {
        solidObjects.push(entity);
      } else {
        // Basic 2D drafting entities
        sketchObjects.push(entity);
      }
    }

    // Render the tree nodes hierarchically
    const projectNode = this.createFolderNode("Project", `Project: ${projName}`, "📂", null, rootUl);
    
    if (this.isExpanded("Project")) {
      const childrenUl = document.createElement("ul");
      projectNode.appendChild(childrenUl);

      // Category 1: 2D/Sketch
      const sketchNode = this.createFolderNode("Project/2D/Sketch", "2D/Sketch", "📐", "Project", childrenUl);
      if (this.isExpanded("Project/2D/Sketch")) {
        const sketchUl = document.createElement("ul");
        sketchNode.appendChild(sketchUl);

        // objects sub-folder
        const sketchObjsNode = this.createFolderNode("Project/2D/Sketch/objects", `objects (${sketchObjects.length})`, "📁", "Project/2D/Sketch", sketchUl);
        if (this.isExpanded("Project/2D/Sketch/objects")) {
          const objsUl = document.createElement("ul");
          sketchObjsNode.appendChild(objsUl);
          if (sketchObjects.length === 0) {
            this.createEmptyMessageNode(objsUl);
          } else {
            sketchObjects.forEach(e => this.createEntityNode(e, objsUl));
          }
        }

        // blocks sub-folder
        const sketchBlksNode = this.createFolderNode("Project/2D/Sketch/blocks", `blocks (${sketchBlocks.length})`, "📁", "Project/2D/Sketch", sketchUl);
        if (this.isExpanded("Project/2D/Sketch/blocks")) {
          const blksUl = document.createElement("ul");
          sketchBlksNode.appendChild(blksUl);
          if (sketchBlocks.length === 0) {
            this.createEmptyMessageNode(blksUl);
          } else {
            sketchBlocks.forEach(e => this.createEntityNode(e, blksUl));
          }
        }
      }

      // Category 2: 3D/Solid
      const solidNode = this.createFolderNode("Project/3D/Solid", "3D/Solid", "🧊", "Project", childrenUl);
      if (this.isExpanded("Project/3D/Solid")) {
        const solidUl = document.createElement("ul");
        solidNode.appendChild(solidUl);

        // objects sub-folder
        const solidObjsNode = this.createFolderNode("Project/3D/Solid/objects", `objects (${solidObjects.length})`, "📁", "Project/3D/Solid", solidUl);
        if (this.isExpanded("Project/3D/Solid/objects")) {
          const objsUl = document.createElement("ul");
          solidObjsNode.appendChild(objsUl);
          if (solidObjects.length === 0) {
            this.createEmptyMessageNode(objsUl);
          } else {
            solidObjects.forEach(e => this.createEntityNode(e, objsUl));
          }
        }

        // blocks sub-folder
        const solidBlksNode = this.createFolderNode("Project/3D/Solid/blocks", `blocks (${solidBlocks.length})`, "📁", "Project/3D/Solid", solidUl);
        if (this.isExpanded("Project/3D/Solid/blocks")) {
          const blksUl = document.createElement("ul");
          solidBlksNode.appendChild(blksUl);
          if (solidBlocks.length === 0) {
            this.createEmptyMessageNode(blksUl);
          } else {
            solidBlocks.forEach(e => this.createEntityNode(e, blksUl));
          }
        }
      }

      // Category 3: Dimensions/Constraints
      const dimsNode = this.createFolderNode("Project/Dimensions/Constraints", `Dimensions/Constraints (${dimensionsList.length})`, "📏", "Project", childrenUl);
      if (this.isExpanded("Project/Dimensions/Constraints")) {
        const dimsUl = document.createElement("ul");
        dimsNode.appendChild(dimsUl);
        if (dimensionsList.length === 0) {
          this.createEmptyMessageNode(dimsUl);
        } else {
          dimensionsList.forEach(e => this.createEntityNode(e, dimsUl));
        }
      }
    }

    this.container.appendChild(rootUl);
  }

  private isExpanded(path: string): boolean {
    return this.expandedPaths.has(path);
  }

  private toggleExpanded(path: string) {
    if (this.expandedPaths.has(path)) {
      this.expandedPaths.delete(path);
    } else {
      this.expandedPaths.add(path);
    }
    this.refresh();
  }

  private createFolderNode(path: string, label: string, icon: string, parentPath: string | null, parentElement: HTMLElement): HTMLElement {
    const li = document.createElement("li");
    li.className = "tree-item";

    const row = document.createElement("div");
    row.className = "tree-node-row";

    const chevron = document.createElement("span");
    chevron.className = "tree-node-chevron";
    chevron.innerHTML = "▶";
    if (this.isExpanded(path)) {
      chevron.classList.add("expanded");
    }
    chevron.addEventListener("click", (e) => {
      e.stopPropagation();
      this.toggleExpanded(path);
    });

    const nodeIcon = document.createElement("span");
    nodeIcon.className = "tree-node-icon";
    nodeIcon.textContent = icon;

    const nodeLabel = document.createElement("span");
    nodeLabel.className = "tree-node-label";
    nodeLabel.textContent = label;

    row.appendChild(chevron);
    row.appendChild(nodeIcon);
    row.appendChild(nodeLabel);

    row.addEventListener("click", () => {
      this.toggleExpanded(path);
    });

    li.appendChild(row);
    parentElement.appendChild(li);
    return li;
  }

  private createEntityNode(entity: Entity, parentElement: HTMLElement) {
    const li = document.createElement("li");
    li.className = "tree-item";

    const row = document.createElement("div");
    row.className = "tree-node-row";

    // Set selected class if active
    if (this.app.selectedEntityIds.has(entity.id)) {
      row.classList.add("selected");
    }

    // Leaf nodes don't need a toggle chevron, just a small placeholder spacer
    const spacer = document.createElement("span");
    spacer.style.width = "12px";
    row.appendChild(spacer);

    const icon = document.createElement("span");
    icon.className = "tree-node-icon";
    icon.textContent = this.getEntityEmoji(entity);
    row.appendChild(icon);

    const labelSpan = document.createElement("span");
    labelSpan.className = "tree-node-label";
    labelSpan.textContent = entity.id; // Display Object ID clearly for naming as requested
    row.appendChild(labelSpan);

    const sublabelSpan = document.createElement("span");
    sublabelSpan.className = "tree-node-sublabel";
    sublabelSpan.textContent = this.getEntityDescription(entity);
    row.appendChild(sublabelSpan);

    // Hover action buttons
    const actions = document.createElement("div");
    actions.className = "tree-node-actions";

    const deleteBtn = document.createElement("span");
    deleteBtn.className = "tree-action-btn delete-btn";
    deleteBtn.innerHTML = "✕";
    deleteBtn.title = "Delete Object";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      this.deleteEntity(entity.id);
    });

    actions.appendChild(deleteBtn);
    row.appendChild(actions);

    row.addEventListener("click", () => {
      this.selectEntity(entity.id);
    });

    row.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      this.focusEntity(entity.id);
    });

    li.appendChild(row);
    parentElement.appendChild(li);
  }

  private createEmptyMessageNode(parentElement: HTMLElement) {
    const li = document.createElement("li");
    const div = document.createElement("div");
    div.className = "empty-tree-message";
    div.textContent = "(No objects)";
    li.appendChild(div);
    parentElement.appendChild(li);
  }

  private getEntityEmoji(entity: Entity): string {
    const name = entity.constructor.name;
    switch (name) {
      case "Line": return "➖";
      case "Circle": return "⭕";
      case "Arc": return "🌙";
      case "Polyline": return "📈";
      case "Ellipse": return "🥚";
      case "Spline": return "〰";
      case "Hatch": return "▒";
      case "Text":
      case "MText": return "🔤";
      case "Point": return "📍";
      case "Solid3D": return "🧊";
      case "Insert": return "🧩";
      case "Dimension": return "📐";
      default: return "📄";
    }
  }

  private getEntityDescription(entity: Entity): string {
    const name = entity.constructor.name;
    const typeStr = (entity as any).type || name;
    
    if (entity instanceof Solid3D) {
      const type = entity.creationParams?.type || "CSG Operation";
      return `[${typeStr}: ${type}]`;
    }

    if (entity instanceof Insert) {
      return `[Block: ${entity.blockName}]`;
    }

    return `[${typeStr}]`;
  }

  private selectEntity(id: string) {
    this.app.selectedEntityIds.clear();
    this.app.selectedEntityIds.add(id);

    const entity = this.app.doc.getEntity(id);
    if (entity && this.app.propertiesWindow) {
      this.app.propertiesWindow.update([entity]);
    }

    this.app.viewer.setHighlight([id]);
    this.app.updateGizmoAttachment();
    this.app.viewer.render();
    this.refresh();
  }

  private focusEntity(id: string) {
    const entity = this.app.doc.getEntity(id);
    if (entity) {
      this.app.viewer.zoomAll([entity]);
    }
  }

  private async deleteEntity(id: string) {
    const entity = this.app.doc.getEntity(id);
    if (entity) {
      if (confirm(`Are you sure you want to delete object ${id}?`)) {
        this.app.doc.history.startTransaction();
        this.app.doc.recordRemove(entity);
        this.app.doc.removeEntity(id);
        this.app.viewer.removeObject(id);
        await PersistenceService.getInstance().onEntityErased(id, entity);
        if (entity instanceof Solid3D || entity.constructor.name === "Solid3D") {
          try {
            await OpenCascadeService.getInstance().releaseShapes([id]);
          } catch (err) {
            console.error("Failed to release shape from OCC worker:", err);
          }
        }
        this.app.doc.updateSpatialIndex();
        this.app.doc.history.commitTransaction();

        this.app.selectedEntityIds.delete(id);
        this.app.syncFromDocument();
        this.app.triggerObjectsWindowUpdate();
      }
    }
  }
}
