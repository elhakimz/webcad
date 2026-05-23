import { ToolWindow } from "./ToolWindow";
import { App } from "../app";
import { Solid3D } from "../core/model/Solid3D";
import { Document } from "../core/model/Document";
import { DXFImporter } from "../core/io/dxfImport";
import { NotificationManager } from "./NotificationManager";
import { Insert } from "../core/model/Insert";
import { OpenCascadeService } from "../core/io/OpenCascadeService";

export class BlockToolWindow {
  private container: HTMLElement;
  private tabContentContainer!: HTMLElement;
  private activeTab: 'solid' | 'sketch' = 'solid';
  private popupEl!: HTMLElement;
  private popupImg!: HTMLImageElement;

  constructor(
    private toolWindow: ToolWindow,
    private app: App
  ) {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      boxSizing: 'border-box'
    });

    this.createPopup();
    this.createUI();
    this.toolWindow.setContent(this.container);

    // Initial load
    this.switchTab('solid');
  }

  private createPopup() {
    this.popupEl = document.createElement('div');
    this.popupEl.id = 'block-thumbnail-popup';
    Object.assign(this.popupEl.style, {
      position: 'absolute',
      width: '180px',
      height: '180px',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      background: 'var(--popover-bg)',
      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.4)',
      padding: '6px',
      boxSizing: 'border-box',
      display: 'none',
      zIndex: '99999',
      pointerEvents: 'none',
      transition: 'opacity 0.15s ease, transform 0.15s ease',
      opacity: '0',
      transform: 'scale(0.95)'
    });

    this.popupImg = document.createElement('img');
    Object.assign(this.popupImg.style, {
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      borderRadius: 'var(--radius-sm)',
      backgroundColor: '#1a1a1a'
    });

    // Gracefully hide if loading fails (e.g. no PNG file exists)
    this.popupImg.onerror = () => {
      this.hidePopup();
    };

    this.popupEl.appendChild(this.popupImg);
    document.body.appendChild(this.popupEl);
  }

  private showPopup(imageUrl: string, targetEl: HTMLElement) {
    this.popupImg.src = imageUrl;
    this.popupEl.style.display = 'block';

    // Position popover perfectly relative to target item
    const rect = targetEl.getBoundingClientRect();
    const popupWidth = 180;
    const popupHeight = 180;

    let left = rect.right + 10;
    // Keep popover inside the screen boundary
    if (left + popupWidth > window.innerWidth) {
      left = rect.left - popupWidth - 10;
    }

    let top = rect.top + (rect.height - popupHeight) / 2;
    top = Math.max(10, Math.min(window.innerHeight - popupHeight - 10, top));

    this.popupEl.style.left = `${left}px`;
    this.popupEl.style.top = `${top}px`;

    // Trigger subtle fade/scale animation
    requestAnimationFrame(() => {
      this.popupEl.style.opacity = '1';
      this.popupEl.style.transform = 'scale(1)';
    });
  }

  private hidePopup() {
    this.popupEl.style.opacity = '0';
    this.popupEl.style.transform = 'scale(0.95)';
    // Wait for fadeout animation before hiding
    setTimeout(() => {
      if (this.popupEl.style.opacity === '0') {
        this.popupEl.style.display = 'none';
      }
    }, 150);
  }

  private createUI() {
    // 1. Tab Bar Header
    const tabHeader = document.createElement('div');
    Object.assign(tabHeader.style, {
      display: 'flex',
      borderBottom: '1px solid var(--border-color)',
      background: 'var(--panel-bg)',
      flexShrink: '0'
    });

    const solidTabBtn = this.createTabButton('Solid', 'solid');
    const sketchTabBtn = this.createTabButton('Sketch', 'sketch');

    tabHeader.appendChild(solidTabBtn);
    tabHeader.appendChild(sketchTabBtn);
    this.container.appendChild(tabHeader);

    // 2. Tab Content Pane
    this.tabContentContainer = document.createElement('div');
    Object.assign(this.tabContentContainer.style, {
      flex: '1',
      overflowY: 'auto',
      padding: '8px',
      background: 'var(--bg-color)',
      minHeight: '0'
    });
    this.container.appendChild(this.tabContentContainer);
  }

  private createTabButton(label: string, tabId: 'solid' | 'sketch'): HTMLElement {
    const btn = document.createElement('div');
    btn.textContent = label;
    btn.setAttribute('data-tab', tabId);
    Object.assign(btn.style, {
      flex: '1',
      textAlign: 'center',
      padding: '8px',
      fontWeight: 'bold',
      cursor: 'pointer',
      fontSize: '12px',
      transition: 'all 0.2s',
      color: 'var(--text-color)',
      borderBottom: '2px solid transparent',
      opacity: '0.6'
    });

    btn.addEventListener('click', () => {
      this.switchTab(tabId);
    });

    return btn;
  }

  private switchTab(tabId: 'solid' | 'sketch') {
    this.activeTab = tabId;

    // Update active visual tab
    const tabs = this.container.querySelectorAll('[data-tab]');
    tabs.forEach(tab => {
      const currentId = tab.getAttribute('data-tab');
      if (currentId === tabId) {
        Object.assign((tab as HTMLElement).style, {
          borderBottom: '2px solid var(--accent-color)',
          opacity: '1'
        });
      } else {
        Object.assign((tab as HTMLElement).style, {
          borderBottom: '2px solid transparent',
          opacity: '0.6'
        });
      }
    });

    this.loadBlocks();
  }

  private async loadBlocks() {
    this.tabContentContainer.innerHTML = `
      <div style="font-family: var(--font-family); font-size: 11px; color: var(--text-muted); padding: 12px; text-align: center; font-style: italic;">
        Fetching block library...
      </div>
    `;

    try {
      const folderPath = this.activeTab === 'solid' ? 'blocks/3D' : 'blocks/2D';
      const response = await fetch(`/api/files/${folderPath}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      
      const fileList: string[] = await response.json();
      
      // Filter out files
      const extension = this.activeTab === 'solid' ? '.brep' : '.dxf';
      const blockFiles = fileList.filter(f => f.toLowerCase().endsWith(extension));

      this.renderBlocks(blockFiles);
    } catch (e) {
      console.error(`Failed to load ${this.activeTab} blocks:`, e);
      this.tabContentContainer.innerHTML = `
        <div style="font-family: var(--font-family); font-size: 11px; color: var(--error-color); padding: 12px; text-align: center; font-weight: bold;">
          Failed to fetch blocks folder.
        </div>
      `;
    }
  }

  private renderBlocks(files: string[]) {
    this.tabContentContainer.innerHTML = '';

    if (files.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = `No ${this.activeTab === 'solid' ? 'Solid' : 'Sketch'} blocks found.`;
      Object.assign(emptyMsg.style, {
        color: 'var(--text-muted)',
        fontSize: '11px',
        padding: '12px',
        textAlign: 'center',
        fontStyle: 'italic',
        fontFamily: 'var(--font-family)'
      });
      this.tabContentContainer.appendChild(emptyMsg);
      return;
    }

    const list = document.createElement('ul');
    Object.assign(list.style, {
      listStyle: 'none',
      padding: '0',
      margin: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '4px'
    });

    files.forEach(filename => {
      const blockName = filename.replace(/\.(brep|dxf)$/i, '').toUpperCase();
      const badgeText = this.activeTab === 'solid' ? '3D' : '2D';
      const badgeBg = this.activeTab === 'solid' ? 'rgba(235, 94, 40, 0.15)' : 'rgba(59, 130, 246, 0.15)';
      const badgeColor = this.activeTab === 'solid' ? 'var(--error-color)' : 'var(--accent-color)';

      const item = document.createElement('li');
      const actionText = this.activeTab === 'solid' ? 'Edit Solid' : 'Edit Sketch';
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-color); font-weight: 600;">${blockName}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="insert-btn" title="Insert as reusable block reference at origin" style="
            background: rgba(59, 130, 246, 0.15);
            color: var(--accent-color);
            border: 1px solid rgba(59, 130, 246, 0.3);
            border-radius: var(--radius-sm);
            padding: 3px 6px;
            font-size: 9px;
            font-weight: bold;
            cursor: pointer;
            font-family: var(--font-family);
            text-transform: uppercase;
            letter-spacing: 0.3px;
            transition: all 0.15s ease;
          ">Block</button>
          <button class="import-btn" title="Import directly as native editable entity at origin" style="
            background: var(--accent-color);
            color: #ffffff;
            border: none;
            border-radius: var(--radius-sm);
            padding: 4px 6px;
            font-size: 9px;
            font-weight: bold;
            cursor: pointer;
            font-family: var(--font-family);
            text-transform: uppercase;
            letter-spacing: 0.3px;
            transition: all 0.15s ease;
          ">${actionText}</button>
          <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 5px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold; font-family: var(--font-mono);">${badgeText}</span>
        </div>
      `;
      Object.assign(item.style, {
        padding: '8px 10px',
        cursor: 'pointer',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'background-color 0.15s, border-color 0.15s',
        border: '1px solid transparent',
        background: 'var(--panel-bg)',
        borderBottom: '1px solid rgba(255,255,255,0.03)'
      });

      // Hover styles for buttons
      const insertBtn = item.querySelector('.insert-btn') as HTMLElement;
      insertBtn.addEventListener('mouseenter', () => {
        insertBtn.style.opacity = '0.9';
        insertBtn.style.transform = 'scale(1.05)';
      });
      insertBtn.addEventListener('mouseleave', () => {
        insertBtn.style.opacity = '1';
        insertBtn.style.transform = 'none';
      });

      const importBtn = item.querySelector('.import-btn') as HTMLElement;
      importBtn.addEventListener('mouseenter', () => {
        importBtn.style.opacity = '0.9';
        importBtn.style.transform = 'scale(1.05)';
      });
      importBtn.addEventListener('mouseleave', () => {
        importBtn.style.opacity = '1';
        importBtn.style.transform = 'none';
      });

      // Click to insert reusable block directly at 0,0,0
      insertBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.hidePopup();
        await this.handleBlockImport(filename, blockName, true, false);
      });

      // Click to import native editable solid/sketch directly at 0,0,0
      importBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        this.hidePopup();
        await this.handleBlockImport(filename, blockName, false, true);
      });

      // Hover behavior: popup the thumbnail
      const thumbnailPath = `/files/blocks/${this.activeTab === 'solid' ? '3D' : '2D'}/${blockName}.png`;

      item.addEventListener('mouseenter', () => {
        item.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
        item.style.borderColor = 'var(--accent-color)';
        this.showPopup(thumbnailPath, item);
      });

      item.addEventListener('mouseleave', () => {
        item.style.backgroundColor = 'var(--panel-bg)';
        item.style.borderColor = 'transparent';
        this.hidePopup();
      });

      // Click to load and insert block interactively
      item.addEventListener('click', async () => {
        this.hidePopup();
        await this.handleBlockImport(filename, blockName, false);
      });

      list.appendChild(item);
    });

    this.tabContentContainer.appendChild(list);
  }

  private async handleBlockImport(filename: string, blockName: string, shouldInsertAtOrigin = false, importAsEditable = false) {
    const actionLabel = importAsEditable ? "Importing editable" : "Importing block";
    NotificationManager.getInstance().show(`${actionLabel} "${blockName}"...`, "info");

    try {
      if (this.activeTab === 'solid') {
        // Fetch raw solid binary file
        const response = await fetch(`/files/blocks/3D/${filename}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);

        const entityId = this.app.doc.getNextId("SOLID");
        const deflection = 0.1 / (this.app.doc.facetres || 5.0);

        // Import BRep through web worker
        const geomData = await OpenCascadeService.getInstance().importBRep(entityId, bytes, deflection);
        if (!geomData || !geomData.positions || geomData.positions.length === 0) {
          throw new Error("No mesh data generated from BRep block");
        }

        const solid = new Solid3D(entityId, geomData.positions, geomData.indices, geomData.faceMapping, geomData.edgeLines);
        solid.brepSnapshot = bytes;

        if (importAsEditable) {
          // Directly add to document
          this.app.addEntity(solid);
          this.app.viewer.render();
          this.app.triggerObjectsWindowUpdate();

          if(solid.brepSnapshot !== undefined){
            NotificationManager.getInstance().show(`Imported BRep block "${blockName}" as native editable solid!`, "success");
          }else{
            NotificationManager.getInstance().show(`Imported BRep block "${blockName}" as non editable solid!`, "success");
          
          }
          
          return;
        }

        // Register block
        this.app.doc.blocks.addBlock(blockName, { x: 0, y: 0 }, [solid]);

      } else {
        // Fetch DXF content
        const response = await fetch(`/files/blocks/2D/${filename}`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        
        const dxfText = await response.text();

        // Parse DXF to temporary entities list using a dummy document
        const dummyDoc = new Document();
        const importer = new DXFImporter();
        importer.import(dxfText, dummyDoc);

        const entities = dummyDoc.getAllEntities();
        if (entities.length === 0) {
          throw new Error("No drawing entities parsed from DXF block");
        }

        if (importAsEditable) {
          // Directly add entities to the main document with fresh IDs
          for (const entity of entities) {
            const prefix = entity.id.replace(/\d+.*$/, "");
            entity.id = this.app.doc.getNextId(prefix);
            this.app.addEntity(entity);
          }
          this.app.viewer.render();
          this.app.triggerObjectsWindowUpdate();
          NotificationManager.getInstance().show(`Imported DXF block "${blockName}" as native editable sketch!`, "success");
          return;
        }

        // Register block
        this.app.doc.blocks.addBlock(blockName, { x: 0, y: 0 }, entities);
      }

      NotificationManager.getInstance().show(`Block "${blockName}" registered successfully!`, "success");
      this.app.triggerObjectsWindowUpdate();

      if (shouldInsertAtOrigin) {
        // Directly insert block at 0,0,0
        const insertId = this.app.doc.getNextId("INSERT");
        const insertEntity = new Insert(insertId, blockName, 0, 0, 1, 1, 0);
        this.app.addEntity(insertEntity);
        this.app.viewer.render();
        this.app.triggerObjectsWindowUpdate();
        NotificationManager.getInstance().show(`Inserted block "${blockName}" at (0, 0, 0)!`, "success");
      } else {
        // Automatically trigger interactive block insertion
        await this.app.execute("INSERT");
        await this.app.inputText(blockName);
      }

    } catch (e: any) {
      console.error(`Failed to import block "${blockName}":`, e);
      NotificationManager.getInstance().show(`Block import failed: ${e.message}`, "error");
    }
  }

  // Destructor helper to ensure clean removal of body-appended elements
  public destroy() {
    if (this.popupEl && this.popupEl.parentNode) {
      this.popupEl.parentNode.removeChild(this.popupEl);
    }
  }
}
