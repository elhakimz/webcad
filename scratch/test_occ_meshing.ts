
import initOpenCascade from "opencascade.js";

async function test() {
    const oc = await initOpenCascade();
    console.log("oc.Message_ProgressRange_1:", !!oc.Message_ProgressRange_1);
    console.log("oc.BRepMesh_IncrementalMesh_2:", !!oc.BRepMesh_IncrementalMesh_2);
    
    // Check if Perform takes arguments
    if (oc.BRepMesh_IncrementalMesh_2) {
        const shape = new oc.TopoDS_Shape();
        const mesh = new oc.BRepMesh_IncrementalMesh_2(shape, 0.1, false, 0.5, false);
        console.log("Perform method exists:", !!mesh.Perform);
        if (mesh.Perform) {
            console.log("Perform signature (if visible):", mesh.Perform.toString());
        }
        mesh.delete();
    }
}
test();
