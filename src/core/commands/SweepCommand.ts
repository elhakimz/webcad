import { Command, CommandResponse, CommandAction } from "./types"
import { UnitsConfig, IDocument } from "../model/Document"
import { Entity } from "../model/Entity"
import { Polyline } from "../model/Polyline"
import { Circle } from "../model/Circle"
import { Spline } from "../model/Spline"
import { Line } from "../model/Line"
import { Arc } from "../model/Arc"

export class SweepCommand implements Command {
  step = 0
  profileEntity: Entity | null = null
  spineEntity: Entity | null = null
  mode: 'SOLID' | 'HOLLOW' = 'SOLID'
  cornerMode: 'DEFAULT' | 'MITER' | 'ROUND' = 'DEFAULT'

  setEntity(entity: Entity) {
    if (this.step === 1) {
      const isClosed = ('closed' in entity && (entity as any).closed) || 
                       ('isClosed' in entity && (entity as any).isClosed) || 
                       'r' in entity; // Circle is always closed
      
      if (this.mode === 'SOLID' && !isClosed) {
        return; // Reject open profiles for SOLID mode
      }
      
      this.profileEntity = entity;
      this.step = 2;
    } else if (this.step === 2) {
      // Spine can be Line, Arc, or Polyline
      const isSpine = 'x1' in entity || 'startAngle' in entity || 'vertices' in entity;
      if (isSpine) {
        this.spineEntity = entity;
        this.step = 3;
      }
    }
  }

  onInput(text: string, _id: string, _units: UnitsConfig, _pickPt?: { x: number, y: number }, doc?: IDocument): CommandResponse | undefined {
    if (this.step === 0) {
      const upper = text.toUpperCase().trim();
      if (upper === 'H' || upper === 'HOLLOW') {
        this.mode = 'HOLLOW';
        this.step = 1;
        return "Select profile:";
      } else if (upper === 'S' || upper === 'SOLID' || text === '') {
        this.mode = 'SOLID';
        this.step = 1;
        return "Select profile:";
      }
      return "Invalid option. Mode [Solid/Hollow] <Solid>:";
    }

    if (this.step === 1 && !this.profileEntity) {
      if (doc) {
        const entity = doc.getEntity(text);
        if (entity) {
          this.setEntity(entity);
          return this.getPrompt();
        }
      }
    }

    if (this.step === 2 && !this.spineEntity) {
      if (doc) {
        const entity = doc.getEntity(text);
        if (entity) {
          this.setEntity(entity);
          return this.getPrompt();
        }
      }
    }

    if (this.step === 3) {
      const upper = text.toUpperCase().trim();
      if (upper === 'M' || upper === 'MITER') {
        this.cornerMode = 'MITER';
        this.step = 4;
      } else if (upper === 'R' || upper === 'ROUND') {
        this.cornerMode = 'ROUND';
        this.step = 4;
      } else if (upper === 'D' || upper === 'DEFAULT' || text === '') {
        this.cornerMode = 'DEFAULT';
        this.step = 4;
      } else {
        return "Invalid option. Corner mode [Default/Miter/Round] <Default>:";
      }
      
      if (this.step === 4 && this.profileEntity && this.spineEntity) {
        return {
          action: "sweep",
          id1: this.profileEntity.id,
          id2: this.spineEntity.id,
          type: this.mode,
          cornerMode: this.cornerMode
        } as CommandAction;
      }
    }
    
    return this.getPrompt();
  }

  onPoint(_x: number, _y: number, _id: string, _units: UnitsConfig): CommandResponse {
    return this.getPrompt();
  }

  getPrompt(): string {
    if (this.step === 0) return "Mode [Solid/Hollow] <Solid>:";
    if (this.step === 1) return "Select profile:";
    if (this.step === 2) return "Select spine:";
    if (this.step === 3) return "Corner mode [Default/Miter/Round] <Default>:";
    return "Press Enter to complete.";
  }
}
