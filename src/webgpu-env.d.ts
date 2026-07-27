// The real WebGPU type definitions (WEBCAD-165).
//
// This replaces src/types/three-webgpu.d.ts, which declared `navigator.gpu` as `any`
// alongside two `declare module` stubs for three.js paths that no longer exist. Those
// stubs made the WebGPU code compile by making it untyped — a shim that silences the
// compiler rather than satisfying it.
/// <reference types="@webgpu/types" />
