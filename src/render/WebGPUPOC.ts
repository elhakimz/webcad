import * as THREE from 'three';
import WebGPURenderer from 'three/examples/jsm/renderers/webgpu/WebGPURenderer.js';
import { createZebraTSLMaterial } from './ZebraTSL';

export class WebGPUPOC {
  static async run(originalCanvas: HTMLCanvasElement) {
    console.log("[WebGPU POC] Starting sequence...");

    if (!navigator.gpu) {
      const msg = "WebGPU is not supported by your browser or hardware. Please check edge://flags and enable WebGPU.";
      console.error("[WebGPU POC] " + msg);
      alert(msg);
      return;
    }

    // Create a temporary overlay canvas
    const canvas = document.createElement('canvas');
    canvas.id = 'webgpu-poc-canvas';
    canvas.style.position = 'fixed';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.width = '100vw';
    canvas.style.height = '100vh';
    canvas.style.zIndex = '9999';
    canvas.style.backgroundColor = '#111'; // Solid background to confirm it exists
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    
    console.log("[WebGPU POC] Overlay canvas created:", canvas.width, "x", canvas.height);

    const renderer = new WebGPURenderer({ canvas, antialias: true });
    try {
      console.log("[WebGPU POC] Initializing renderer...");
      await renderer.init();
      console.log("[WebGPU POC] WebGPU Renderer Initialized!");
    } catch (err) {
      console.error("[WebGPU POC] Renderer init failed:", err);
      alert("WebGPU Initialization Error: " + (err instanceof Error ? err.message : String(err)));
      document.body.removeChild(canvas);
      return;
    }

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x222222);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 4;

    console.log("[WebGPU POC] Creating Zebra TSL material...");
    const { material } = createZebraTSLMaterial(40.0);
    
    const geometry = new THREE.TorusKnotGeometry(1, 0.35, 200, 40);
    const mesh = new THREE.Mesh(geometry, material);
    scene.add(mesh);

    const light = new THREE.DirectionalLight(0xffffff, 1.5);
    light.position.set(5, 5, 5);
    scene.add(light);
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));

    console.log("[WebGPU POC] Starting animation loop...");
    
    renderer.setAnimationLoop(async () => {
      mesh.rotation.x += 0.005;
      mesh.rotation.y += 0.01;
      await renderer.render(scene, camera);
    });
    
    // UI Overlay
    const ui = document.createElement('div');
    ui.style.position = 'fixed';
    ui.style.bottom = '20px';
    ui.style.left = '50%';
    ui.style.transform = 'translateX(-50%)';
    ui.style.background = 'rgba(0,0,0,0.85)';
    ui.style.color = 'white';
    ui.style.padding = '15px 25px';
    ui.style.borderRadius = '8px';
    ui.style.zIndex = '10000';
    ui.style.fontFamily = 'sans-serif';
    ui.style.textAlign = 'center';
    ui.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
    ui.innerHTML = `
        <div style="font-size: 18px; font-weight: bold; margin-bottom: 5px;">WebGPU + TSL Native Shading</div>
        <div style="font-size: 14px; color: #aaa; margin-bottom: 15px;">Proof of Concept - Zebra Continuity Map</div>
        <button id="close-webgpu" style="background: #3b82f6; color: white; border: none; padding: 8px 20px; border-radius: 4px; cursor: pointer; font-weight: 600;">Back to WebGL Stable</button>
    `;
    document.body.appendChild(ui);

    document.getElementById('close-webgpu')?.addEventListener('click', () => {
        console.log("[WebGPU POC] Closing...");
        
        // Stop animation loop
        renderer.setAnimationLoop(null);
        
        // Attempt clean disposal, but catch experimental backend crashes
        try {
            renderer.dispose();
        } catch (e) {
            console.warn("[WebGPU POC] Renderer dispose warning:", e);
        }

        // DOM Cleanup with safety checks
        if (canvas && canvas.parentNode === document.body) {
            document.body.removeChild(canvas);
        }
        if (ui && ui.parentNode === document.body) {
            document.body.removeChild(ui);
        }
    });
  }
}
