import { Command, CommandResponse, CommandAction } from "./types";
import { UnitsConfig } from "../model/Document";
import { Point, polygonArea, polylineLength } from "../engine/MathUtils";

export class AreaCommand implements Command {
  vertices: Point[] = [];

  onPoint(x: number, y: number, _id: string, _units: UnitsConfig): CommandResponse {
    this.vertices.push({ x, y });
    return `Point ${this.vertices.length} added. Specify next point or [Enter] to calculate:`;
  }

  onInput(text: string, _id: string, _units: UnitsConfig): CommandResponse | undefined {
    if (text === "" || text.toUpperCase() === "ENTER") {
      if (this.vertices.length < 3) {
        return "At least 3 points are required. Specify next point:";
      }
      const area = polygonArea(this.vertices);
      const perimeter = polylineLength(this.vertices);
      
      // We need to return an action to terminate the command and print the result.
      // We use 'area' action and pass area in 'value' and perimeter in 'distance'.
      const action: CommandAction = { 
        action: 'area', 
        value: area, 
        distance: perimeter 
      };
      
      this.vertices = []; // Reset state
      return action as CommandResponse;
    }
  }

  getPrompt() {
    return "AREA Specify first corner point:";
  }
}
