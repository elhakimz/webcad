export class AppTabs {
  private container: HTMLElement;
  private modellingTab: HTMLElement;
  private scriptingTab: HTMLElement;

  constructor(private onTabChange: (tab: 'modelling' | 'scripting') => void) {
    this.container = document.createElement('div');
    this.container.id = 'app-tabs';
    this.container.className = 'app-tabs';

    this.modellingTab = this.createTab('Modelling', 'modelling', true);
    this.scriptingTab = this.createTab('Scripting', 'scripting', false);

    this.container.appendChild(this.modellingTab);
    this.container.appendChild(this.scriptingTab);
  }

  private createTab(label: string, id: 'modelling' | 'scripting', active: boolean): HTMLElement {
    const tab = document.createElement('div');
    tab.className = `app-tab ${active ? 'active' : ''}`;
    tab.dataset.testid = `app-tab-${id}`;
    tab.textContent = label;
    tab.onclick = () => {
      if (tab.classList.contains('active')) return;
      
      this.modellingTab.classList.remove('active');
      this.scriptingTab.classList.remove('active');
      tab.classList.add('active');
      
      this.onTabChange(id);
    };
    return tab;
  }

  public getElement(): HTMLElement {
    return this.container;
  }
}
