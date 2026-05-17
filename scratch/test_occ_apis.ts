
import initOpenCascade from "opencascade.js";

async function test() {
    const oc = await initOpenCascade();
    console.log("oc.std:", !!oc.std);
    if (oc.std) {
        console.log("oc.std.stringstream:", !!oc.std.stringstream);
    }
    console.log("oc.BRepTools.Write_3:", typeof oc.BRepTools.Write_3);
    console.log("oc.BRepTools.Write_4:", typeof oc.BRepTools.Write_4);
}
test();
