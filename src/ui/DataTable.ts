export class DataTable {
  protected container: HTMLElement;
  protected tableEl: HTMLTableElement;
  protected headers: string[] = [];
  protected rows: any[][] = [];
  protected selectedRowIndex: number = -1;
  protected onSelectCallback: ((index: number) => void) | null = null;
  protected columnWidths: number[] = [];

  constructor(protected parent: HTMLElement) {
    this.container = document.createElement('div');
    this.container.className = 'data-table-container';
    
    this.tableEl = document.createElement('table');
    this.tableEl.className = 'data-table';
    this.container.appendChild(this.tableEl);
    
    this.parent.appendChild(this.container);
  }

  public setData(headers: string[], rows: any[][]) {
    this.headers = headers;
    this.rows = rows;
    this.render();
  }

  public render() {
    this.tableEl.innerHTML = '';
    
    // Header
    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    this.headers.forEach((header, index) => {
      const th = document.createElement('th');
      th.textContent = header;
      th.style.position = 'relative';
      
      if (this.columnWidths[index]) {
        th.style.width = `${this.columnWidths[index]}px`;
      }
      
      // Don't add resizer to the last column
      if (index < this.headers.length - 1) {
        const resizer = document.createElement('div');
        resizer.className = 'col-resizer';
        th.appendChild(resizer);
        this.addResizerEvents(resizer, th, index);
      }
      
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    this.tableEl.appendChild(thead);
    
    // Body
    const tbody = document.createElement('tbody');
    this.rows.forEach((row, rowIndex) => {
      const tr = document.createElement('tr');
      tr.className = 'selectable-row';
      if (rowIndex === this.selectedRowIndex) {
        tr.classList.add('active-row');
      }
      
      row.forEach(cell => {
        const td = document.createElement('td');
        if (cell instanceof HTMLElement) {
          td.appendChild(cell);
        } else {
          td.textContent = cell;
        }
        tr.appendChild(td);
      });
      
      tr.addEventListener('click', () => {
        this.selectRow(rowIndex);
      });
      
      tbody.appendChild(tr);
    });
    this.tableEl.appendChild(tbody);
  }

  public selectRow(index: number, triggerCallback: boolean = true) {
    this.selectedRowIndex = index;
    const rows = this.tableEl.querySelectorAll('tbody tr');
    rows.forEach((row, idx) => {
      if (idx === index) {
        row.classList.add('active-row');
      } else {
        row.classList.remove('active-row');
      }
    });
    if (triggerCallback && this.onSelectCallback) {
      this.onSelectCallback(index);
    }
  }

  public onSelect(callback: (index: number) => void) {
    this.onSelectCallback = callback;
  }

  public getSelectedRowIndex(): number {
    return this.selectedRowIndex;
  }

  private addResizerEvents(resizer: HTMLElement, th: HTMLTableCellElement, index: number) {
    let startX: number;
    let startWidth: number;
    let nextTh: HTMLTableCellElement | null;
    let nextStartWidth: number;

    const doDrag = (e: MouseEvent) => {
      const delta = e.clientX - startX;
      const newWidth = startWidth + delta;
      
      if (nextTh) {
        const newNextWidth = nextStartWidth - delta;
        if (newWidth > 30 && newNextWidth > 30) {
          th.style.width = `${newWidth}px`;
          nextTh.style.width = `${newNextWidth}px`;
          this.columnWidths[index] = newWidth;
          this.columnWidths[index + 1] = newNextWidth;
        }
      }
    };

    const stopDrag = () => {
      document.documentElement.removeEventListener('mousemove', doDrag, false);
      document.documentElement.removeEventListener('mouseup', stopDrag, false);
    };

    resizer.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      startWidth = th.offsetWidth;
      nextTh = th.nextElementSibling as HTMLTableCellElement;
      if (nextTh) {
        nextStartWidth = nextTh.offsetWidth;
      }
      
      document.documentElement.addEventListener('mousemove', doDrag, false);
      document.documentElement.addEventListener('mouseup', stopDrag, false);
      e.preventDefault();
    });
  }
}
