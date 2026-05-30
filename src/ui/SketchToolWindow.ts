import { ToolWindow } from "./ToolWindow"
import { App } from "../app"
import { NotificationManager } from "./NotificationManager"
import { DocumentConstraint, DocumentPointRef, solveDocumentConstraints, getPointCoords } from "../core/engine/SketchSolver"
import { analyzeDocumentDoF, DocumentDoFResult } from "../core/engine/DocumentDoFAnalyzer"
import { Entity } from "../core/model/Entity"
import { getLineLineIntersectionInfinite } from "../core/engine/MathUtils"
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
  private dofBadge: HTMLElement | null = null;

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
      this.runDoFAnalysis();
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
      this.runDoFAnalysis();
    };
  }

  public syncWithAppSelection() {
    const activeSelectedIds = this.app.selectedEntityIds;

    // 1. Ensure all viewport-selected entities are in our element list
    activeSelectedIds.forEach(id => {
      if (!this.selectedElementIds.has(id)) {
        // Only add if no sub-element of this entity is already selected
        let hasSubSelected = false;
        this.selectedElementIds.forEach(selId => {
          if (selId.startsWith(id + '::')) hasSubSelected = true;
        });
        if (!hasSubSelected) {
          this.selectedElementIds.add(id);
        }
      }

      // Auto-populate points for single-point entities
      const ent = this.app.doc.getEntity(id);
      if (ent instanceof Point) {
        this.selectedPointRefs.add(`${id}::position`);
      }
    });

    // 2. Prune elements and points that are no longer in viewport selection
    // (Note: we keep sub-elements like segments if the parent is selected)
    const validPointRefs = new Set<string>();
    activeSelectedIds.forEach(id => {
      const ent = this.app.doc.getEntity(id);
      if (ent) {
        if (ent instanceof Line) {
          validPointRefs.add(`${id}::start`); validPointRefs.add(`${id}::end`);
        } else if (ent instanceof Circle) {
          validPointRefs.add(`${id}::center`);
        } else if (ent instanceof Arc) {
          validPointRefs.add(`${id}::center`); validPointRefs.add(`${id}::start`); validPointRefs.add(`${id}::end`);
        } else if (ent instanceof Polyline) {
          ent.vertices.forEach((_, idx) => validPointRefs.add(`${id}::vertex_${idx}`));
        } else if (ent instanceof Point || ent instanceof Text || ent instanceof MText) {
          validPointRefs.add(`${id}::position`);
        }
      }
    });

    this.selectedPointRefs.forEach(refKey => {
      if (!validPointRefs.has(refKey)) this.selectedPointRefs.delete(refKey);
    });

    this.selectedElementIds.forEach(id => {
      const baseId = id.includes('::') ? id.split('::')[0] : id;
      if (!activeSelectedIds.has(baseId)) this.selectedElementIds.delete(id);
    });

    this.refresh();
  }

  private pruneAndRefresh() {
    this.syncWithAppSelection();
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

    const content = document.createElement('div');
    content.style.display = 'flex';
    content.style.flexDirection = 'column';
    content.style.gap = '8px';

    // 1. Selection List Section
    const selTitle = document.createElement('div');
    selTitle.className = 'sketch-section-title';
    selTitle.textContent = 'Selected Entities';
    content.appendChild(selTitle);

    const elList = document.createElement('div');
    elList.className = 'sketch-list-container';

    if (this.app.selectedEntityIds.size === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No selection.';
      empty.style.color = '#555';
      empty.style.padding = '4px';
      elList.appendChild(empty);
    } else {
      this.app.selectedEntityIds.forEach(id => {
        const ent = this.app.doc.getEntity(id);
        if (ent) {
          const item = document.createElement('div');
          item.className = 'sketch-item' + (this.selectedElementIds.has(ent.id) ? ' selected' : '');
          
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

    // 2. Point Selection Section (for vertices)
    const ptsTitle = document.createElement('div');
    ptsTitle.className = 'sketch-section-title';
    ptsTitle.textContent = 'Selected Vertices';
    content.appendChild(ptsTitle);

    const ptsList = document.createElement('div');
    ptsList.className = 'sketch-list-container';
    ptsList.style.maxHeight = '80px';

    if (this.app.selectedEntityIds.size === 0) {
      const empty = document.createElement('div');
      empty.textContent = 'No selection.';
      empty.style.color = '#555';
      empty.style.padding = '4px';
      ptsList.appendChild(empty);
    } else {
      this.app.selectedEntityIds.forEach(id => {
        const ent = this.app.doc.getEntity(id);
        if (ent) {
          const addPointItem = (pointId: string, label: string) => {
            const key = `${id}::${pointId}`;
            const item = document.createElement('div');
            item.className = 'sketch-item' + (this.selectedPointRefs.has(key) ? ' selected' : '');
            
            const chk = document.createElement('input');
            chk.type = 'checkbox';
            chk.checked = this.selectedPointRefs.has(key);
            
            const txt = document.createElement('span');
            txt.textContent = `${id.split('_')[0]}.${label}`;

            item.appendChild(chk);
            item.appendChild(txt);

            const toggle = () => {
              if (this.selectedPointRefs.has(key)) this.selectedPointRefs.delete(key);
              else this.selectedPointRefs.add(key);
              this.refresh();
            };
            item.onclick = toggle;
            chk.onchange = (e) => { e.stopPropagation(); toggle(); };
            ptsList.appendChild(item);
          };

          if (ent instanceof Line) {
            addPointItem('start', 'Start');
            addPointItem('end', 'End');
          } else if (ent instanceof Circle) {
            addPointItem('center', 'Center');
          } else if (ent instanceof Arc) {
            addPointItem('center', 'Center');
            addPointItem('start', 'Start');
            addPointItem('end', 'End');
          } else if (ent instanceof Polyline) {
            ent.vertices.forEach((_, idx) => addPointItem(`vertex_${idx}`, `V${idx}`));
          } else if (ent instanceof Point) {
            addPointItem('position', 'Pos');
          }
        }
      });
    }
    content.appendChild(ptsList);

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
        item.className = 'constraint-list-item';
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
        else if (c.type === 'concentric') txt.textContent = `Concentric: ${shortName(c.p1)} = ${shortName(c.p2)}`;
        else if (c.type === 'perpendicular') txt.textContent = `Perp: L1 ⊥ L2`;
        else if (c.type === 'tangent') txt.textContent = `Tangent: Line ➔ Circle`;
        else if (c.type === 'tangent_smooth') txt.textContent = `Smooth: Arc ➔ Arc`;
        else if (c.type === 'symmetric') txt.textContent = `Symmetric: ${shortName(c.p1)}, ${shortName(c.p2)} (Mid: ${shortName(c.p3)})`;
        else if (c.type === 'midpoint') txt.textContent = `Midpoint: ${shortName(c.pm)} on L(${shortName(c.ps)}-${shortName(c.pe)})`;
        else if (c.type === 'equal_length') txt.textContent = `Equal: ${shortName(c.l1[0])}-${shortName(c.l1[1])} = ${shortName(c.l2[0])}-${shortName(c.l2[1])}`;
        else if (c.type === 'angular') txt.textContent = `Angle: L1 ∠ L2 = ${(c.value * 180 / Math.PI).toFixed(1)}°`;
        else if (c.type === 'radius') txt.textContent = `R: ${c.entityId.split('_')[0]} = ${c.value}`;
        else if (c.type === 'diameter') txt.textContent = `Ø: ${c.entityId.split('_')[0]} = ${c.value}`;
        else if (c.type === 'fix') txt.textContent = `Fix: ${shortName(c.p1)}`;

        const delBtn = document.createElement('span');
        delBtn.innerHTML = '&#x2715;'; // X Symbol
        delBtn.style.color = '#ff5555';
        delBtn.style.cursor = 'pointer';
        delBtn.style.fontWeight = 'bold';
        delBtn.onclick = (e) => {
          e.stopPropagation();

          // Ensure constraints array is extensible
          if (!this.app.doc.constraints) {
            this.app.doc.constraints = [];
          } else if (Object.isFrozen(this.app.doc.constraints) || !Array.isArray(this.app.doc.constraints)) {
            this.app.doc.constraints = Array.from(this.app.doc.constraints);
          }

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
          this.runDoFAnalysis();
        };

        item.appendChild(txt);
        item.appendChild(delBtn);
        constrList.appendChild(item);
      });
    }
    content.appendChild(constrList);

    // DoF Status Badge
    const dofSectionTitle = document.createElement('div');
    dofSectionTitle.className = 'sketch-section-title';
    dofSectionTitle.textContent = 'Constraint Status';
    content.appendChild(dofSectionTitle);

    const badge = document.createElement('div');
    badge.className = 'sketch-dof-badge';
    badge.style.cssText = `
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 5px 8px;
      border-radius: 5px;
      font-size: 11px;
      font-family: var(--font-mono, monospace);
      background: var(--bg-secondary, #1e1e2e);
      border: 1px solid var(--color-border, #333);
      margin-top: 2px;
    `;

    const dot = document.createElement('span');
    dot.className = 'sketch-dof-dot';
    dot.style.cssText = `
      width: 10px; height: 10px; border-radius: 50%;
      display: inline-block; flex-shrink: 0;
      background: #888;
      transition: background 0.15s ease;
    `;

    const label = document.createElement('span');
    label.className = 'sketch-dof-label';
    label.textContent = 'No constraints';
    label.style.color = '#888';

    badge.appendChild(dot);
    badge.appendChild(label);
    content.appendChild(badge);
    this.dofBadge = badge;

    // Run DoF analysis to populate badge with current state
    this.runDoFAnalysis();

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

    // ANGULAR (Interactive)
    const angBtn = document.createElement('button');
    angBtn.className = 'sketch-btn';
    angBtn.textContent = '∠ Angle';
    angBtn.disabled = !twoLinesSelected;
    angBtn.title = 'Select exactly 2 Line elements to set the angle between them';
    angBtn.onclick = () => {
      const seg1 = activeSegments[0];
      const seg2 = activeSegments[1];

      const p1 = getPointCoords(this.app.doc, seg1.p1);
      const p2 = getPointCoords(this.app.doc, seg1.p2);
      const p3 = getPointCoords(this.app.doc, seg2.p1);
      const p4 = getPointCoords(this.app.doc, seg2.p2);
      if (!p1 || !p2 || !p3 || !p4) return;

      const intersect = getLineLineIntersectionInfinite(p1, p2, p3, p4);
      if (!intersect) return;

      // Determine alignment: which endpoint of each segment is closer to intersection
      const d1a = Math.sqrt((p1.x - intersect.x)**2 + (p1.y - intersect.y)**2);
      const d1b = Math.sqrt((p2.x - intersect.x)**2 + (p2.y - intersect.y)**2);
      const l1Refs: [DocumentPointRef, DocumentPointRef] = d1a < d1b ? [seg1.p1, seg1.p2] : [seg1.p2, seg1.p1];

      const d2a = Math.sqrt((p3.x - intersect.x)**2 + (p3.y - intersect.y)**2);
      const d2b = Math.sqrt((p4.x - intersect.x)**2 + (p4.y - intersect.y)**2);
      const l2Refs: [DocumentPointRef, DocumentPointRef] = d2a < d2b ? [seg2.p1, seg2.p2] : [seg2.p2, seg2.p1];

      // Re-calculate coordinates for display based on aligned refs
      const ap1 = getPointCoords(this.app.doc, l1Refs[0])!;
      const ap2 = getPointCoords(this.app.doc, l1Refs[1])!;
      const ap3 = getPointCoords(this.app.doc, l2Refs[0])!;
      const ap4 = getPointCoords(this.app.doc, l2Refs[1])!;

      const vx1 = ap2.x - ap1.x, vy1 = ap2.y - ap1.y;
      const vx2 = ap4.x - ap3.x, vy2 = ap4.y - ap3.y;

      const a1 = Math.atan2(vy1, vx1);
      const a2 = Math.atan2(vy2, vx2);
      let diff = a2 - a1;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      const currentDeg = (Math.abs(diff) * 180 / Math.PI).toFixed(1);

      const canvasRect = this.app.viewer.canvas.getBoundingClientRect();
      const vx = canvasRect.left + canvasRect.width / 2 - 80;
      const vy = canvasRect.top + canvasRect.height / 2 - 40;

      this.app.dynamicInput.show(
        vx, vy,
        ["SET TARGET ANGLE", `Current: ${currentDeg}°`],
        [],
        true, [],
        "Type angle in degrees and press Enter",
        currentDeg
      );

      this.app.dynamicInput.onInputSubmitted((text) => {
        const val = parseFloat(text);
        if (!isNaN(val) && val > 0 && val < 180) {
          let targetDiff = val * Math.PI / 180;
          if (diff < 0) targetDiff = -targetDiff;

          this.applyNewConstraint({
            type: 'angular',
            l1: l1Refs,
            l2: l2Refs,
            value: targetDiff
          });
        } else {
          NotificationManager.getInstance().show("Invalid angle (0-180°)", "error");
        }
        this.app.dynamicInput.hide();
      });
    };

    // TANGENT / SMOOTH
    const tangBtn = document.createElement('button');
    tangBtn.className = 'sketch-btn';
    tangBtn.textContent = '◯ Tangent';

    const selectedForTangent = Array.from(this.app.selectedEntityIds).map(id => this.app.doc.getEntity(id)).filter(e => !!e);
    const linesCount = activeSegments.length;
    const arcsCount = selectedForTangent.filter(e => e instanceof Circle || e instanceof Arc).length;

    const isLineCircle = linesCount === 1 && arcsCount === 1;

    // Smooth join check (2 arcs or arc+line sharing a vertex)
    let sharedPoint: DocumentPointRef | null = null;
    let arc1Center: DocumentPointRef | null = null;
    let arc2Center: DocumentPointRef | null = null;

    if (selectedForTangent.length === 2) {
      const e1 = selectedForTangent[0];
      const e2 = selectedForTangent[1];
      if ((e1 instanceof Arc || e1 instanceof Circle) && (e2 instanceof Arc || e2 instanceof Circle)) {
        // Look for shared endpoint
        const tol = 1e-3;
        const pts1 = e1 instanceof Arc ? ['start', 'end'] : [];
        const pts2 = e2 instanceof Arc ? ['start', 'end'] : [];

        for (const p1id of pts1) {
          for (const p2id of pts2) {
            const p1 = getPointCoords(this.app.doc, { entityId: e1.id, pointId: p1id });
            const p2 = getPointCoords(this.app.doc, { entityId: e2.id, pointId: p2id });
            if (p1 && p2 && Math.sqrt((p1.x - p2.x)**2 + (p1.y - p2.y)**2) < tol) {
              sharedPoint = { entityId: e1.id, pointId: p1id };
              arc1Center = { entityId: e1.id, pointId: 'center' };
              arc2Center = { entityId: e2.id, pointId: 'center' };
              break;
            }
          }
          if (sharedPoint) break;
        }
      }
    }

    const isSmoothJoin = !!sharedPoint;
    tangBtn.disabled = !isLineCircle && !isSmoothJoin;
    tangBtn.title = isSmoothJoin ? 'Apply Smooth Join (Collinear Centers)' : 'Select exactly 1 Line/Segment and 1 Circle/Arc';

    tangBtn.onclick = () => {
      if (isLineCircle) {
        const seg = activeSegments[0];
        const circleId = selectedForTangent.find(e => e instanceof Circle || e instanceof Arc)!.id;
        this.applyNewConstraint({
          type: 'tangent',
          l1: [seg.p1, seg.p2],
          circle: { entityId: circleId, pointId: 'center' }
        });
      } else if (isSmoothJoin) {
        this.applyNewConstraint({
          type: 'tangent_smooth',
          p1: arc1Center!,
          p2: sharedPoint!,
          p3: arc2Center!
        });
      }
    };

    const selectedCirclesOrArcs = this.app.selectedEntityIds.size === 2 &&
      Array.from(this.app.selectedEntityIds).every(id => {
        const ent = this.app.doc.getEntity(id);
        return ent instanceof Circle || ent instanceof Arc;
      });

    // CONCENTRIC
    const concBtn = document.createElement('button');
    concBtn.className = 'sketch-btn';
    concBtn.textContent = '⊙ Concentric';
    concBtn.disabled = !selectedCirclesOrArcs;
    concBtn.title = 'Select exactly 2 Circles or Arcs to share the same center';
    concBtn.onclick = () => {
      const ids = Array.from(this.app.selectedEntityIds);
      if (ids.length !== 2) return;
      const ent1 = this.app.doc.getEntity(ids[0]);
      const ent2 = this.app.doc.getEntity(ids[1]);
      if (!ent1 || !ent2) return;
      const isCircle1 = ent1 instanceof Circle || ent1 instanceof Arc;
      const isCircle2 = ent2 instanceof Circle || ent2 instanceof Arc;
      if (!isCircle1 || !isCircle2) return;

      this.applyNewConstraint({
        type: 'concentric',
        p1: { entityId: ent1.id, pointId: 'center' },
        p2: { entityId: ent2.id, pointId: 'center' }
      });
    };

    // RADIUS (Interactive)
    const radBtn = document.createElement('button');
    radBtn.className = 'sketch-btn';
    radBtn.textContent = 'ℛ Radius';
    const singleCircleOrArc = this.app.selectedEntityIds.size === 1 && (() => {
        const id = Array.from(this.app.selectedEntityIds)[0];
        const ent = this.app.doc.getEntity(id);
        return ent instanceof Circle || ent instanceof Arc;
    })();
    radBtn.disabled = !singleCircleOrArc;
    radBtn.title = 'Select exactly 1 Circle or Arc to set its radius';
    radBtn.onclick = () => {
        const id = Array.from(this.app.selectedEntityIds)[0];
        const ent = this.app.doc.getEntity(id) as Circle | Arc;
        if (!ent) return;

        const currentRad = ent.r;
        const canvasRect = this.app.viewer.canvas.getBoundingClientRect();
        const vx = canvasRect.left + canvasRect.width / 2 - 80;
        const vy = canvasRect.top + canvasRect.height / 2 - 40;

        this.app.dynamicInput.show(
            vx, vy,
            ["SET TARGET RADIUS", `Current: ${currentRad.toFixed(3)}`],
            [], true, [],
            "Type radius and press Enter",
            currentRad.toFixed(3)
        );

        this.app.dynamicInput.onInputSubmitted((text) => {
            const val = parseFloat(text);
            if (!isNaN(val) && val > 0) {
                this.applyNewConstraint({
                    type: 'radius',
                    entityId: ent.id,
                    value: val
                });
            } else {
                NotificationManager.getInstance().show("Invalid radius value", "error");
            }
            this.app.dynamicInput.hide();
        });
    };

    // DIAMETER (Interactive)
    const diaBtn = document.createElement('button');
    diaBtn.className = 'sketch-btn';
    diaBtn.textContent = '∅ Diameter';
    diaBtn.disabled = !singleCircleOrArc;
    diaBtn.title = 'Select exactly 1 Circle or Arc to set its diameter';
    diaBtn.onclick = () => {
        const id = Array.from(this.app.selectedEntityIds)[0];
        const ent = this.app.doc.getEntity(id) as Circle | Arc;
        if (!ent) return;

        const currentDia = ent.r * 2;
        const canvasRect = this.app.viewer.canvas.getBoundingClientRect();
        const vx = canvasRect.left + canvasRect.width / 2 - 80;
        const vy = canvasRect.top + canvasRect.height / 2 - 40;

        this.app.dynamicInput.show(
            vx, vy,
            ["SET TARGET DIAMETER", `Current: ${currentDia.toFixed(3)}`],
            [], true, [],
            "Type diameter and press Enter",
            currentDia.toFixed(3)
        );

        this.app.dynamicInput.onInputSubmitted((text) => {
            const val = parseFloat(text);
            if (!isNaN(val) && val > 0) {
                this.applyNewConstraint({
                    type: 'diameter',
                    entityId: ent.id,
                    value: val
                });
            } else {
                NotificationManager.getInstance().show("Invalid diameter value", "error");
            }
            this.app.dynamicInput.hide();
        });
    };

    constrGrid.appendChild(fixBtn);
    constrGrid.appendChild(coinBtn);
    constrGrid.appendChild(horizBtn);
    constrGrid.appendChild(vertBtn);
    constrGrid.appendChild(distBtn);
    constrGrid.appendChild(paraBtn);
    constrGrid.appendChild(perpBtn);
    constrGrid.appendChild(angBtn);
    constrGrid.appendChild(tangBtn);
    constrGrid.appendChild(concBtn);
    constrGrid.appendChild(radBtn);
    constrGrid.appendChild(diaBtn);

    const selectedPoints = getSelectedPoints();
    const selectedSegments = getSelectedLineSegments();

    // MIDPOINT
    const midBtn = document.createElement('button');
    midBtn.className = 'sketch-btn';
    midBtn.textContent = '△ Midpoint';
    midBtn.disabled = !(selectedPoints.length === 1 && selectedSegments.length === 1);
    midBtn.title = 'Select 1 point and 1 segment to constrain point to the middle';
    midBtn.onclick = () => {
      const pm = selectedPoints[0];
      const seg = selectedSegments[0];
      this.applyNewConstraint({
        type: 'midpoint',
        pm: pm,
        ps: seg.p1,
        pe: seg.p2
      });
    };
    constrGrid.appendChild(midBtn);

    // SYMMETRIC
    const symmBtn = document.createElement('button');
    symmBtn.className = 'sketch-btn';
    symmBtn.textContent = '⚖ Symmetric';
    symmBtn.disabled = this.selectedPointRefs.size !== 3;
    symmBtn.title = 'Select exactly 3 vertices (P1, P2, and Midpoint)';
    symmBtn.onclick = () => {
      const pts = getSelectedPoints();
      this.applyNewConstraint({
        type: 'symmetric',
        p1: pts[0],
        p2: pts[1],
        p3: pts[2]
      });
    };
    constrGrid.appendChild(symmBtn);

    // EQUAL LENGTH
    const eqBtn = document.createElement('button');
    eqBtn.className = 'sketch-btn';
    eqBtn.textContent = '=" Equal Length';
    eqBtn.disabled = this.selectedElementIds.size !== 2;
    eqBtn.title = 'Select exactly 2 lines to make their lengths equal';
    eqBtn.onclick = () => {
      const ids = Array.from(this.selectedElementIds);
      const ent1 = this.app.doc.getEntity(ids[0]);
      const ent2 = this.app.doc.getEntity(ids[1]);
      if (ent1 instanceof Line && ent2 instanceof Line) {
        this.applyNewConstraint({
          type: 'equal_length',
          l1: [{ entityId: ent1.id, pointId: 'start' }, { entityId: ent1.id, pointId: 'end' }],
          l2: [{ entityId: ent2.id, pointId: 'start' }, { entityId: ent2.id, pointId: 'end' }]
        });
      } else {
        NotificationManager.getInstance().show("Please select exactly 2 line segments.", "error");
      }
    };
    constrGrid.appendChild(eqBtn);

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

      const arePointRefsEqual = (r1: any, r2: any) =>
        !!(r1 && r2 && r1.entityId === r2.entityId && r1.pointId === r2.pointId);

      const arePointListsEqual = (l1: DocumentPointRef[], l2: DocumentPointRef[]) => {
        if (!l1 || !l2 || l1.length !== l2.length) return false;
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
        const outerMatch = (arePointRefsEqual(e.p1, cn.p1) && arePointRefsEqual(e.p2, cn.p2)) ||
                           (arePointRefsEqual(e.p1, cn.p2) && arePointRefsEqual(e.p2, cn.p1));
        return outerMatch && arePointRefsEqual(e.p3, cn.p3);
      }

      if (c.type === 'midpoint') {
        const e = existing as any, cn = c as any;
        const endpointsMatch = (arePointRefsEqual(e.ps, cn.ps) && arePointRefsEqual(e.pe, cn.pe)) ||
                               (arePointRefsEqual(e.ps, cn.pe) && arePointRefsEqual(e.pe, cn.ps));
        return arePointRefsEqual(e.pm, cn.pm) && endpointsMatch;
      }
      
      if (c.type === 'radius' || c.type === 'diameter') {
          const e = existing as any, cn = c as any;
          return e.entityId === cn.entityId;
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

    // Ensure constraints array is extensible (it might be frozen if assigned from a DB document)
    if (!this.app.doc.constraints) {
      this.app.doc.constraints = [];
    } else if (Object.isFrozen(this.app.doc.constraints) || !Array.isArray(this.app.doc.constraints)) {
      this.app.doc.constraints = Array.from(this.app.doc.constraints);
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

    // Run DoF analysis after constraint change
    this.runDoFAnalysis();
  }

  public clearDoFBadge(): void {
    if (this.dofBadge) {
      const dot = this.dofBadge.querySelector('.sketch-dof-dot') as HTMLElement;
      const label = this.dofBadge.querySelector('.sketch-dof-label') as HTMLElement;
      if (dot) dot.style.background = '#888';
      if (label) {
        label.style.color = '#888';
        label.textContent = 'No constraints';
      }
    }
    this.app.viewer.clearDoFColors();
  }

  private updateDofBadge(badge: HTMLElement, result: DocumentDoFResult | null): void {
    const dot = badge.querySelector('.sketch-dof-dot') as HTMLElement;
    const label = badge.querySelector('.sketch-dof-label') as HTMLElement;

    if (!result || result.status === 'under' && result.dof === 0 && result.entityStatus.size === 0) {
      if (dot) dot.style.background = '#888';
      if (label) {
        label.style.color = '#888';
        label.textContent = 'No constraints';
      }
      return;
    }

    switch (result.status) {
      case 'under':
        if (dot) dot.style.background = '#4da6ff';
        if (label) {
          label.style.color = '#4da6ff';
          label.textContent = `Under-constrained  (${result.dof} DoF free)`;
        }
        break;
      case 'solved':
        if (dot) dot.style.background = '#44cc77';
        if (label) {
          label.style.color = '#44cc77';
          label.textContent = 'Fully constrained ✓';
        }
        break;
      case 'over':
        if (dot) dot.style.background = '#ff4444';
        if (label) {
          label.style.color = '#ff4444';
          label.textContent = `Over-constrained  (${result.redundantConstraintIndices.size} conflict${result.redundantConstraintIndices.size > 1 ? 's' : ''})`;
        }
        break;
    }
  }

  public runDoFAnalysis(): void {
    const constraints = this.app.doc.constraints;
    if (!constraints || constraints.length === 0) {
      this.clearDoFBadge();
      return;
    }

    const result = analyzeDocumentDoF(this.app.doc, constraints);

    // Apply entity colors
    this.app.viewer.setDoFColors(result.entityStatus, result.dof);

    // Update badge if it exists
    if (this.dofBadge) {
      this.updateDofBadge(this.dofBadge, result);
    }

    // Highlight redundant constraint rows in the constraint list
    const constraintItems = this.container.querySelectorAll('.constraint-list-item');
    constraintItems.forEach((item, idx) => {
      const htmlItem = item as HTMLElement;
      if (result.redundantConstraintIndices.has(idx)) {
        htmlItem.style.background = 'rgba(255,68,68,0.15)';
        htmlItem.style.borderLeft = '2px solid #ff4444';
        htmlItem.title = 'Redundant — conflicts with another constraint';
      } else {
        htmlItem.style.background = '';
        htmlItem.style.borderLeft = '';
        htmlItem.title = '';
      }
    });
  }

  public refresh() {
    this.createUI();
  }
}
