import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BoxCommand } from '../../src/core/commands/BoxCommand';
import { CylinderCommand } from '../../src/core/commands/CylinderCommand';
import { SphereCommand } from '../../src/core/commands/SphereCommand';
import { ConeCommand } from '../../src/core/commands/ConeCommand';
import { TorusCommand } from '../../src/core/commands/TorusCommand';
import { WedgeCommand } from '../../src/core/commands/WedgeCommand';
import { PyramidCommand } from '../../src/core/commands/PyramidCommand';
import { BooleanCommand } from '../../src/core/commands/BooleanCommand';
import { UnitsConfig } from '../../src/core/model/Document';
import { Solid3D } from '../../src/core/model/Solid3D';
import { OpenCascadeService } from '../../src/core/io/OpenCascadeService';
import * as THREE from 'three';

// Mock OpenCascadeService
vi.mock('../../src/core/io/OpenCascadeService', () => {
  return {
    OpenCascadeService: {
      getInstance: vi.fn().mockReturnValue({
        createBox: vi.fn(),
        createCylinder: vi.fn(),
        createSphere: vi.fn(),
        createFrustum: vi.fn(),
        createTorus: vi.fn(),
        createBoolean: vi.fn(),
        importBRep: vi.fn().mockResolvedValue({}),
        checkValidity: vi.fn().mockResolvedValue({ isValid: true, faceCount: 1 })
      })
    }
  };
});

// Mock GeneratorProgressModal
vi.mock('../../src/ui/GeneratorProgressModal', () => {
  return {
    GeneratorProgressModal: class {
      show = vi.fn();
      update = vi.fn();
      close = vi.fn();
    }
  };
});

describe('3D Primitives Commands', () => {
  const units: UnitsConfig = { type: 'decimal', precision: 2, scale: 1.0 };

  describe('BoxCommand', () => {
    let cmd: BoxCommand;
    let mockOcc: any;

    beforeEach(() => {
      cmd = new BoxCommand();
      mockOcc = OpenCascadeService.getInstance();
      vi.clearAllMocks();
    });

    it('should handle interaction steps correctly', async () => {
      // Step 0: Corner 1
      let res = cmd.onPoint(0, 0, 'box1', units);
      expect(cmd.step).toBe(1);
      expect(res).toContain('Corner 1');

      // Step 1: Corner 2
      res = cmd.onPoint(10, 10, 'box1', units);
      expect(cmd.step).toBe(2);
      expect(res).toContain('Base defined');

      // Step 2: Height (onPoint)
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,1,1], 3));
      mockOcc.createBox.mockResolvedValue(mockGeom);

      const promise = cmd.onPoint(10, 20, 'box1', units); // Height is 20 - 0 = 20
      expect(promise).toBeInstanceOf(Promise);
      const solid = await promise;
      expect(mockOcc.createBox).toHaveBeenCalledWith(0, 0, 0, 10, 10, 20, expect.any(Number), 'box1');
      expect(solid).toBeInstanceOf(Object);
    });

    it('should finish with input height', async () => {
      cmd.onPoint(0, 0, 'box1', units);
      cmd.onPoint(10, 10, 'box1', units);
      
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,1,1], 3));
      mockOcc.createBox.mockResolvedValue(mockGeom);

      const res = await cmd.onInput('15', 'box1', units);
      expect(mockOcc.createBox).toHaveBeenCalledWith(0, 0, 0, 10, 10, 15, expect.any(Number), 'box1');
      expect(res).toBeInstanceOf(Object);
    });
  });

  describe('CylinderCommand', () => {
    let cmd: CylinderCommand;
    let mockOcc: any;

    beforeEach(() => {
      cmd = new CylinderCommand();
      mockOcc = OpenCascadeService.getInstance();
      vi.clearAllMocks();
    });

    it('should handle interaction steps correctly', async () => {
      // Step 0: Center
      let res = cmd.onPoint(0, 0, 'cyl1', units);
      expect(cmd.step).toBe(1);
      expect(res).toContain('Center point');

      // Step 1: Radius
      res = cmd.onPoint(10, 0, 'cyl1', units); // Radius = 10
      expect(cmd.step).toBe(2);
      expect(res).toContain('10.00');

      // Step 2: Height
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,1,1], 3));
      mockOcc.createCylinder.mockResolvedValue(mockGeom);

      const solid = await cmd.onPoint(0, 15, 'cyl1', units); // Height = 15 - 0 = 15
      expect(mockOcc.createCylinder).toHaveBeenCalledWith(0, 0, 0, 10, 15, expect.any(Number), 'cyl1');
      expect(solid).toBeInstanceOf(Object);
    });
  });

  describe('SphereCommand', () => {
    let cmd: SphereCommand;
    let mockOcc: any;

    beforeEach(() => {
      cmd = new SphereCommand();
      mockOcc = OpenCascadeService.getInstance();
      vi.clearAllMocks();
    });

    it('should handle interaction steps correctly', async () => {
      // Step 0: Center
      const res = cmd.onPoint(0, 0, 'sph1', units);
      expect(cmd.step).toBe(1);
      expect(res).toContain('Center point');

      // Step 1: Radius
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,1,1], 3));
      mockOcc.createSphere.mockResolvedValue(mockGeom);

      const solid = await cmd.onPoint(10, 0, 'sph1', units); // Radius = 10
      expect(mockOcc.createSphere).toHaveBeenCalledWith(0, 0, 0, 10, expect.any(Number), 'sph1');
      expect(solid).toBeInstanceOf(Object);
    });
  });

  describe('ConeCommand', () => {
    let cmd: ConeCommand;
    let mockOcc: any;

    beforeEach(() => {
      cmd = new ConeCommand();
      mockOcc = OpenCascadeService.getInstance();
      vi.clearAllMocks();
    });

    it('should handle interaction steps correctly', async () => {
      // Step 0: Center
      cmd.onPoint(0, 0, 'cone1', units);
      // Step 1: Base Radius
      cmd.onPoint(10, 0, 'cone1', units); // r1 = 10
      // Step 2: Height
      cmd.onPoint(0, 20, 'cone1', units); // h = 20
      
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,1,1], 3));
      mockOcc.createFrustum.mockResolvedValue(mockGeom);

      // Step 3: Top Radius
      const solid = await cmd.onPoint(5, 0, 'cone1', units); // r2 = 5
      expect(mockOcc.createFrustum).toHaveBeenCalledWith(0, 0, 0, 10, 5, 20, expect.any(Number), 'cone1');
      expect(solid).toBeInstanceOf(Object);
    });
  });

  describe('TorusCommand', () => {
    let cmd: TorusCommand;
    let mockOcc: any;

    beforeEach(() => {
      cmd = new TorusCommand();
      mockOcc = OpenCascadeService.getInstance();
      vi.clearAllMocks();
    });

    it('should handle interaction steps correctly', async () => {
      // Step 0: Center
      cmd.onPoint(0, 0, 'tor1', units);
      // Step 1: Major Radius
      cmd.onPoint(10, 0, 'tor1', units); // rMajor = 10
      
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, 1,1,1], 3));
      mockOcc.createTorus.mockResolvedValue(mockGeom);

      // Step 2: Minor Radius (clicked at center+major+1)
      const solid = await cmd.onPoint(11, 0, 'tor1', units); // rMinor = 1
      expect(mockOcc.createTorus).toHaveBeenCalledWith(0, 0, 0, 10, 1, expect.any(Number), 'tor1');
      expect(solid).toBeInstanceOf(Object);
    });
  });

  describe('WedgeCommand', () => {
    let cmd: WedgeCommand;
    let mockOcc: any;

    beforeEach(() => {
      cmd = new WedgeCommand();
      mockOcc = OpenCascadeService.getInstance();
      vi.clearAllMocks();
    });

    it('should handle interaction steps correctly', async () => {
      cmd.onPoint(0, 0, 'wdg1', units); // Corner 1
      cmd.onPoint(10, 10, 'wdg1', units); // Corner 2 -> dx=10, dy=10
      cmd.onPoint(10, 20, 'wdg1', units); // Height -> dz=20
      
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0], 3));
      mockOcc.createWedge = vi.fn().mockResolvedValue(mockGeom);

      const solid = await cmd.onPoint(5, 0, 'wdg1', units); // LTX = |5-0| = 5
      expect(mockOcc.createWedge).toHaveBeenCalledWith(0, 0, 0, 10, 10, 20, 5, expect.any(Number), 'wdg1');
      expect(solid).toBeInstanceOf(Object);
    });
  });

  describe('PyramidCommand', () => {
    let cmd: PyramidCommand;
    let mockOcc: any;

    beforeEach(() => {
      cmd = new PyramidCommand();
      mockOcc = OpenCascadeService.getInstance();
      vi.clearAllMocks();
    });

    it('should handle interaction steps correctly', async () => {
      cmd.onPoint(0, 0, 'pyr1', units); // Center
      cmd.onPoint(10, 0, 'pyr1', units); // Radius = 10
      
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0], 3));
      mockOcc.createPyramid = vi.fn().mockResolvedValue(mockGeom);

      const solid = await cmd.onPoint(0, 15, 'pyr1', units); // Height = 15
      expect(mockOcc.createPyramid).toHaveBeenCalledWith(0, 0, 0, 4, 10, 15, expect.any(Number), 'pyr1');
      expect(solid).toBeInstanceOf(Object);
    });
  });

  describe('BooleanCommand', () => {
    let cmd: BooleanCommand;
    let mockOcc: any;
    let mockDoc: any;

    beforeEach(() => {
      mockOcc = OpenCascadeService.getInstance();
      mockDoc = {
        getEntity: vi.fn((id) => {
          if (id === 's1' || id === 's2') {
            const s = new Solid3D(id, [0,0,0], [0]);
            s.brepSnapshot = new Uint8Array([1,2,3]);
            return s;
          }
          return null;
        }),
        facetres: 5.0
      };
      vi.clearAllMocks();
    });

    it('should handle UNION interaction', async () => {
      cmd = new BooleanCommand('fuse');
      expect(cmd.getPrompt()).toContain('FUSE'); // prompt uses operation.toUpperCase()

      // Select A
      cmd.onInput('s1', 'res1', units, undefined, mockDoc);
      expect(cmd.step).toBe(1);

      // Select B
      const mockGeom = new THREE.BufferGeometry();
      mockGeom.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0], 3));
      mockOcc.createBoolean.mockResolvedValue(mockGeom);

      const res = await cmd.onInput('s2', 'res1', units, undefined, mockDoc) as any;
      expect(mockOcc.createBoolean).toHaveBeenCalledWith('fuse', 's1', 's2', 'res1', expect.any(Number));
      expect(res.action).toBe('boolean_result');
      expect(res.deleteIds).toEqual(['s1', 's2']);
    });
  });
});
