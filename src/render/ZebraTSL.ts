import * as THREE from 'three';
import { 
  uniform, 
  normalView, 
  positionView, 
  reflect, 
  normalize, 
  negate, 
  sin, 
  mul, 
  add, 
  smoothstep, 
  vec4, 
  vec3,
  MeshBasicNodeMaterial 
} from 'three/examples/jsm/nodes/Nodes.js';

export function createZebraTSLMaterial(frequencyVal: number = 30.0) {
  // 1. Define the Frequency Uniform
  const frequency = uniform(frequencyVal);

  // 2. Logic Flow (Node Composition)
  const viewDir = normalize(negate(positionView)); 
  const reflectDir = reflect(negate(viewDir), normalView); // Reflection vector in view space

  // 3. Compute Pattern
  const stripeLogic = sin(
    mul(
      add(reflectDir.y, mul(reflectDir.x, 0.3)), 
      frequency
    )
  );

  // smoothstep for high-quality antialiasing
  const stripe = smoothstep(-0.05, 0.05, stripeLogic);

  // 4. Create Material
  const material = new MeshBasicNodeMaterial();
  material.colorNode = vec4(vec3(stripe), 1.0);
  material.side = THREE.DoubleSide;
  
  return { material, frequency };
}
