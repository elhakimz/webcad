export class DraftingState {
  orthoEnabled: boolean = false;
  gridEnabled: boolean = false;
  gridSpacing: number = 10;
  snapEnabled: boolean = false;
  snapSpacing: number = 5;
  xyzEnabled: boolean = true;
  mode3d: boolean = false;

  private listeners: (() => void)[] = [];

  subscribe(listener: () => void) {
    this.listeners.push(listener);
  }

  notify() {
    this.listeners.forEach(l => l());
  }

  toggleOrtho() {
    this.orthoEnabled = !this.orthoEnabled;
    this.notify();
  }

  toggleGrid() {
    this.gridEnabled = !this.gridEnabled;
    this.notify();
  }

  toggleSnap() {
    this.snapEnabled = !this.snapEnabled;
    this.notify();
  }

  toggleXyz() {
    this.xyzEnabled = !this.xyzEnabled;
    this.notify();
  }

  toggleMode3d() {
    this.mode3d = !this.mode3d;
    this.notify();
  }

  setGridSpacing(val: number) {
    if (val > 0) {
      this.gridSpacing = val;
      this.notify();
    }
  }

  setSnapSpacing(val: number) {
    if (val > 0) {
      this.snapSpacing = val;
      this.notify();
    }
  }
}
