import { ToolWindow } from "./ToolWindow"
import files from "../files.json"
import { DXFImporter } from "../core/io/dxfImport"
import { App } from "../app"
import { NotificationManager } from "./NotificationManager"

export class FileToolWindow {
  private container: HTMLElement;

  constructor(private toolWindow: ToolWindow, private app: App) {
    this.container = document.createElement('div');
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
    this.container.style.height = '100%';
    this.container.style.overflow = 'hidden';
    
    this.createUI();
    this.toolWindow.setContent(this.container);
  }

  private createUI() {
    const toolbar = document.createElement('div');
    toolbar.style.display = 'flex';
    toolbar.style.gap = '4px';
    toolbar.style.flexShrink = '0';
    toolbar.style.padding = '8px';
    toolbar.style.borderBottom = '1px solid var(--border-color)';
    toolbar.style.background = 'var(--panel-bg)';

    const newBtn = document.createElement('button');
    newBtn.textContent = 'NEW';
    newBtn.style.flex = '1';
    newBtn.className = 'tool-button';
    newBtn.style.fontSize = '11px';
    newBtn.style.padding = '4px';
    newBtn.style.background = 'var(--panel-bg)';
    newBtn.style.color = 'var(--text-color)';
    newBtn.style.border = '1px solid var(--border-color)';
    newBtn.style.cursor = 'pointer';
    newBtn.onclick = () => {
      if (confirm('Clear current drawing?')) {
        this.app.doc.clear();
        this.app.syncFromDocument();
      }
    };

    const saveBtn = document.createElement('button');
    saveBtn.textContent = 'SAVE';
    saveBtn.style.flex = '1';
    saveBtn.className = 'tool-button';
    saveBtn.style.fontSize = '11px';
    saveBtn.style.padding = '4px';
    saveBtn.style.background = 'var(--panel-bg)';
    saveBtn.style.color = 'var(--text-color)';
    saveBtn.style.border = '1px solid var(--border-color)';
    saveBtn.style.cursor = 'pointer';
    saveBtn.onclick = async () => {
      const name = prompt('Enter file name to save:', this.app.doc.id || 'drawing1');
      if (name) {
        try {
          const id = await this.app.persistence.saveProject(
            this.app.doc, 
            name,
            this.app.viewer.canvas.toDataURL('image/jpeg', 0.5)
          );
          NotificationManager.getInstance().show(`Saved as ${name}`, 'success');
          this.renderTableBody();
        } catch (e) {
          console.error(e);
          NotificationManager.getInstance().show(`Failed to save: ${e}`, 'error');
        }
      }
    };

    const cleanBtn = document.createElement('button');
    cleanBtn.textContent = 'CLEAN';
    cleanBtn.style.flex = '1';
    cleanBtn.className = 'tool-button';
    cleanBtn.style.fontSize = '11px';
    cleanBtn.style.padding = '4px';
    cleanBtn.style.background = 'var(--panel-bg)';
    cleanBtn.style.color = '#ff4d4d';
    cleanBtn.style.border = '1px solid var(--border-color)';
    cleanBtn.style.cursor = 'pointer';
    cleanBtn.title = 'Delete all "Untitled" records';
    cleanBtn.onclick = async () => {
      const history = await this.app.persistence.getHistory();
      const untitled = history.filter(item => item.name === 'Untitled');
      if (untitled.length === 0) {
        NotificationManager.getInstance().show('No "Untitled" records found.', 'info');
        return;
      }
      if (confirm(`Delete ${untitled.length} "Untitled" records?`)) {
        for (const item of untitled) {
          await this.app.persistence.deleteProject(item.id);
        }
        this.renderTableBody();
      }
    };

    toolbar.appendChild(newBtn);
    toolbar.appendChild(saveBtn);
    toolbar.appendChild(cleanBtn);
    this.container.appendChild(toolbar);

    const tableContainer = document.createElement('div');
    tableContainer.style.flex = '1';
    tableContainer.style.overflowY = 'auto';
    tableContainer.style.overflowX = 'hidden';
    tableContainer.style.minHeight = '0';
    tableContainer.style.padding = '8px';

    const table = document.createElement('table');
    table.className = 'file-data-table';
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.style.fontSize = '11px';
    
    const thead = document.createElement('thead');
    thead.innerHTML = `
      <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
        <th style="text-align: left; padding: 4px;">File Name</th>
        <th style="text-align: left; padding: 4px;">Date</th>
        <th style="text-align: right; padding: 4px;">Action</th>
      </tr>
    `;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);
    tableContainer.appendChild(table);
    this.container.appendChild(tableContainer);

    this.renderTableBody();
  }

  public async renderTableBody() {
    const tbody = this.container.querySelector('tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    // History files
    const history = await this.app.persistence.getHistory();
    history.forEach(item => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';
      tr.style.backgroundColor = 'rgba(0, 255, 0, 0.05)'; // slight green tint for saved files
      
      const tdName = document.createElement('td');
      tdName.style.padding = '4px';
      tdName.innerHTML = `${item.name} <span style="background: #4caf50; color: white; padding: 1px 4px; border-radius: 3px; font-size: 9px; margin-left: 5px; font-weight: bold;">DB</span>`;
      
      const tdDate = document.createElement('td');
      tdDate.style.padding = '4px';
      tdDate.style.color = 'var(--text-muted)';
      const date = item.updatedAt ? new Date(item.updatedAt).toLocaleString() : '-';
      tdDate.textContent = date;
      
      const tdAction = document.createElement('td');
      tdAction.style.padding = '4px';
      tdAction.style.textAlign = 'right';
      tdAction.style.display = 'flex';
      tdAction.style.justifyContent = 'flex-end';
      tdAction.style.gap = '4px';
      
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'LOAD';
      loadBtn.style.fontSize = '10px';
      loadBtn.style.padding = '2px 4px';
      loadBtn.style.background = 'var(--panel-bg)';
      loadBtn.style.color = 'var(--text-color)';
      loadBtn.style.border = '1px solid var(--border-color)';
      loadBtn.style.cursor = 'pointer';
      
      loadBtn.onclick = async () => {
        try {
          await this.app.persistence.loadProject(item.id, this.app.doc, this.app);
          this.app.triggerLayersWindowUpdate();
          NotificationManager.getInstance().show(`Loaded ${item.name}`, 'success');
        } catch (e) {
          console.error(e);
          NotificationManager.getInstance().show(`Failed to load: ${e}`, 'error');
        }
      };
      
      const delBtn = document.createElement('button');
      delBtn.textContent = 'DEL';
      delBtn.style.fontSize = '10px';
      delBtn.style.padding = '2px 4px';
      delBtn.style.background = 'var(--panel-bg)';
      delBtn.style.color = '#ff4d4d';
      delBtn.style.border = '1px solid var(--border-color)';
      delBtn.style.cursor = 'pointer';
      
      delBtn.onclick = async () => {
        if (confirm(`Delete "${item.name}"?`)) {
          try {
            await this.app.persistence.deleteProject(item.id);
            this.renderTableBody();
          } catch (e) {
            console.error(e);
            NotificationManager.getInstance().show(`Failed to delete: ${e}`, 'error');
          }
        }
      };
      
      tdAction.appendChild(loadBtn);
      tdAction.appendChild(delBtn);
      tr.appendChild(tdName);
      tr.appendChild(tdDate);
      tr.appendChild(tdAction);
      
      tr.onmouseover = () => tr.style.backgroundColor = 'rgba(255,255,255,0.05)';
      tr.onmouseout = () => tr.style.backgroundColor = 'rgba(0, 255, 0, 0.05)';
      
      tbody.appendChild(tr);
    });

    // Sample files (from files.json)
    files.forEach(file => {
      const tr = document.createElement('tr');
      tr.style.borderBottom = '1px solid var(--border-color)';
      
      const tdName = document.createElement('td');
      tdName.style.padding = '4px';
      tdName.innerHTML = `${file} <span style="background: #2196f3; color: white; padding: 1px 4px; border-radius: 3px; font-size: 9px; margin-left: 5px; font-weight: bold;">FILE</span>`;
      
      const tdDate = document.createElement('td');
      tdDate.style.padding = '4px';
      tdDate.style.color = 'var(--text-muted)';
      tdDate.textContent = '-';
      
      const tdAction = document.createElement('td');
      tdAction.style.padding = '4px';
      tdAction.style.textAlign = 'right';
      
      const loadBtn = document.createElement('button');
      loadBtn.textContent = 'LOAD';
      loadBtn.style.fontSize = '10px';
      loadBtn.style.padding = '2px 4px';
      loadBtn.style.background = 'var(--panel-bg)';
      loadBtn.style.color = 'var(--text-color)';
      loadBtn.style.border = '1px solid var(--border-color)';
      loadBtn.style.cursor = 'pointer';
      
      loadBtn.onclick = async () => {
        await this.loadFile(file);
      };
      
      tdAction.appendChild(loadBtn);
      tr.appendChild(tdName);
      tr.appendChild(tdDate);
      tr.appendChild(tdAction);
      
      tr.onmouseover = () => tr.style.backgroundColor = 'rgba(255,255,255,0.05)';
      tr.onmouseout = () => tr.style.backgroundColor = '';
      
      tbody.appendChild(tr);
    });
  }

  private async loadFile(filename: string) {
    try {
      const response = await fetch(`/files/${filename}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const text = await response.text();
      
      this.app.doc.clear();
      const importer = new DXFImporter();
      importer.import(text, this.app.doc);
      this.app.syncFromDocument();
      this.app.triggerLayersWindowUpdate();
      console.log(`Loaded ${filename}`);
    } catch (e) {
      console.error(e);
      NotificationManager.getInstance().show(`Failed to load file: ${e}`, 'error');
    }
  }
}