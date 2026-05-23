import { ToolWindow } from "./ToolWindow";
import { ScadEditor } from "./ScadEditor";
import { NotificationManager } from "./NotificationManager";

export class ProjectToolWindow {
  private container: HTMLElement;
  private projectListContainer!: HTMLElement;
  private fileListContainer!: HTMLElement;
  private activeProject: string = '';

  constructor(
    private toolWindow: ToolWindow,
    private scadEditor: ScadEditor
  ) {
    this.container = document.createElement('div');
    Object.assign(this.container.style, {
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflow: 'hidden',
      padding: '8px',
      boxSizing: 'border-box'
    });

    this.createUI();
    this.toolWindow.setContent(this.container);
    
    // Initial fetch of projects
    this.loadProjects();
  }

  private createUI() {
    // Project selection container
    const selectionWrapper = document.createElement('div');
    Object.assign(selectionWrapper.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '5px',
      marginBottom: '10px',
      flexShrink: '0'
    });

    const label = document.createElement('label');
    label.textContent = 'Project Folders:';
    Object.assign(label.style, {
      fontSize: '11px',
      fontWeight: 'bold',
      color: 'var(--accent-color)',
      fontFamily: 'var(--font-family)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    });

    this.projectListContainer = document.createElement('div');
    Object.assign(this.projectListContainer.style, {
      maxHeight: '120px',
      overflowY: 'auto',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-color)',
      padding: '5px',
      boxSizing: 'border-box'
    });

    selectionWrapper.appendChild(label);
    selectionWrapper.appendChild(this.projectListContainer);
    this.container.appendChild(selectionWrapper);

    // Refresh Button inside toolbar/header
    const toolbar = document.createElement('div');
    Object.assign(toolbar.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '8px',
      flexShrink: '0',
      borderBottom: '1px solid var(--border-color)',
      paddingBottom: '5px'
    });

    const listTitle = document.createElement('span');
    listTitle.textContent = 'SCAD Files';
    Object.assign(listTitle.style, {
      fontSize: '11px',
      fontWeight: 'bold',
      color: 'var(--text-color)',
      fontFamily: 'var(--font-family)',
      textTransform: 'uppercase',
      letterSpacing: '0.5px'
    });

    const refreshBtn = document.createElement('button');
    refreshBtn.textContent = 'REFRESH';
    Object.assign(refreshBtn.style, {
      background: 'var(--panel-bg)',
      color: 'var(--text-color)',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-sm)',
      padding: '3px 8px',
      fontSize: '9px',
      fontWeight: '600',
      cursor: 'pointer',
      fontFamily: 'var(--font-family)',
      letterSpacing: '0.5px',
      transition: 'all 0.1s'
    });
    refreshBtn.addEventListener('mouseover', () => {
      refreshBtn.style.borderColor = 'var(--accent-color)';
    });
    refreshBtn.addEventListener('mouseout', () => {
      refreshBtn.style.borderColor = 'var(--border-color)';
    });
    refreshBtn.addEventListener('click', () => {
      this.loadProjects();
    });

    toolbar.appendChild(listTitle);
    toolbar.appendChild(refreshBtn);
    this.container.appendChild(toolbar);

    // Scrollable File list container
    this.fileListContainer = document.createElement('div');
    Object.assign(this.fileListContainer.style, {
      flex: '1',
      overflowY: 'auto',
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-color)',
      padding: '5px',
      minHeight: '0'
    });

    this.container.appendChild(this.fileListContainer);
  }

  private async loadProjects() {
    try {
      const response = await fetch('/api/files/scad/projects');
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const projects: string[] = await response.json();

      this.projectListContainer.innerHTML = '';
      if (projects.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.textContent = 'No projects found.';
        Object.assign(emptyMsg.style, {
          color: 'var(--text-muted)',
          fontSize: '11px',
          padding: '12px',
          textAlign: 'center',
          fontStyle: 'italic',
          fontFamily: 'var(--font-family)'
        });
        this.projectListContainer.appendChild(emptyMsg);
        this.renderFileList([]);
        return;
      }

      const list = document.createElement('ul');
      Object.assign(list.style, {
        listStyle: 'none',
        padding: '0',
        margin: '0',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px'
      });

      projects.forEach(projectName => {
        const item = document.createElement('li');
        item.innerHTML = `
          <span style="font-family: var(--font-mono); font-size: 11px;">${projectName}</span>
        `;
        Object.assign(item.style, {
          padding: '6px 8px',
          cursor: 'pointer',
          borderRadius: 'var(--radius-sm)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          transition: 'background-color 0.15s, border-color 0.15s',
          border: '1px solid transparent',
          marginBottom: '2px'
        });

        const updateHighlight = () => {
          if (this.activeProject === projectName) {
            item.style.backgroundColor = 'var(--accent-color)';
            item.style.color = '#ffffff';
            item.style.borderColor = 'var(--accent-color)';
          } else {
            item.style.backgroundColor = '';
            item.style.color = 'var(--text-color)';
            item.style.borderColor = 'transparent';
          }
        };

        item.addEventListener('mouseover', () => {
          if (this.activeProject !== projectName) {
            item.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
            item.style.borderColor = 'rgba(59, 130, 246, 0.2)';
          }
        });
        item.addEventListener('mouseout', () => {
          updateHighlight();
        });

        item.addEventListener('click', () => {
          this.activeProject = projectName;
          // Refresh highlighting on all siblings
          Array.from(list.children).forEach((child: any) => {
            if (child._updateHighlight) child._updateHighlight();
          });
          this.loadProjectFiles(projectName);
        });

        (item as any)._updateHighlight = updateHighlight;
        updateHighlight();
        list.appendChild(item);
      });

      this.projectListContainer.appendChild(list);

      // Load files for initial project
      if (projects.length > 0) {
        const initialProject = projects.includes(this.scadEditor.currentProject) 
          ? this.scadEditor.currentProject 
          : projects[0];
        this.activeProject = initialProject;
        Array.from(list.children).forEach((child: any) => {
          if (child._updateHighlight) child._updateHighlight();
        });
        this.loadProjectFiles(initialProject);
      }
    } catch (e) {
      console.error("Failed to load projects:", e);
      NotificationManager.getInstance().show("Failed to fetch project folders", "error");
    }
  }

  private async loadProjectFiles(projectName: string) {
    if (!projectName) {
      this.renderFileList([]);
      return;
    }

    try {
      this.scadEditor.currentProject = projectName;
      const response = await fetch(`/api/files/scad/projects/${projectName}`);
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      const files: string[] = await response.json();
      this.renderFileList(files, projectName);
    } catch (e) {
      console.error(`Failed to load files for project ${projectName}:`, e);
      NotificationManager.getInstance().show(`Failed to fetch project files`, "error");
    }
  }

  private renderFileList(files: string[], projectName: string = '') {
    this.fileListContainer.innerHTML = '';
    
    if (files.length === 0) {
      const emptyMsg = document.createElement('div');
      emptyMsg.textContent = 'No SCAD files found.';
      Object.assign(emptyMsg.style, {
        color: 'var(--text-muted)',
        fontSize: '11px',
        padding: '12px',
        textAlign: 'center',
        fontStyle: 'italic',
        fontFamily: 'var(--font-family)'
      });
      this.fileListContainer.appendChild(emptyMsg);
      return;
    }

    const list = document.createElement('ul');
    Object.assign(list.style, {
      listStyle: 'none',
      padding: '0',
      margin: '0',
      display: 'flex',
      flexDirection: 'column',
      gap: '2px'
    });

    files.forEach(fileName => {
      const item = document.createElement('li');
      item.innerHTML = `
        <span style="font-family: var(--font-mono); font-size: 11px; color: var(--text-color);">${fileName}</span>
        <span style="background: rgba(59, 130, 246, 0.1); color: var(--accent-color); padding: 2px 5px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold; font-family: var(--font-mono);">SCAD</span>
      `;
      Object.assign(item.style, {
        padding: '6px 8px',
        cursor: 'pointer',
        borderRadius: 'var(--radius-sm)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        transition: 'background-color 0.15s, border-color 0.15s',
        border: '1px solid transparent',
        borderBottom: '1px solid rgba(255,255,255,0.03)',
        marginBottom: '2px'
      });

      item.addEventListener('mouseover', () => {
        item.style.backgroundColor = 'rgba(59, 130, 246, 0.08)';
        item.style.borderColor = 'rgba(59, 130, 246, 0.2)';
      });
      item.addEventListener('mouseout', () => {
        item.style.backgroundColor = '';
        item.style.borderColor = 'transparent';
      });

      // Load file into code editor on click
      item.addEventListener('click', async () => {
        try {
          this.scadEditor.currentProject = projectName;
          this.scadEditor.currentFile = fileName;
          const response = await fetch(`/api/files/scad/projects/${projectName}/${fileName}`);
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const content = await response.text();
          
          this.scadEditor.setCode(content);
          NotificationManager.getInstance().show(`Loaded ${fileName} into editor`, "success");
        } catch (e) {
          console.error("Failed to load file content:", e);
          NotificationManager.getInstance().show("Failed to load file content", "error");
        }
      });

      list.appendChild(item);
    });

    this.fileListContainer.appendChild(list);
  }
}
