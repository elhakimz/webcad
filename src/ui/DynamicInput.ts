export class DynamicInput {
  private element: HTMLElement;
  private inputElement: HTMLInputElement;
  private optionsElement!: HTMLElement;
  private controlsElement: HTMLElement;
  private footerElement: HTMLElement;
  private defaultInputSubmittedCallback?: (text: string) => void;
  private defaultOptionClickedCallback?: (option: string) => void;
  private onInputSubmittedCallback?: (text: string) => void;
  private onOptionClickedCallback?: (option: string) => void;
  private hasControls: boolean = false;
  private isMouseOver: boolean = false;

  constructor() {
    this.element = document.createElement('div');
    this.element.id = 'dynamic-input';
    this.element.style.position = 'fixed';
    this.element.style.display = 'none';
    this.element.style.pointerEvents = 'auto'; // Need to click options!
    this.element.style.backgroundColor = 'rgba(30, 30, 30, 0.9)';
    this.element.style.color = '#ffffff'; // Neutral white
    this.element.style.padding = '6px 8px';
    this.element.style.borderRadius = '2px';
    this.element.style.fontSize = '11px';
    this.element.style.fontFamily = 'monospace';
    this.element.style.zIndex = '10000';
    this.element.style.whiteSpace = 'pre';
    this.element.style.border = '1px solid #555555';
    this.element.style.boxShadow = '0 2px 5px rgba(0,0,0,0.5)';
    this.element.style.display = 'flex';
    this.element.style.flexDirection = 'column';
    this.element.style.gap = '4px';

    const textContainer = document.createElement('div');
    textContainer.id = 'dynamic-input-text';
    this.element.appendChild(textContainer);
    
    // Controls container (for custom UI like select/number)
    this.controlsElement = document.createElement('div');
    this.controlsElement.style.display = 'flex';
    this.controlsElement.style.flexDirection = 'column';
    this.controlsElement.style.gap = '2px';
    this.element.appendChild(this.controlsElement);

    // Input field
    this.inputElement = document.createElement('input');
    this.inputElement.type = 'text';
    this.inputElement.style.backgroundColor = '#222222';
    this.inputElement.style.color = '#ffffff';
    this.inputElement.style.border = '1px solid #777777';
    this.inputElement.style.fontSize = '11px';
    this.inputElement.style.fontFamily = 'monospace';
    this.inputElement.style.padding = '2px 4px';
    this.inputElement.style.outline = 'none';
    this.inputElement.style.width = '100px';
    this.element.appendChild(this.inputElement);

    // Options container
    this.optionsElement = document.createElement('div');
    this.optionsElement.style.display = 'flex';
    this.optionsElement.style.gap = '6px';
    this.optionsElement.style.flexWrap = 'wrap';
    this.element.appendChild(this.optionsElement);

    // Footer container
    this.footerElement = document.createElement('div');
    this.footerElement.style.fontSize = '9px';
    this.footerElement.style.color = '#777777';
    this.footerElement.style.textAlign = 'center';
    this.footerElement.style.borderTop = '1px solid #444444';
    this.footerElement.style.paddingTop = '2px';
    this.footerElement.style.marginTop = '2px';
    this.element.appendChild(this.footerElement);

    document.body.appendChild(this.element);

    this.inputElement.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const text = this.inputElement.value;
        this.inputElement.value = '';
        if (this.onInputSubmittedCallback) {
          this.onInputSubmittedCallback(text);
        }
        this.isMouseOver = false;
      } else if (e.key === 'Escape') {
        this.hide();
      }
    });

    // Auto-submit for single-letter command options (A, L, C, U)
    this.inputElement.addEventListener('input', () => {
      const val = this.inputElement.value.trim().toUpperCase();
      if (['A', 'L', 'C', 'U'].includes(val)) {
        this.inputElement.value = '';
        if (this.onInputSubmittedCallback) {
          this.onInputSubmittedCallback(val);
        }
        this.isMouseOver = false;
      }
    });

    // Prevent clicks inside the element from bubbling to the canvas
    this.element.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    this.element.addEventListener('mouseenter', () => {
      this.isMouseOver = true;
    });
    this.element.addEventListener('mouseleave', () => {
      this.isMouseOver = false;
    });
  }

  show(x: number, y: number, lines: string[], options: string[] = [], showInput: boolean = true, controls?: { type: 'select' | 'number', label: string, value: string | number, options?: string[] }[], footer?: string, placeholder?: string, force: boolean = false) {
    if (this.isMouseOver && !force) return;
    if (this.inputElement.placeholder !== (placeholder || '')) {
      this.inputElement.value = '';
      this.inputElement.placeholder = placeholder || '';
    }
    const textContainer = this.element.querySelector('#dynamic-input-text') as HTMLElement;
    if (textContainer) {
      textContainer.textContent = lines.join('\n');
    }
    
    // Render controls
    this.controlsElement.innerHTML = '';
    if (controls) {
      controls.forEach(ctrl => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.gap = '10px';
        row.style.alignItems = 'center';
        
        const lbl = document.createElement('span');
        lbl.textContent = ctrl.label + ':';
        row.appendChild(lbl);
        
        if (ctrl.type === 'select') {
          const sel = document.createElement('select');
          sel.style.backgroundColor = '#222222';
          sel.style.color = '#ffffff';
          sel.style.border = '1px solid #777777';
          sel.style.fontSize = '11px';
          sel.style.fontFamily = 'monospace';
          sel.style.padding = '1px';
          ctrl.options?.forEach(opt => {
            const o = document.createElement('option');
            o.value = opt;
            o.textContent = opt;
            if (opt === ctrl.value) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', () => {
            ctrl.value = sel.value;
            if ((ctrl as any).onChange) {
              (ctrl as any).onChange(sel.value);
            }
          });
          row.appendChild(sel);
        } else if (ctrl.type === 'number') {
          const inp = document.createElement('input');
          inp.type = 'number';
          inp.style.backgroundColor = '#222222';
          inp.style.color = '#ffffff';
          inp.style.border = '1px solid #777777';
          inp.style.fontSize = '11px';
          inp.style.fontFamily = 'monospace';
          inp.style.width = '50px';
          inp.style.padding = '1px 2px';
          inp.value = ctrl.value.toString();
          inp.addEventListener('input', () => {
            ctrl.value = parseFloat(inp.value);
            if ((ctrl as any).onChange) {
              (ctrl as any).onChange(parseFloat(inp.value));
            }
          });
          row.appendChild(inp);
        }
        this.controlsElement.appendChild(row);
      });
    }

    // Render options
    this.optionsElement.innerHTML = '';
    options.forEach(option => {
      const btn = document.createElement('span');
      btn.textContent = `[${option}]`;
      btn.style.cursor = 'pointer';
      btn.style.color = '#3b82f6'; // Bright blue
      btn.style.textDecoration = 'underline';
      btn.addEventListener('click', () => {
        this.inputElement.value = '';
        this.isMouseOver = false;
        if (this.onOptionClickedCallback) {
          this.onOptionClickedCallback(option);
        }
      });
      this.optionsElement.appendChild(btn);
    });

    this.inputElement.style.display = showInput ? 'block' : 'none';

    const wasHidden = this.element.style.display === 'none';
    const justAddedControls = !this.hasControls && !!(controls && controls.length > 0);
    this.hasControls = !!(controls && controls.length > 0);

    this.element.style.display = 'flex';
    
    if (wasHidden || !this.hasControls || justAddedControls) {
      if (this.hasControls) {
        this.element.style.left = '50%';
        this.element.style.top = '50%';
        this.element.style.transform = 'translate(-50%, -50%)';
      } else {
        this.element.style.left = `${x + 15}px`;
        this.element.style.top = `${y + 15}px`;
        this.element.style.transform = 'none';
      }
    }

    if (footer) {
      this.footerElement.textContent = footer;
      this.footerElement.style.display = 'block';
    } else {
      this.footerElement.style.display = 'none';
    }

    // Focus input if shown and not already focused
    if (showInput && document.activeElement !== this.inputElement) {
      setTimeout(() => this.inputElement.focus(), 0);
    }
  }

  hide() {
    this.element.style.display = 'none';
    if (this.defaultInputSubmittedCallback) {
      this.onInputSubmittedCallback = this.defaultInputSubmittedCallback;
    }
    if (this.defaultOptionClickedCallback) {
      this.onOptionClickedCallback = this.defaultOptionClickedCallback;
    }
  }

  onInputSubmitted(callback: (text: string) => void) {
    this.onInputSubmittedCallback = callback;
    if (!this.defaultInputSubmittedCallback) {
      this.defaultInputSubmittedCallback = callback;
    }
  }

  focus() {
    if (this.inputElement) {
      this.inputElement.focus();
    }
  }

  onOptionClicked(callback: (option: string) => void) {
    this.onOptionClickedCallback = callback;
    if (!this.defaultOptionClickedCallback) {
      this.defaultOptionClickedCallback = callback;
    }
  }

  destroy() {
    if (this.element.parentNode) {
      this.element.parentNode.removeChild(this.element);
    }
  }
}
