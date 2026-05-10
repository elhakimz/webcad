import { Viewer } from "../render/Viewer";
import { App } from "../app";

export class DazViewControl {
  private element: HTMLElement;
  private viewer: Viewer;
  private app: App;
  private cubeEl: HTMLElement | null = null;
  private currentView = 'TOP';
  private viewSelectorEl: HTMLSelectElement | null = null;
  private currentShadingMode: 'WIREFRAME' | 'PHONG' = 'WIREFRAME';

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
    shaderBtn.title = "Shader Options";
    shaderBtn.addEventListener('click', () => {
      this.currentShadingMode = this.currentShadingMode === 'WIREFRAME' ? 'PHONG' : 'WIREFRAME';
      this.viewer.setShadingMode(this.currentShadingMode);
      shaderBtn.title = `Shader: ${this.currentShadingMode}`;
      if (this.currentShadingMode === 'PHONG') {
        shaderBtn.style.color = '#00ff00';
      } else {
        shaderBtn.style.color = '';
      }
    });

    const viewSelector = document.createElement('select');
    viewSelector.className = 'daz-view-selector';
    this.viewSelectorEl = viewSelector;
    const views = ['Perspective View', 'Top View', 'Bottom View', 'Left View', 'Right View', 'Front View', 'Back View'];
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
      // Clicked the active face! Switch to perspective view for that face!
      const perspectiveView = `PERSPECTIVE_${face}`;
      this.rotateCubeToFace('PERSPECTIVE'); // Show cube in perspective
      this.viewer.setCameraView(perspectiveView);
      this.currentView = perspectiveView;
    } else {
      this.rotateCubeToFace(face);
      this.viewer.setCameraView(face);
      this.currentView = face;
    }
  }

  private onArrowClick(direction: string) {
    let nextView = '';
    const current = this.currentView;

    if (current === 'FRONT') {
      if (direction === 'top') nextView = 'FRONT_TOP';
      else if (direction === 'bottom') nextView = 'FRONT_BOTTOM';
      else if (direction === 'left') nextView = 'FRONT_LEFT';
      else if (direction === 'right') nextView = 'FRONT_RIGHT';
    } else if (current === 'BACK') {
      if (direction === 'top') nextView = 'BACK_TOP';
      else if (direction === 'bottom') nextView = 'BACK_BOTTOM';
      else if (direction === 'left') nextView = 'BACK_LEFT';
      else if (direction === 'right') nextView = 'BACK_RIGHT';
    } else if (current === 'TOP') {
      if (direction === 'top') nextView = 'BACK_TOP';
      else if (direction === 'bottom') nextView = 'FRONT_TOP';
      else if (direction === 'left') nextView = 'TOP_LEFT';
      else if (direction === 'right') nextView = 'TOP_RIGHT';
    } else {
      // Fallback: just use default perspective if we are already in an edge view or unknown
      nextView = 'PERSPECTIVE';
    }

    this.rotateCubeToFace('PERSPECTIVE');
    this.viewer.setCameraView(nextView);
    this.currentView = nextView;
    
    // Update dropdown
    if (this.viewSelectorEl) {
      if (nextView.includes('_')) {
        this.viewSelectorEl.value = 'PERSPECTIVE';
      } else {
        this.viewSelectorEl.value = nextView;
      }
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
      case 'PERSPECTIVE': transform = 'rotateX(-30deg) rotateY(45deg)'; break;
      default: transform = 'rotateX(-30deg) rotateY(45deg)'; // Default iso view
    }
    
    this.cubeEl.style.transform = transform;
  }
}
