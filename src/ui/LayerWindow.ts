import { ToolWindow } from "./ToolWindow";
import { LayerDataTable } from "./LayerDataTable";
import { LayerManager } from "../core/model/Layer";
import { ColorSelectList } from "./ColorSelectList";
import { LtypeSelectList } from "./LtypeSelectList";

export class LayerWindow {
  private container: HTMLElement;
  private table!: LayerDataTable;
  private colorSelectList: ColorSelectList;
  private ltypeSelectList: LtypeSelectList;
  private filterInput!: HTMLInputElement;

  constructor(
    private toolWindow: ToolWindow, 
    private layerManager: LayerManager, 
    private onSelectLayer?: (name: string) => void,
    private onColorChange?: (layerName: string, color: number) => void,
    private onLtypeChange?: (layerName: string, ltype: string) => void,
    private onVisibilityChange?: (layerName: string, action: string) => void,
    private onFreezeChange?: (layerName: string, action: string) => void,
    private onCommand?: (cmd: string) => void
  ) {
    this.container = document.createElement('div');
    this.container.className = 'layer-window-inner';
    this.container.style.position = 'relative';
    
    this.colorSelectList = new ColorSelectList();
    this.ltypeSelectList = new LtypeSelectList();
    
    this.createUI();
    
    this.table.onSelect((index) => {
      const layers = this.layerManager.listLayers();
      const layer = layers[index];
      if (layer && this.onSelectLayer) {
        this.onSelectLayer(layer.name);
      }
    });

    this.table.onColorRightClick((layerName, x, y) => {
      this.colorSelectList.show(x, y, (color) => {
        if (this.onColorChange) {
          this.onColorChange(layerName, color);
        }
      });
    });

    this.table.onLtypeRightClick((layerName, x, y) => {
      this.ltypeSelectList.show(x, y, (ltype) => {
        if (this.onLtypeChange) {
          this.onLtypeChange(layerName, ltype);
        }
      });
    });

    this.table.onVisibilityToggle((layerName) => {
      const layer = this.layerManager.getLayer(layerName);
      if (layer && this.onVisibilityChange) {
        const action = layer.isVisible ? 'Off' : 'On';
        this.onVisibilityChange(layerName, action);
      }
    });

    this.table.onFreezeToggle((layerName) => {
      const layer = this.layerManager.getLayer(layerName);
      if (layer && this.onFreezeChange) {
        const action = layer.isFrozen ? 'Thaw' : 'Freeze';
        this.onFreezeChange(layerName, action);
      }
    });
    
    this.toolWindow.setContent(this.container);
  }

  private createUI() {
    // Filter
    const filterContainer = document.createElement('div');
    filterContainer.className = 'layer-filter-container';
    filterContainer.style.padding = '5px';
    
    this.filterInput = document.createElement('input');
    this.filterInput.placeholder = 'Filter';
    this.filterInput.style.width = '100%';
    this.filterInput.style.padding = '4px';
    this.filterInput.style.backgroundColor = 'var(--bg-color)';
    this.filterInput.style.border = '1px solid var(--border-color)';
    this.filterInput.style.color = 'var(--text-color)';
    this.filterInput.style.fontFamily = 'var(--font-mono)';
    
    this.filterInput.addEventListener('input', () => {
      this.refresh();
    });
    
    filterContainer.appendChild(this.filterInput);
    this.container.appendChild(filterContainer);
    
    // Toolbar
    const toolbar = document.createElement('div');
    toolbar.className = 'layer-toolbar';
    toolbar.style.display = 'flex';
    toolbar.style.gap = '2px';
    toolbar.style.padding = '0 5px 5px 5px';
    toolbar.style.borderBottom = '1px solid var(--border-color)';
    
    const buttons = [
      { title: 'Show All', icon: '👁' },
      { title: 'Hide All', icon: '🕶' },
      { title: 'Lock All', icon: '🔒' },
      { title: 'Unlock All', icon: '🔓' },
      { title: 'New Layer', icon: '➕' },
      { title: 'Delete Layer', icon: '➖' },
      { title: 'Set Current', icon: '🔨' }
    ];
    
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.title = b.title;
      btn.textContent = b.icon;
      btn.style.padding = '2px 6px';
      btn.style.backgroundColor = 'var(--panel-bg)';
      btn.style.border = '1px solid var(--border-color)';
      btn.style.color = 'var(--text-color)';
      btn.style.cursor = 'pointer';
      
      btn.addEventListener('click', () => {
        const layers = this.layerManager.listLayers();
        const filterText = this.filterInput ? this.filterInput.value.toLowerCase() : '';
        const filteredLayers = layers.filter(l => l.name.toLowerCase().includes(filterText));
        
        const selectedIndex = this.table.getSelectedRowIndex();
        const selectedLayer = filteredLayers[selectedIndex];

        switch (b.title) {
          case 'Show All':
            if (this.onCommand) this.onCommand(`LAYER On ${layers.map(l => l.name).join(' ')}`);
            break;
          case 'Hide All':
            if (this.onCommand) this.onCommand(`LAYER Off ${layers.map(l => l.name).join(' ')}`);
            break;
          case 'Lock All':
            if (this.onCommand) this.onCommand(`LAYER Lock ${layers.map(l => l.name).join(' ')}`);
            break;
          case 'Unlock All':
            if (this.onCommand) this.onCommand(`LAYER Unlock ${layers.map(l => l.name).join(' ')}`);
            break;
          case 'New Layer':
            this.showNewLayerPopup();
            break;
          case 'Delete Layer':
            if (selectedLayer && this.onCommand) {
              this.onCommand(`LAYER Delete ${selectedLayer.name}`);
            }
            break;
          case 'Set Current':
            if (selectedLayer && this.onCommand) {
              this.onCommand(`LAYER Set ${selectedLayer.name}`);
            }
            break;
        }
      });
      
      toolbar.appendChild(btn);
    });
    
    this.container.appendChild(toolbar);
    
    // Table Container
    const tableContainer = document.createElement('div');
    tableContainer.className = 'layer-table-container';
    this.container.appendChild(tableContainer);
    
    this.table = new LayerDataTable(tableContainer);
    
    this.refresh();
  }

  public refresh() {
    const layers = this.layerManager.listLayers();
    const filterText = this.filterInput ? this.filterInput.value.toLowerCase() : '';
    
    const filteredLayers = layers.filter(l => 
      l.name.toLowerCase().includes(filterText)
    );

    this.table.setLayers(filteredLayers.map(l => ({
      name: l.name,
      visible: l.isVisible,
      frozen: l.isFrozen,
      color: l.color,
      linetype: l.linetype
    })));
    
    const currentIndex = layers.findIndex(l => l.name === this.layerManager.currentLayerName);
    if (currentIndex >= 0) {
      this.table.selectRow(currentIndex, false);
    }
  }

  private showNewLayerPopup() {
    const popup = document.createElement('div');
    popup.className = 'layer-popup';
    popup.style.position = 'absolute';
    popup.style.top = '50px';
    popup.style.left = '10px';
    popup.style.right = '10px';
    popup.style.backgroundColor = 'var(--panel-bg)';
    popup.style.border = '1px solid var(--border-color)';
    popup.style.padding = '10px';
    popup.style.zIndex = '1000';
    popup.style.boxShadow = '0 2px 10px rgba(0,0,0,0.5)';

    const label = document.createElement('div');
    label.textContent = 'New Layer Name:';
    label.style.marginBottom = '5px';
    popup.appendChild(label);

    const input = document.createElement('input');
    input.style.width = '100%';
    input.style.marginBottom = '10px';
    input.style.backgroundColor = 'var(--bg-color)';
    input.style.border = '1px solid var(--border-color)';
    input.style.color = 'var(--text-color)';
    popup.appendChild(input);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'flex-end';
    actions.style.gap = '5px';

    const okBtn = document.createElement('button');
    okBtn.textContent = 'OK';
    okBtn.style.padding = '2px 10px';
    okBtn.addEventListener('click', () => {
      const name = input.value.trim();
      if (name && this.onCommand) {
        this.onCommand(`LAYER New ${name}`);
      }
      popup.remove();
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.style.padding = '2px 10px';
    cancelBtn.addEventListener('click', () => {
      popup.remove();
    });

    actions.appendChild(okBtn);
    actions.appendChild(cancelBtn);
    popup.appendChild(actions);

    this.container.appendChild(popup);
    input.focus();
  }
}
