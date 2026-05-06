import { Command, CommandResponse } from "./types"

export class MirrorCommand implements Command {
  step = 0
  targetIds: string[] = []
  p1 = { x: 0, y: 0 }
  p2 = { x: 0, y: 0 }

  constructor(ids?: string[]) {
    if (ids && ids.length > 0) {
      this.targetIds = ids;
      this.step = 1;
    }
  }

  onInput(text: string, id: string): CommandResponse | undefined {
    // Step 0: Select object (receives ID)
    if (this.step === 0 && text) {
      this.targetIds = [text];
      this.step = 1;
      return "First point of mirror line:";
    }

    if (this.step === 3) {
      const val = text.trim().toUpperCase();
      if (val === "Y" || val === "YES") {
        return this.finish(true);
      }
      if (val === "N" || val === "NO" || val === "") {
        return this.finish(false);
      }
      return "Delete old objects? (Y/N):";
    }
  }

  onPoint(x: number, y: number, id: string): CommandResponse {
    if (this.step === 0) {
      return "Select objects to mirror:";
    }

    if (this.step === 1) {
      this.p1 = { x, y };
      this.step = 2;
      return "Second point of mirror line:";
    } else if (this.step === 2) {
      this.p2 = { x, y };
      this.step = 3;
      return "Delete old objects? (Y/N) <N>:";
    }
    return "";
  }

  private finish(deleteOriginal: boolean) {
    const ids = [...this.targetIds];
    const p1 = { ...this.p1 };
    const p2 = { ...this.p2 };
    this.step = 0;
    this.targetIds = [];
    return { action: "mirror", ids, p1, p2, deleteOriginal } as const;
  }

  getReferencePoints() {
    if (this.step === 2) {
      return [this.p1];
    }
    if (this.step >= 3) {
      return [this.p1, this.p2];
    }
    return [];
  }

  getBasePoint(): { x: number; y: number } | null {
    if (this.step === 2) {
      return this.p1;
    }
    return null;
  }

  getPrompt() {
    if (this.step === 0) return "Select objects to mirror:";
    if (this.step === 1) return "First point of mirror line:";
    if (this.step === 2) return "Second point of mirror line:";
    return "Delete old objects? (Y/N):";
  }
}
