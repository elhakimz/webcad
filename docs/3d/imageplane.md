imageplane

To display an image (PNG or rasterized SVG) on a 2D plane in Three.js and control how it maps—similar to CSS `object-fit`—you have to manipulate either the **Geometry** or the **Texture UVs**.

By default, Three.js stretches any texture to perfectly fit the boundaries of the `PlaneGeometry` (UV coordinates from 0.0 to 1.0).

Here is the architectural breakdown of how to handle your three specific modes:

1. **Scaled (Fill / Stretch):** The default state. The texture UVs map perfectly to the plane boundaries. Aspect ratio is ignored.
2. **Fit to Rectangle (Contain):** The target rectangle remains fixed in size. You calculate the aspect ratio of the image versus the plane, and adjust the texture's `repeat` and `offset` properties to "zoom out" the UVs, ensuring the image fits inside without distortion.
3. **100% (Original Size):** The texture mapping remains 1:1, but you dynamically scale the `PlaneGeometry` itself to match the exact pixel dimensions of the loaded image (usually mapped 1 pixel = 1 Three.js world unit).

Before looking at the implementation, use this simulator to visualize how manipulating the target plane dimensions interacts with these three mathematical mapping modes.

### The TypeScript Implementation

Here is a robust utility class designed for your architecture. It takes a URL, the target plane dimensions, and a mapping mode, and handles the UV mathematics automatically.

*Note regarding SVGs:* When you pass an SVG URL to the `THREE.TextureLoader`, the browser natively rasterizes it onto a hidden canvas before passing it to the WebGL GPU. It will be treated as an image, not as infinite-resolution vectors.

```typescript
import * as THREE from 'three';

export enum ImageDisplayMode {
    STRETCH = 'STRETCH',
    FIT = 'FIT',
    ORIGINAL_SIZE = 'ORIGINAL_SIZE'
}

export class ImagePlane {
    public mesh: THREE.Mesh;
    private material: THREE.MeshBasicMaterial;
    private geometry: THREE.PlaneGeometry;
    private texture: THREE.Texture | null = null;

    constructor(
        private width: number,
        private height: number,
        private mode: ImageDisplayMode = ImageDisplayMode.FIT
    ) {
        // Initialize with target dimensions
        this.geometry = new THREE.PlaneGeometry(this.width, this.height);
        this.material = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            side: THREE.DoubleSide,
            transparent: true // Crucial for PNGs/SVGs with alpha channels
        });
        
        this.mesh = new THREE.Mesh(this.geometry, this.material);
    }

    /**
     * Loads the image and applies the selected mapping mode.
     */
    public async loadImage(url: string): Promise<void> {
        const loader = new THREE.TextureLoader();

        return new Promise((resolve, reject) => {
            loader.load(
                url,
                (texture) => {
                    this.texture = texture;
                    // Ensure texture coordinates center properly for SVG/PNGs
                    this.texture.matrixAutoUpdate = false; 
                    
                    this.material.map = this.texture;
                    this.material.needsUpdate = true;
                    
                    this.applyMode();
                    resolve();
                },
                undefined,
                (error) => {
                    console.error("Error loading image texture:", error);
                    reject(error);
                }
            );
        });
    }

    /**
     * Updates the target boundaries and recalculates the mapping.
     */
    public resizeTarget(newWidth: number, newHeight: number): void {
        this.width = newWidth;
        this.height = newHeight;
        this.applyMode();
    }

    /**
     * Changes the display mode and recalculates mapping.
     */
    public setMode(newMode: ImageDisplayMode): void {
        this.mode = newMode;
        this.applyMode();
    }

    private applyMode(): void {
        if (!this.texture || !this.texture.image) return;

        const imgWidth = this.texture.image.width;
        const imgHeight = this.texture.image.height;

        // Reset geometry to target boundaries
        this.mesh.scale.set(1, 1, 1);
        this.mesh.geometry.dispose();
        this.mesh.geometry = new THREE.PlaneGeometry(this.width, this.height);

        // Reset UV matrix
        this.texture.matrix.identity();

        if (this.mode === ImageDisplayMode.STRETCH) {
            // Do nothing. Default behavior stretches UVs 0-1 across the geometry.
        } 
        else if (this.mode === ImageDisplayMode.ORIGINAL_SIZE) {
            // Rebuild geometry to match exact image pixels. 
            // 1 pixel = 1 unit in Three.js world space.
            this.mesh.geometry.dispose();
            this.mesh.geometry = new THREE.PlaneGeometry(imgWidth, imgHeight);
        } 
        else if (this.mode === ImageDisplayMode.FIT) {
            // Calculate Aspect Ratios
            const planeAspect = this.width / this.height;
            const imgAspect = imgWidth / imgHeight;

            let scaleX = 1;
            let scaleY = 1;

            if (planeAspect > imgAspect) {
                // Plane is wider than image. Image must map to plane height, leaving empty space on X.
                // We scale up the U coordinates so the texture appears smaller horizontally.
                scaleX = planeAspect / imgAspect;
            } else {
                // Plane is taller than image. Image must map to plane width, leaving empty space on Y.
                // We scale up the V coordinates.
                scaleY = imgAspect / planeAspect;
            }

            // Apply scaling and offset to keep the image centered
            this.texture.matrix.scale(scaleX, scaleY);
            
            // To center it, offset is (1 - scale) / 2
            const offsetX = (1 - scaleX) / 2;
            const offsetY = (1 - scaleY) / 2;
            this.texture.matrix.setPosition(offsetX, offsetY);
        }
    }
}

```

### Usage Example for your Engine

```typescript
// Assuming you have a basic Three.js scene setup
const scene = new THREE.Scene();

// 1. Create the plane target (e.g., a 500x300 bounding box)
const blueprintPlane = new ImagePlane(500, 300, ImageDisplayMode.FIT);

// 2. Add it to the scene immediately
scene.add(blueprintPlane.mesh);

// 3. Load the SVG or PNG
// The plane will appear white until loaded, then snap to the correct constraints.
blueprintPlane.loadImage('path/to/your/blueprint.svg').then(() => {
    console.log("Image loaded and constrained successfully.");
    
    // If you need to switch modes dynamically later:
    // blueprintPlane.setMode(ImageDisplayMode.ORIGINAL_SIZE);
});

```