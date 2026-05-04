import { Command, CommandResponse } from "./types"
import { OpenCascadeService } from "../io/OpenCascadeService"

export class Test3DCommand implements Command {
  onPoint(x: number, y: number): CommandResponse {
    const ocService = OpenCascadeService.getInstance();
    const oc = ocService.OC;

    try {
      // Create an OCCT Box between two points (100x100x100)
      const p1 = new oc.gp_Pnt_3(x, y, 0);
      const p2 = new oc.gp_Pnt_3(x + 100, y + 100, 100);
      
      const box = new oc.BRepPrimAPI_MakeBox_3(p1, p2);
      const shape = box.Shape();

      // Return a special result that the App will handle
      return { 
        action: "create3d", 
        entity: { id: "BOX_" + Date.now(), shape } as unknown 
      };
    } catch (err) {
      console.error(err);
      return "Failed to create 3D box.";
    }
  }

  onInput() {
    return "Click to place a 100x100x100 3D box.";
  }
}
