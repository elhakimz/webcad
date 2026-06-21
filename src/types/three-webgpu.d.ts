// Ambient declarations for three.js submodules that ship without type definitions
// in the installed version, plus the experimental WebGPU navigator API.

declare module "three/examples/jsm/renderers/webgpu/WebGPURenderer.js";
declare module "three/examples/jsm/nodes/Nodes.js";

interface Navigator {
  gpu?: any;
}
