import { ToolWindow } from "./ToolWindow"
import { App } from "../app"
import { NotificationManager } from "./NotificationManager"
import { DocumentConstraint, DocumentPointRef, solveDocumentConstraints, getPointCoords } from "../core/engine/SketchSolver"
import { Entity } from "../core/model/Entity"
import { Line } from "../core/model/Line"
import { Circle } from "../core/model/Circle"
import { Arc } from "../core/model/Arc"
import { Polyline } from "../core/model/Polyline"
import { Text } from "../core/model/Text"
import { MText } from "../core/model/MText"
import { Point } from "../core/model/Point"

export class SketchToolWindow {
  private container: HTMLElement;
  private selectedPointRefs: Set<string> = new Set(); // serialized "entityId::pointId"
  private selectedElementIds: Set<string> = new Set(); // entityId

  constructor(private toolWindow: ToolWindow, private app: App) {
    this.container = document.createElement('div');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';
    this.container.style.padding = '8px';
    this.container.style.boxSizing = 'border-box';
    this.container.style.gap = '8px';

    this.createUI();
    this.toolWindow.setContent(this.container);

    // Refresh UI on selection change in viewport
    this.app.viewer.canvas.addEventListener('mouseup', () => {
      setTimeout(() => this.pruneAndRefresh(), 100);
    });

    // Also refresh on undo/redo to keep constraints list sync'd
    const originalUndo = this.app.doc.undo.bind(this.app.doc);
    this.app.doc.undo = () => {
      originalUndo();
      this.app.viewer.updateConstraints(this.app.doc);
      // Re-render entities after undo
      this.app.doc.entities.forEach(ent => {
        this.app.addEntity(ent, false, false);
      });
      // Re-render highlights and grips for currently selected entities
      this.app.viewer.setHighlight(Array.from(this.app.selectedEntityIds));
      const selectedEntitiesForGrips = Array.from(this.app.selectedEntityIds)
        .map(id => this.app.doc.getEntity(id))
        .filter((ent): ent is Entity => ent !== undefined);
      this.app.viewer.renderGrips(selectedEntitiesForGrips);

      this.app.viewer.requestRender();
      this.refresh();
    };

    const originalRedo = this.app.doc.redo.bind(this.app.doc);
    this.app.doc.redo = () => {
      originalRedo();
      this.app.viewer.updateConstraints(this.app.doc);
      // Re-render entities after redo
      this.app.doc.entities.forEach(ent => {
        this.app.addEntity(ent, false, false);
      });
      // Re-render highlights and grips for currently selected entities
      this.app.viewer.setHighlight(Array.from(this.app.selectedEntityIds));
      const selectedEntitiesForGrips = Array.from(this.app.selectedEntityIds)
        .map(id => this.app.doc.getEntity(id))
        .filter((ent): ent is Entity => ent !== undefined);
      this.app.viewer.renderGrips(selectedEntitiesForGrips);

      this.app.viewer.requestRender();
      this.refresh();
    };
  }

  private pruneAndRefresh() {
    // 1. Gather all active entity IDs and valid points in current selection
    const activeSelectedIds = this.app.selectedEntityIds;
    const validPointRefs = new Set<string>();

    activeSelectedIds.forEach(id => {
      const ent = this.app.doc.getEntity(id);
      if (ent) {
        if (ent instanceof Line) {
          validPointRefs.add(`${id}::start`);
          validPointRefs.add(`${id}::end`);
        } else if (ent instanceof Circle) {
          validPointRefs.add(`${id}::center`);
        } else if (ent instanceof Arc) {
          validPointRefs.add(`${id}::center`);
          validPointRefs.add(`${id}::start`);
          validPointRefs.add(`${id}::end`);
        } else if (ent instanceof Polyline) {
          ent.vertices.forEach((_, idx) => {
            validPointRefs.add(`${id}::vertex_${idx}`);
          });
        } else if (ent instanceof Text) {
          validPointRefs.add(`${id}::position`);
        } else if (ent instanceof MText) {
          validPointRefs.add(`${id}::position`);
        } else if (ent instanceof Point) {
          validPointRefs.add(`${id}::position`);
        }
      }
    });

    // 2. Prune selected points that are no longer valid or selected
    this.selectedPointRefs.forEach(refKey => {
      if (!validPointRefs.has(refKey)) {
        this.selectedPointRefs.delete(refKey);
      }
    });

    // 3. Prune selected elements that are no longer in selection
    this.selectedElementIds.forEach(id => {
      const baseId = id.includes('::') ? id.split('::')[0] : id;
      if (!activeSelectedIds.has(baseId)) {
        this.selectedElementIds.delete(id);
      }
    });

    this.refresh();
  }

  private createUI() {
    this.container.innerHTML = '';

    // Style overrides for consistent professional retro/monospace styling
    const style = document.createElement('style');
    style.textContent = `
      .sketch-section-title {
        font-size: 10px;
        font-weight: bold;
        color: var(--accent-color, #00ffff);
        text-transform: uppercase;
        margin-top: 6px;
        margin-bottom: 3px;
        letter-spacing: 0.5px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        padding-bottom: 2px;
      }
      .sketch-list-container {
        max-height: 120px;
        overflow-y: auto;
        border: 1px solid var(--border-color, #444);
        background-color: var(--bg-color, #1a1a1a);
        padding: 4px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-family: var(--font-mono, monospace);
        font-size: 11px;
      }
      .sketch-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 3px 6px;
        cursor: pointer;
        border-radius: 2px;
        transition: background 0.15s;
      }
      .sketch-item:hover {
        background-color: rgba(255,255,255,0.05);
      }
      .sketch-item.selected {
        background-color: rgba(0, 255, 255, 0.15);
        border: 1px solid rgba(0, 255, 255, 0.3);
      }
      .sketch-btn {
        background-color: var(--panel-bg, #222);
        color: var(--text-color, #fff);
        border: 1px solid var(--border-color, #444);
        padding: 4px 8px;
        font-size: 11px;
        font-family: var(--font-mono, monospace);
        cursor: pointer;
        text-transform: uppercase;
        font-weight: bold;
        transition: all 0.15s;
        border-radius: 2px;
      }
      .sketch-btn:hover {
        border-color: var(--accent-color, #00ffff);
        color: var(--accent-color, #00ffff);
        background-color: rgba(0,255,255,0.05);
      }
      .sketch-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        border-color: #444 !important;
        color: #777 !important;
        background-color: transparent !important;
      }
    `;
    this.container.appendChild(style);

    // Active Sketch Mode UI
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.borderBottom = '1px solid var(--border-color)';
    header.style.paddingBottom = '6px';
    header.style.flexShrink = '0';

    const titleSpan = document.createElement('span');
    titleSpan.textContent = `2D PARAMETRIC SOLVER`;
    titleSpan.style.fontFamily = 'var(--font-mono, monospace)';
    titleSpan.style.fontSize = '11px';
    titleSpan.style.fontWeight = 'bold';
    titleSpan.style.color = 'var(--accent-color)';
    header.appendChild(titleSpan);

    this.container.appendChild(header);

    // Scrollable content area
    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.flex = '1';
    content.style.overflowY = 'auto';
    content.style.gap = '8px';

    // 1. Vertices list from selected viewport entities
    const ptsTitle = document.createElement('div');
    ptsTitle.className = 'sketch-section-title';
    ptsTitle.textContent = 'Selected Vertices';
    content.appendChild(ptsTitle);

    const ptsList = document.createElement('div');
    ptsList.className = 'sketch-list-container';
    ptsList.style.minHeight = '60px';

    const selectedIds = this.app.selectedEntityIds;
    const vertexRefs: DocumentPointRef[] = [];

    selectedIds.forEach(id => {
      const ent = this.app.doc.getEntity(id);
      if (ent) {
        if (ent instanceof Line) {
          vertexRefs.push({ entityId: id, pointId: 'start' });
          vertexRefs.push({ entityId: id, pointId: 'end' });
        } else if (ent instanceof Circle) {
          vertexRefs.push({ entityId: id, pointId: 'center' });
        } else if (ent instanceof Arc) {
          vertexRefs.push({ entityId: id, pointId: 'center' });
          vertexRefs.push({ entityId: id, pointId: 'start' });
          vertexRefs.push({ entityId: id, pointId: 'end' });
        } else if (ent instanceof Polyline) {
          ent.vertices.forEach((_, idx) => {
            vertexRefs.push({ entityId: id, pointId: `vertex_${idx}` });
          });
        } else if (ent instanceof Text) {
          vertexRefs.push({ entityId: id, pointId: 'position' });
        } else if (ent instanceof MText) {
          vertexRefs.push({ entityId: id, pointId: 'position' });
        } else if (ent instanceof Point) {
          vertexRefs.push({ entityId: id, pointId: 'position' });
        }
      }
    });

    if (vertexRefs.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'Select drawing elements in viewport to list vertices.';
      empty.style.color = '#555';
      empty.style.padding = '4px';
      ptsList.appendChild(empty);
    } else {
      vertexRefs.forEach(ref => {
        const refKey = `${ref.entityId}::${ref.pointId}`;
        const item = document.createElement('div');
        item.className = `sketch-item ${this.selectedPointRefs.has(refKey) ? 'selected' : ''}`;

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.checked = this.selectedPointRefs.has(refKey);
        chk.style.cursor = 'pointer';

        const coords = getPointCoords(this.app.doc, ref);
        const coordText = coords ? `(${coords.x.toFixed(1)}, ${coords.y.toFixed(1)})` : '';
        const labelText = `${ref.entityId.split('_')[0]} [${ref.pointId}]: ${coordText}`;

        const txt = document.createElement('span');
        txt.textContent = labelText;

        item.appendChild(chk);
        item.appendChild(txt);

        const toggleSelect = () => {
          if (this.selectedPointRefs.has(refKey)) {
            this.selectedPointRefs.delete(refKey);
          } else {
            this.selectedPointRefs.add(refKey);
          }
          this.refresh();
        };

        chk.onchange = (e) => {
          e.stopPropagation();
          toggleSelect();
        };
        item.onclick = toggleSelect;

        ptsList.appendChild(item);
      });
    }
    content.appendChild(ptsList);

    // 2. Elements list from selected viewport entities
    const elTitle = document.createElement('div');
    elTitle.className = 'sketch-section-title';
    elTitle.textContent = 'Selected Elements';
    content.appendChild(elTitle);

    const elList = document.createElement('div');
    elList.className = 'sketch-list-container';
    elList.style.minHeight = '40px';

    const selectedEntities = Array.from(selectedIds)
      .map(id => this.app.doc.getEntity(id))
      .filter((e): e is Entity => e instanceof Line || e instanceof Circle || e instanceof Arc || e instanceof Polyline || e instanceof Text || e instanceof MText || e instanceof Point);

    if (selectedEntities.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'Select drawing elements in viewport.';
      empty.style.color = '#555';
      empty.style.padding = '4px';
      elList.appendChild(empty);
    } else {
      selectedEntities.forEach(ent => {
        if (ent instanceof Polyline) {
          const numSegments = ent.closed ? ent.vertices.length : ent.vertices.length - 1;
          for (let i = 0; i < numSegments; i++) {
            const segKey = `${ent.id}::segment_${i}`;
            const item = document.createElement('div');
            item.className = `sketch-item ${this.selectedElementIds.has(segKey) ? 'selected' : ''}`;

            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = this.selectedElementIds.has(segKey);
            chk.style.cursor = 'pointer';

            const txt = document.createElement('span');
            txt.textContent = `Polyline Segment: ${ent.id.split('_')[0]} [Seg ${i}]`;

            item.appendChild(chk);
            item.appendChild(txt);

            const toggleSelect = () => {
              if (this.selectedElementIds.has(segKey)) {
                this.selectedElementIds.delete(segKey);
              } else {
                this.selectedElementIds.add(segKey);
              }
              this.refresh();
            };

            chk.onchange = (e) => {
              e.stopPropagation();
              toggleSelect();
            };
            item.onclick = toggleSelect;

            elList.appendChild(item);
          }
        } else {
          const item = document.createElement('div');
          item.className = `sketch-item ${this.selectedElementIds.has(ent.id) ? 'selected' : ''}`;

          const chk = document.createElement('input');
          chk.type = 'checkbox';
          chk.checked = this.selectedElementIds.has(ent.id);
          chk.style.cursor = 'pointer';

          const txt = document.createElement('span');
          txt.textContent = `${ent.constructor.name}: ${ent.id.split('_')[0]}`;

          item.appendChild(chk);
          item.appendChild(txt);

          const toggleSelect = () => {
            if (this.selectedElementIds.has(ent.id)) {
              this.selectedElementIds.delete(ent.id);
            } else {
              this.selectedElementIds.add(ent.id);
            }
            this.refresh();
          };

          chk.onchange = (e) => {
            e.stopPropagation();
            toggleSelect();
          };
          item.onclick = toggleSelect;

          elList.appendChild(item);
        }
      });
    }
    content.appendChild(elList);

    // 3. Constraints List Section
    const constrTitle = document.createElement('div');
    constrTitle.className = 'sketch-section-title';
    constrTitle.textContent = 'Active Constraints';
    content.appendChild(constrTitle);

    const constrList = document.createElement('div');
    constrList.className = 'sketch-list-container';
    constrList.style.maxHeight = '120px';
    constrList.style.minHeight = '50px';

    const docConstraints = this.app.doc.constraints || [];

    if (docConstraints.length === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No active constraints in current drawing.';
      empty.style.color = '#555';
      empty.style.padding = '4px';
      constrList.appendChild(empty);
    } else {
      docConstraints.forEach((c, idx) => {
        const item = document.createElement('div');
        item.style.display = 'flex';
        item.style.justifyContent = 'space-between';
        item.style.alignItems = 'center';
        item.style.padding = '2px 6px';
        item.style.borderBottom = '1px solid rgba(255,255,255,0.02)';

        const txt = document.createElement('span');
        const shortName = (ref: DocumentPointRef) => `${ref.entityId.split('_')[0]}.${ref.pointId}`;

        if (c.type === 'coincident') txt.textContent = `Coincident: ${shortName(c.p1)} = ${shortName(c.p2)}`;
        else if (c.type === 'horizontal') txt.textContent = `H: ${shortName(c.p1)} ➔ ${shortName(c.p2)}`;
        else if (c.type === 'vertical') txt.textContent = `V: ${shortName(c.p1)} ➔ ${shortName(c.p2)}`;
        else if (c.type === 'distance') txt.textContent = `Dist: ${shortName(c.p1)} ➔ ${shortName(c.p2)} = ${c.value}`;
        else if (c.type === 'parallel') txt.textContent = `Parallel: L1 // L2`;
        else if (c.type === 'perpendicular') txt.textContent = `Perp: L1 ⊥ L2`;
        else if (c.type === 'fix') txt.textContent = `Fix: ${shortName(c.p1)}`;

        const delBtn = document.createElement('span');
        delBtn.innerHTML = '&#x2715;'; // X Symbol
        delBtn.style.color = '#ff5555';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontWeight = 'bold';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          this.app.doc.history.startTransaction(this.app.doc.constraints);
          this.app.doc.constraints.splice(idx, 1);

          // Settle the document after deletion
          try {
            solveDocumentConstraints(this.app.doc, this.app.doc.constraints);
          } catch (err) {
            console.error("Constraint solver settle failed on delete:", err);
          }

          this.app.doc.history.commitTransaction(this.app.doc.constraints);

          // Propagate updates to rendering
          this.app.viewer.updateConstraints(this.app.doc);
          this.app.doc.entities.forEach(ent => {
            this.app.addEntity(ent, false, false);
          });

          // Re-render highlights and grips for currently selected entities
          this.app.viewer.setHighlight(Array.from(this.app.selectedEntityIds));
          const selectedEntitiesForGrips = Array.from(this.app.selectedEntityIds)
            .map(id => this.app.doc.getEntity(id))
            .filter((ent): ent is Entity => ent !== undefined);
          this.app.viewer.renderGrips(selectedEntitiesForGrips);

          this.app.viewer.requestRender();

          NotificationManager.getInstance().show("Constraint deleted", "info");
          this.refresh();
        };

        item.appendChild(txt);
        item.appendChild(delBtn);
        constrList.appendChild(item);
      });
    }
    content.appendChild(constrList);

    // 4. Constraint Actions grid
    const constrToolbarTitle = document.createElement('div');
    constrToolbarTitle.className = 'sketch-section-title';
    constrToolbarTitle.textContent = 'Apply Relations';
    content.appendChild(constrToolbarTitle);

    const constrGrid = document.createElement('div');
    constrGrid.style.display = 'grid';
    constrGrid.style.gridTemplateColumns = '1fr 1fr';
    constrGrid.style.gap = '4px';

    const getSelectedPoints = () => {
      const points: DocumentPointRef[] = [];
      this.selectedPointRefs.forEach(key => {
        const [entityId, pointId] = key.split('::');
        points.push({ entityId, pointId });
      });
      return points;
    };

    interface LineSegmentRef {
      p1: DocumentPointRef;
      p2: DocumentPointRef;
      originalId: string;
    }

    const getSelectedLineSegments = (): LineSegmentRef[] => {
      const segments: LineSegmentRef[] = [];
      this.selectedElementIds.forEach(id => {
        if (id.includes('::segment_')) {
          const [polyId, segmentStr] = id.split('::');
          const segIndex = parseInt(segmentStr.split('_')[1], 10);
          const ent = this.app.doc.getEntity(polyId);
          if (ent && ent instanceof Polyline) {
            const numVertices = ent.vertices.length;
            if (segIndex >= 0 && segIndex < numVertices) {
              const nextIndex = (segIndex === numVertices - 1) ? 0 : segIndex + 1;
              segments.push({
                p1: { entityId: polyId, pointId: `vertex_${segIndex}` },
                p2: { entityId: polyId, pointId: `vertex_${nextIndex}` },
                originalId: id
              });
            }
          }
        } else {
          const ent = this.app.doc.getEntity(id);
          if (ent && ent instanceof Line) {
            segments.push({
              p1: { entityId: id, pointId: 'start' },
              p2: { entityId: id, pointId: 'end' },
              originalId: id
            });
          }
        }
      });
      return segments;
    };

    // FIX COORD
    const fixBtn = document.createElement('button');
    fixBtn.className = 'sketch-btn';
    fixBtn.textContent = '⚓ Fix Coord';
    fixBtn.disabled = this.selectedPointRefs.size !== 1;
    fixBtn.title = 'Select exactly 1 vertex to freeze';
    fixBtn.onclick = () => {
      const ref = getSelectedPoints()[0];
      const coords = getPointCoords(this.app.doc, ref);
      if (coords) {
        this.applyNewConstraint({
          type: 'fix',
          p1: ref,
          x: coords.x,
          y: coords.y
        });
      }
    };

    // COINCIDENT
    const coinBtn = document.createElement('button');
    coinBtn.className = 'sketch-btn';
    coinBtn.textContent = '• Coincident';
    coinBtn.disabled = this.selectedPointRefs.size !== 2;
    coinBtn.title = 'Select exactly 2 vertices to merge';
    coinBtn.onclick = () => {
      const pts = getSelectedPoints();
      this.applyNewConstraint({
        type: 'coincident',
        p1: pts[0],
        p2: pts[1]
      });
    };

    // HORIZONTAL
    const horizBtn = document.createElement('button');
    horizBtn.className = 'sketch-btn';
    horizBtn.textContent = 'H Horizontal';
    const activeSegments = getSelectedLineSegments();
    const canHorizLine = activeSegments.length === 1 && this.selectedPointRefs.size === 0;
    const canHorizPts = this.selectedPointRefs.size === 2 && activeSegments.length === 0;
    horizBtn.disabled = !(canHorizLine || canHorizPts);
    horizBtn.title = 'Select exactly 1 Line element / Polyline segment OR exactly 2 vertices';
    horizBtn.onclick = () => {
      if (canHorizLine) {
        const seg = activeSegments[0];
        this.applyNewConstraint({
          type: 'horizontal',
          p1: seg.p1,
          p2: seg.p2
        });
      } else {
        const pts = getSelectedPoints();
        this.applyNewConstraint({
          type: 'horizontal',
          p1: pts[0],
          p2: pts[1]
        });
      }
    };

    // VERTICAL
    const vertBtn = document.createElement('button');
    vertBtn.className = 'sketch-btn';
    vertBtn.textContent = 'V Vertical';
    vertBtn.disabled = !(canHorizLine || canHorizPts);
    vertBtn.title = 'Select exactly 1 Line element / Polyline segment OR exactly 2 vertices';
    vertBtn.onclick = () => {
      if (canHorizLine) {
        const seg = activeSegments[0];
        this.applyNewConstraint({
          type: 'vertical',
          p1: seg.p1,
          p2: seg.p2
        });
      } else {
        const pts = getSelectedPoints();
        this.applyNewConstraint({
          type: 'vertical',
          p1: pts[0],
          p2: pts[1]
        });
      }
    };

    // DISTANCE (Interactive)
    const distBtn = document.createElement('button');
    distBtn.className = 'sketch-btn';
    distBtn.textContent = '📏 Distance';
    distBtn.disabled = !(canHorizLine || canHorizPts);
    distBtn.title = 'Select exactly 1 Line element / Polyline segment OR exactly 2 vertices';
    distBtn.onclick = () => {
      let ref1: DocumentPointRef;
      let ref2: DocumentPointRef;

      if (canHorizLine) {
        const seg = activeSegments[0];
        ref1 = seg.p1;
        ref2 = seg.p2;
      } else {
        const pts = getSelectedPoints();
        ref1 = pts[0];
        ref2 = pts[1];
      }

      const p1 = getPointCoords(this.app.doc, ref1);
      const p2 = getPointCoords(this.app.doc, ref2);
      if (!p1 || !p2) return;

      const currentLen = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);

      // Trigger floating dynamic input overlay
      const canvasRect = this.app.viewer.canvas.getBoundingClientRect();
      const vx = canvasRect.left + canvasRect.width / 2 - 80;
      const vy = canvasRect.top + canvasRect.height / 2 - 40;

      this.app.dynamicInput.show(
        vx,
        vy,
        ["SET TARGET DISTANCE", `Current: ${currentLen.toFixed(3)}`],
        [],
        true,
        [],
        "Type exact distance and press Enter",
        currentLen.toFixed(3)
      );

      this.app.dynamicInput.onInputSubmitted((text) => {
        const val = parseFloat(text);
        if (!isNaN(val) && val > 0) {
          this.applyNewConstraint({
            type: 'distance',
            p1: ref1,
            p2: ref2,
            value: val
          });
        } else {
          NotificationManager.getInstance().show("Invalid distance value", "error");
        }
        this.app.dynamicInput.hide();
      });
    };

    // PARALLEL
    const paraBtn = document.createElement('button');
    paraBtn.className = 'sketch-btn';
    paraBtn.textContent = '// Parallel';
    const twoLinesSelected = activeSegments.length === 2 && this.selectedPointRefs.size === 0;
    paraBtn.disabled = !twoLinesSelected;
    paraBtn.title = 'Select exactly 2 Line elements or Polyline segments';
    paraBtn.onclick = () => {
      const seg1 = activeSegments[0];
      const seg2 = activeSegments[1];
      this.applyNewConstraint({
        type: 'parallel',
        l1: [ seg1.p1, seg1.p2 ],
        l2: [ seg2.p1, seg2.p2 ]
      });
    };

    // PERPENDICULAR
    const perpBtn = document.createElement('button');
    perpBtn.className = 'sketch-btn';
    perpBtn.textContent = '⊥ Perp';
    perpBtn.disabled = !twoLinesSelected;
    perpBtn.title = 'Select exactly 2 Line elements or Polyline segments';
    perpBtn.onclick = () => {
      const seg1 = activeSegments[0];
      const seg2 = activeSegments[1];
      this.applyNewConstraint({
        type: 'perpendicular',
        l1: [ seg1.p1, seg1.p2 ],
        l2: [ seg2.p1, seg2.p2 ]
      });
    };

    constrGrid.appendChild(fixBtn);
    constrGrid.appendChild(coinBtn);
    constrGrid.appendChild(horizBtn);
    constrGrid.appendChild(vertBtn);
    constrGrid.appendChild(distBtn);
    constrGrid.appendChild(paraBtn);
    constrGrid.appendChild(perpBtn);

    content.appendChild(constrGrid);

    this.container.appendChild(content);
  }

  private applyNewConstraint(c: DocumentConstraint) {
    if (!this.app.doc.constraints) {
      this.app.doc.constraints = [];
    }

    // Check for duplicate constraint
    const isDuplicate = this.app.doc.constraints.some(existing => {
      if (existing.type !== c.type) return false;
      
      const arePointRefsEqual = (r1: DocumentPointRef, r2: DocumentPointRef) => 
        r1.entityId === r2.entityId && r1.pointId === r2.pointId;

      if (existing.type === 'fix' && c.type === 'fix') {
        return arePointRefsEqual(existing.p1, c.p1);
      }
      
      if (('p1' in existing && 'p2' in existing) && ('p1' in c && 'p2' in c)) {
        return (arePointRefsEqual(existing.p1, c.p1) && arePointRefsEqual(existing.p2, c.p2)) ||
               (arePointRefsEqual(existing.p1, c.p2) && arePointRefsEqual(existing.p2, c.p1));
      }
      
      if (('l1' in existing && 'l2' in existing) && ('l1' in c && 'l2' in c)) {
        const matchDirect = (
          (arePointRefsEqual(existing.l1[0], c.l1[0]) && arePointRefsEqual(existing.l1[1], c.l1[1]) ||
           arePointRefsEqual(existing.l1[0], c.l1[1]) && arePointRefsEqual(existing.l1[1], c.l1[0])) &&
          (arePointRefsEqual(existing.l2[0], c.l2[0]) && arePointRefsEqual(existing.l2[1], c.l2[1]) ||
           arePointRefsEqual(existing.l2[0], c.l2[1]) && arePointRefsEqual(existing.l2[1], c.l2[0]))
        );
        const matchSwapped = (
          (arePointRefsEqual(existing.l1[0], c.l2[0]) && arePointRefsEqual(existing.l1[1], c.l2[1]) ||
           arePointRefsEqual(existing.l1[0], c.l2[1]) && arePointRefsEqual(existing.l1[1], c.l2[0])) &&
          (arePointRefsEqual(existing.l2[0], c.l1[0]) && arePointRefsEqual(existing.l2[1], c.l1[1]) ||
           arePointRefsEqual(existing.l2[0], c.l1[1]) && arePointRefsEqual(existing.l2[1], c.l1[0]))
        );
        return matchDirect || matchSwapped;
      }
      return false;
    });

    if (isDuplicate) {
      NotificationManager.getInstance().show("This constraint is already applied", "warning");
      this.selectedPointRefs.clear();
      this.selectedElementIds.clear();
      this.refresh();
      return;
    }

    this.app.doc.history.startTransaction(this.app.doc.constraints);
    this.app.doc.constraints.push(c);

    // Solve live coordinate adjustments to immediately snap viewport elements
    try {
      solveDocumentConstraints(this.app.doc, this.app.doc.constraints);
    } catch (err) {
      console.error("Constraint solver execution failed:", err);
      NotificationManager.getInstance().show("Conflict: Solver could not resolve constraints", "error");
      
      // Rollback immediately if failed
      this.app.doc.constraints.pop();
      this.app.doc.history.commitTransaction(this.app.doc.constraints);
      this.refresh();
      return;
    }

    this.app.doc.history.commitTransaction(this.app.doc.constraints);

    // Refresh representations in Three.js and on-screen
    this.app.viewer.updateConstraints(this.app.doc);
    this.app.doc.entities.forEach(ent => {
      this.app.addEntity(ent, false, false);
    });

    // Re-render highlights and grips for currently selected entities
    this.app.viewer.setHighlight(Array.from(this.app.selectedEntityIds));
    const selectedEntitiesForGrips = Array.from(this.app.selectedEntityIds)
      .map(id => this.app.doc.getEntity(id))
      .filter((ent): ent is Entity => ent !== undefined);
    this.app.viewer.renderGrips(selectedEntitiesForGrips);

    this.app.viewer.requestRender();

    // Clear selections to make workflow fluid
    this.selectedPointRefs.clear();
    this.selectedElementIds.clear();

    NotificationManager.getInstance().show("Constraint applied successfully", "success");
    this.refresh();
  }

  public refresh() {
    this.createUI();
  }
}
