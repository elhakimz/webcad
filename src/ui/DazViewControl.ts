import { Viewer } from "../render/Viewer";
import { App } from "../app";

export class DazViewControl {
  private element: HTMLElement;
  private viewer: Viewer;
  private app: App;
  private cubeEl: HTMLElement | null = null;
  private currentView = 'TOP';
  private viewSelectorEl: HTMLSelectElement | null = null;
  private currentShadingMode: 'WIREFRAME' | 'SHADED' | 'PHONG' | 'BLINN' = 'SHADED';

  constructor(viewer: Viewer, app: App) {
    this.viewer = viewer;
    this.app = app;
    this.element = this.createUI();
  }

  private createUI(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'daz-view-control';
    container.className = 'daz-ui-container';

    // Header with Shader and View Selector
    const header = document.createElement('div');
    header.className = 'daz-header';

    const shaderBtn = document.createElement('div');
    shaderBtn.className = 'daz-shader-btn';
    shaderBtn.innerHTML = '&#127761;'; // Sphere icon placeholder
    shaderBtn.title = "Shader: Shaded";
    shaderBtn.style.color = '#00ff00';
    
    const popup = document.createElement('div');
    popup.className = 'daz-shader-popup';
    
    const options = ['Wireframe', 'Shaded', 'Phong', 'Blinn'];
    options.forEach(opt => {
      const item = document.createElement('div');
      item.className = 'daz-shader-item';
      item.textContent = opt;
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        const mode = opt.toUpperCase() as 'WIREFRAME' | 'SHADED' | 'PHONG' | 'BLINN';
        this.currentShadingMode = mode;
        this.viewer.setShadingMode(mode);
        popup.style.display = 'none';
        shaderBtn.title = `Shader: ${opt}`;
        
        // Visual feedback on button
        if (mode === 'WIREFRAME') shaderBtn.style.color = '';
        else shaderBtn.style.color = '#00ff00';
      });
      popup.appendChild(item);
    });
    
    shaderBtn.appendChild(popup);

    shaderBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = popup.style.display === 'block';
      popup.style.display = isVisible ? 'none' : 'block';
    });

    // Close popup when clicking anywhere else
    document.addEventListener('click', () => {
      popup.style.display = 'none';
    });

    const viewSelector = document.createElement('select');
    viewSelector.className = 'daz-view-selector';
    this.viewSelectorEl = viewSelector;
    const views = ['Orthogonal View', 'Top View', 'Bottom View', 'Left View', 'Right View', 'Front View', 'Back View'];
    views.forEach(v => {
      const option = document.createElement('option');
      option.value = v.toUpperCase().replace(' ', '_').replace('_VIEW', '');
      option.textContent = v;
      viewSelector.appendChild(option);
    });
    viewSelector.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.onViewChange(val);
    });

    header.appendChild(shaderBtn);
    header.appendChild(viewSelector);

    // Main area with Cube and Sidebar
    const main = document.createElement('div');
    main.className = 'daz-main';

    // Cube Container
    const cubeContainer = document.createElement('div');
    cubeContainer.className = 'daz-cube-container';

    const cube = document.createElement('div');
    cube.className = 'daz-cube';
    this.cubeEl = cube;

    const faces = ['Front', 'Back', 'Top', 'Bottom', 'Left', 'Right'];
    faces.forEach(f => {
      const face = document.createElement('div');
      face.className = `daz-cube-face daz-face-${f.toLowerCase()}`;
      face.textContent = f;
      face.addEventListener('click', () => this.onCubeFaceClick(f.toUpperCase()));
      cube.appendChild(face);
    });

    // Rotation Ring (Placeholder)
    const ring = document.createElement('div');
    ring.className = 'daz-rotation-ring';
    
    cubeContainer.appendChild(ring);
    cubeContainer.appendChild(cube);

    // Add small arrow buttons at the sides of the cube
    const arrowButtons = [
      { id: 'top', label: '&#9650;', view: 'TOP' },
      { id: 'bottom', label: '&#9660;', view: 'BOTTOM' },
      { id: 'left', label: '&#9664;', view: 'LEFT' },
      { id: 'right', label: '&#9654;', view: 'RIGHT' }
    ];

    arrowButtons.forEach(b => {
      const btn = document.createElement('div');
      btn.className = `daz-arrow-btn daz-arrow-${b.id}`;
      btn.innerHTML = b.label;
      btn.title = `Switch to ${b.view} View`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent clicking through to container
        this.onArrowClick(b.id);
      });
      cubeContainer.appendChild(btn);
    });

    // Sidebar with Buttons
    const sidebar = document.createElement('div');
    sidebar.className = 'daz-sidebar';

    const buttons = [
      { id: 'rotate', label: '&#8634;', title: 'Rotate View' },
      { id: 'pan', label: '&#10018;', title: 'Pan View' },
      { id: 'zoom', label: '&#128269;', title: 'Zoom' },
      { id: 'zoom_window', label: '&#128270;', title: 'Zoom Window' }
    ];

    buttons.forEach(b => {
      const btn = document.createElement('div');
      btn.className = `daz-btn daz-btn-${b.id}`;
      btn.innerHTML = b.label;
      btn.title = b.title;
      btn.addEventListener('click', () => this.onButtonClick(b.id));
      sidebar.appendChild(btn);
    });

    main.appendChild(cubeContainer);
    main.appendChild(sidebar);

    container.appendChild(header);
    container.appendChild(main);

    // Set initial cube rotation (Top View)
    setTimeout(() => {
      this.rotateCubeToFace('TOP');
      if (this.viewSelectorEl) this.viewSelectorEl.value = 'TOP';
    }, 100);

    return container;
  }

  public getElement(): HTMLElement {
    return this.element;
  }

  private onCubeFaceClick(face: string) {
    console.log(`Cube face clicked: ${face}`);
    
    if (this.currentView === face) {
      // Clicked the active face! Switch to orthogonal view for that face!
      const orthogonalView = `ORTHOGONAL_${face}`;
      this.rotateCubeToFace('ORTHOGONAL'); // Show cube in orthogonal 3D orientation
      this.viewer.setCameraView(orthogonalView);
      this.currentView = orthogonalView;
    } else {
      this.rotateCubeToFace(face);
      this.viewer.setCameraView(face);
      this.currentView = face;
    }
  }

  private onArrowClick(direction: string) {
    const step = 15; // Equivalent to 15 pixels of mouse movement
    
    if (direction === 'left') {
      this.viewer.orbit(-step, 0);
    } else if (direction === 'right') {
      this.viewer.orbit(step, 0);
    } else if (direction === 'top') {
      this.viewer.orbit(0, step);
    } else if (direction === 'bottom') {
      this.viewer.orbit(0, -step);
    }

    this.rotateCubeToFace('ORTHOGONAL');
    this.currentView = 'ORTHOGONAL';
    
    // Update dropdown
    if (this.viewSelectorEl) {
      this.viewSelectorEl.value = 'ORTHOGONAL';
    }
  }

  private onViewChange(view: string) {
    console.log(`View changed to: ${view}`);
    this.rotateCubeToFace(view);
    this.viewer.setCameraView(view);
  }

  private onButtonClick(action: string) {
    console.log(`Button clicked: ${action}`);
    if (action === 'pan') {
      this.app.execute('PAN');
    } else if (action === 'zoom_window') {
      this.app.execute('ZOOM');
      this.app.inputText('WINDOW');
    }
    // Handle other actions...
  }

  private rotateCubeToFace(face: string) {
    if (!this.cubeEl) return;
    
    let transform = '';
    switch (face) {
      case 'FRONT': transform = 'rotateX(0deg) rotateY(0deg)'; break;
      case 'BACK': transform = 'rotateX(0deg) rotateY(180deg)'; break;
      case 'TOP': transform = 'rotateX(-90deg) rotateY(0deg)'; break;
      case 'BOTTOM': transform = 'rotateX(90deg) rotateY(0deg)'; break;
      case 'LEFT': transform = 'rotateX(0deg) rotateY(90deg)'; break;
      case 'RIGHT': transform = 'rotateX(0deg) rotateY(-90deg)'; break;
      case 'ORTHOGONAL':
      case 'PERSPECTIVE': transform = 'rotateX(-30deg) rotateY(45deg)'; break;
      default: transform = 'rotateX(-30deg) rotateY(45deg)'; // Default iso view
    }
    
    this.cubeEl.style.transform = transform;
  }
}
