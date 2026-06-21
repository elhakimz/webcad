import { DatabaseService } from './DatabaseService'
import { ShapeCacheDB } from './ShapeCacheDB'
import { EntitySerializer } from './EntitySerializer'
import { Document } from '../model/Document'
import { Solid3D } from '../model/Solid3D'
import { OpenCascadeService } from '../io/OpenCascadeService'
import { v4 as uuidv4 } from 'uuid'
import { rebuildSweepGeometry } from '../engine/handlers/transform/SweepGeometryUtil'
import { Solid3DReevaluator } from '../engine/Solid3DReevaluator'

export class PersistenceService {
  private static instance: PersistenceService;
  private db: DatabaseService;
  cache: ShapeCacheDB;
  private occ: OpenCascadeService;

  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  private isLoading: boolean = false;
  public activeProjectId: string | null = null;
  public activeProjectName: string = 'Untitled';

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.cache = ShapeCacheDB.getInstance();
    this.occ = OpenCascadeService.getInstance();

    // Wire up error reporting to command line
    if (this.occ && typeof this.occ.onError === 'function') {
      this.occ.onError((msg) => {
        if (this.onErrorMessage) this.onErrorMessage(msg);
      });
    }
  }

  private onErrorMessage: ((msg: string) => void) | null = null;
  public setOnErrorMessage(callback: (msg: string) => void) {
    this.onErrorMessage = callback;
  }

  private reportError(msg: string) {
    console.error(msg);
    if (this.onErrorMessage) this.onErrorMessage(msg);
  }

  static getInstance(): PersistenceService {
    if (!this.instance) this.instance = new PersistenceService();
    return this.instance;
  }

  async init(): Promise<void> {
    await this.db.init() // Removed forceReset: true
    await this.cache.init()
  }

  async saveProject(doc: Document, name: string, thumbnail?: string): Promise<string> {
    if (!this.db.projects) {
      console.warn('[PersistenceService] Database not initialized, skipping save');
      return '';
    }
    const projectId = this.activeProjectId || doc.id || uuidv4()
    this.activeProjectId = projectId
    this.activeProjectName = name
    doc.id = projectId // ensure doc has ID

    // 1. Save project metadata
    await this.db.upsertProject({
      id: projectId,
      name,
      createdAt: (doc as any).createdAt || Date.now(),
      updatedAt: Date.now(),
      settings: {
        units: doc.units,
        facetres: doc.facetres,
        dimtoh: doc.dimtoh,
        dimtad: doc.dimtad,
        currentLayer: doc.layers.getCurrentLayer().name,
        currentElevation: doc.currentElevation,
        currentThickness: doc.currentThickness,
        idCounters: doc.getIdCounters(),
        constraints: doc.constraints
      }
    })

    // 2. Save layers
    const layerRows = doc.layers.listLayers().map(l => ({
      id: `${projectId}::${l.name}`,
      projectId,
      name: l.name,
      color: l.color,
      linetype: l.linetype,
      lineWeight: l.lineWeight,
      isVisible: l.isVisible,
      isFrozen: l.isFrozen,
      isLocked: l.isLocked
    }))
    await this.db.bulkUpsertLayers(layerRows)

    // 3. Save entities
    const entityRows: object[] = []
    const deflection = 0.1 / (doc.facetres ?? 0.5)
    for (const ent of doc.entities.values()) {
      entityRows.push(EntitySerializer.serialize(ent, projectId))

      // If it's a 3D solid without creation params (e.g. boolean result),
      // save its BREP data to the cache DB.
      if (ent instanceof Solid3D && !ent.creationParams) {
        // Bug 3 fix: use the in-memory brepSnapshot on the entity first —
        // avoids a worker round-trip and works even if the shape is not
        // currently registered in the worker (e.g. right after loadProject).
        const existingSnapshot = ent.brepSnapshot;
        if (existingSnapshot && existingSnapshot.length > 0) {
          if (this.cache.isInMemory()) {
            await this.db.saveBRep(ent.id, projectId, existingSnapshot);
          } else {
            this.cache.saveBRep(ent.id, projectId, existingSnapshot);
          }
        } else {
          // Check if already in cache DB (persisted by persistBRepNow earlier)
          let cachedBRep: Uint8Array | null = null;
          if (this.cache.isInMemory()) {
            cachedBRep = await this.db.loadBRep(ent.id, projectId);
          } else {
            cachedBRep = this.cache.loadBRep(ent.id, projectId);
          }

          if (cachedBRep && cachedBRep.length > 0) {
            console.log(`[Persistence] Using cached BREP for ${ent.id} (size: ${cachedBRep.length} bytes)`);
          } else {
            console.log(`[Persistence] BREP not in cache for ${ent.id}, exporting from worker...`);
            try {
              const brepBytes = await this.occ.exportBRep(ent.id);
              if (brepBytes && brepBytes.length > 50) { // Valid STEP is >100 bytes
                console.log(`[Persistence] Successfully exported BREP for ${ent.id} (${brepBytes.length} bytes)`);
                if (this.cache.isInMemory()) {
                  await this.db.saveBRep(ent.id, projectId, brepBytes);
                } else {
                  this.cache.saveBRep(ent.id, projectId, brepBytes);
                }
              } else {
                console.warn(`[Persistence] Skipping save for ${ent.id} — export returned empty/invalid bytes (${brepBytes?.length ?? 0} bytes)`);
              }
            } catch (e) {
              const errorMsg = e instanceof Error ? e.message : String(e);
              // Bug 1 fix: worker throws "No valid cached shape …" — the old check
              // for "No cached shape" never matched that string (the word "valid"
              // breaks the substring), so every unregistered entity was incorrectly
              // reported as an error instead of being silently skipped.
              const isNotInWorker = errorMsg.toLowerCase().includes('cached shape');
              if (!isNotInWorker) {
                this.reportError(`[Persistence] Failed to export BREP for ${ent.id}: ${errorMsg}`);
              } else {
                console.log(`[Persistence] Skipping BREP export for ${ent.id} (not in worker cache — likely imported raw mesh).`);
              }
            }
          }
        }
      }

      // Always save tessellation cache for fast loading
      if (ent instanceof Solid3D && ent.positions.length > 0) {
        this.cache.saveTessellation(ent.id, projectId, ent.positions, ent.indices, deflection)
      }
    }
    await this.db.bulkUpsertEntities(entityRows)

    // 4. Update file history
    this.cache.upsertHistory(projectId, name, thumbnail)

    return projectId
  }

  async loadProject(projectId: string, doc: Document, app: any, onProgress?: (percent: number, status: string) => void): Promise<void> {
    // Bug 2 fix: suppress auto-save while loading so that syncFromDocument()
    // at the end of this method does not trigger a premature save before all
    // shapes are registered in the OCC worker.
    this.isLoading = true;
    if (onProgress) {
      onProgress(10, "Fetching project metadata...");
    }
    const proj = await this.db.getProject(projectId)
    if (!proj) throw new Error(`Project ${projectId} not found`)

    this.activeProjectId = projectId
    this.activeProjectName = proj.name
    doc.id = projectId
    doc.clear() // clear existing before loading
    
    if (onProgress) {
      onProgress(20, "Rehydrating document settings...");
    }
    doc.units = proj.settings.units
    doc.facetres = proj.settings.facetres
    doc.dimtoh = proj.settings.dimtoh
    doc.dimtad = proj.settings.dimtad
    doc.currentElevation = proj.settings.currentElevation
    doc.currentThickness = proj.settings.currentThickness
    if (proj.settings.idCounters) {
      doc.restoreIdCounters(proj.settings.idCounters) // Bug 4 fix
    }
    doc.constraints = proj.settings.constraints ? JSON.parse(JSON.stringify(proj.settings.constraints)) : []

    // Load layers
    if (onProgress) {
      onProgress(30, "Rehydrating drawing layers...");
    }
    const layers = await this.db.getLayersForProject(projectId)
    for (const l of layers) {
      if (l.name !== "0") {
        doc.layers.createLayer(l.name, l.color, l.linetype, l.lineWeight);
      }
      const added = doc.layers.getLayer(l.name);
      if (added) {
        added.isVisible = l.isVisible;
        added.isFrozen = l.isFrozen;
        added.isLocked = l.isLocked;
      }
    }
    if (proj.settings.currentLayer) {
      doc.layers.setCurrentLayer(proj.settings.currentLayer);
    }

    // Load entities
    if (onProgress) {
      onProgress(40, "Fetching entities from database...");
    }
    const entRows = await this.db.getEntitiesForProject(projectId)
    const total = entRows.length;

    for (let i = 0; i < total; i++) {
      const row = entRows[i];
      const ent = EntitySerializer.deserialize(row)
      
      const percent = 40 + Math.round((i / total) * 55); // 40% to 95%
      let entityDesc = `${row.type || 'entity'} (${row.id})`;
      if (ent instanceof Solid3D) {
        const cp = ent.creationParams;
        entityDesc = cp ? `solid ${cp.type} (${ent.id})` : `CSG shape (${ent.id})`;
      }
      if (onProgress) {
        onProgress(percent, `Rehydrating entity ${i + 1}/${total}: ${entityDesc}...`);
      }

      if (ent instanceof Solid3D) {
        // Try to load tessellation first for instant display
        const tess = this.cache.loadTessellation(ent.id, projectId)
        if (tess) {
          ent.positions = tess.positions
          ent.indices = tess.indices
        }

        // Rebuild geometry in worker if it's a primitive or from BREP
        if (ent.creationParams) {
          await this.rebuildFromCreationParams(ent, doc.facetres || 5.0, doc)
        } else {
          // It's a boolean or complex shape — load BREP
          let brep;
          if (this.cache.isInMemory()) {
            brep = await this.db.loadBRep(ent.id, projectId)
          } else {
            brep = this.cache.loadBRep(ent.id, projectId)
          }
          if (brep) {
            console.log(`[Persistence] Loading BREP for ${ent.id} (${brep.length} bytes)`);
            try {
              const deflection = 0.1 / (doc.facetres || 5.0);
              const geometryData = await this.occ.importBRep(ent.id, brep, deflection);
              ent.positions = geometryData.positions;
              ent.indices = geometryData.indices;
              ent.faceMapping = geometryData.faceMapping;
              ent.edgeLines = geometryData.edgeLines;
              ent.brepSnapshot = brep; // Keep the snapshot in memory for fast saves
              console.log(`[Persistence] Re-hydrated solid ${ent.id} from BREP`);
            } catch (e) {
              this.reportError(`[Persistence] Failed to export BREP for ${ent.id}: ${e instanceof Error ? e.message : String(e)}`);
            }
          }
        }
        ent.updateAbsolutePosition()
      }

      doc.addEntity(ent)
    }

    // Single re-render
    // Bug 2 fix: clear isLoading BEFORE syncFromDocument so any
    // scheduleAutoSave triggered by syncFromDocument is suppressed during load.
    this.isLoading = false;
    if (onProgress) {
      onProgress(97, "Updating spatial indexing...");
    }
    doc.updateSpatialIndex()
    if (onProgress) {
      onProgress(99, "Synchronizing viewport view...");
    }
    app.syncFromDocument()
    if (onProgress) {
      onProgress(100, "Successfully loaded!");
    }
  }

  private async rebuildFromCreationParams(entity: Solid3D, facetres: number, doc: Document): Promise<void> {
    const cp = entity.creationParams!
    const deflection = 0.1 / (facetres ?? 5.0)
    try {
      if (entity.brepSnapshot) {
        try {
          const geoData = await this.occ.importBRep(entity.id, entity.brepSnapshot, deflection);
          if (geoData && geoData.positions) {
            entity.positions = geoData.positions;
            entity.indices = geoData.indices;
            entity.faceMapping = geoData.faceMapping;
            entity.edgeLines = geoData.edgeLines;
            console.log(`[PersistenceService] Rehydrated and re-tessellated from B-Rep snapshot for ${entity.id}`);
          }
          return;
        } catch (err) {
          console.error(`[PersistenceService] Failed to import B-Rep snapshot for ${entity.id}:`, err);
        }
      }

      let geoData;
      switch (cp.type) {
        case 'box': geoData = await this.occ.createBox(cp.params.x, cp.params.y, cp.params.z, cp.params.dx, cp.params.dy, cp.params.dz, deflection, entity.id); break
        case 'cylinder': geoData = await this.occ.createCylinder(cp.params.x, cp.params.y, cp.params.z, cp.params.radius, cp.params.height, deflection, entity.id); break
        case 'sphere': geoData = await this.occ.createSphere(cp.params.x, cp.params.y, cp.params.z, cp.params.r, deflection, entity.id); break
        case 'cone': geoData = await this.occ.createCone(cp.params.x, cp.params.y, cp.params.z, cp.params.r1, cp.params.h, deflection, entity.id); break
        case 'polyhedron': geoData = await this.occ.createPolyhedron(cp.params.points, cp.params.faces, deflection, entity.id); break
        case 'hull': geoData = await this.occ.createConvexHull(cp.params.points, cp.params.shapeIds, deflection, entity.id); break
        case 'torus': geoData = await this.occ.createTorus(cp.params.x, cp.params.y, cp.params.z, cp.params.r1, cp.params.r2, deflection, entity.id); break
        case 'extrude': geoData = await this.occ.createExtrude(cp.params.points, cp.params.height, cp.params.thickness, deflection, cp.params.isClosed, entity.id); break
        case 'revolve': geoData = await this.occ.createRevolve(cp.params.points, cp.params.axisPoint, cp.params.axisDir, cp.params.angle, cp.params.thickness, deflection, cp.params.isClosed, entity.id); break
        case 'sweep': {
          const profileEntity = doc.getEntity(cp.params.profileId);
          const spineEntity = doc.getEntity(cp.params.spineId);
          if (profileEntity && spineEntity) {
            const geomData = await rebuildSweepGeometry(
              profileEntity,
              spineEntity,
              cp.params.isSolid,
              facetres,
              deflection,
              entity.id,
              cp.params.cornerMode
            );
            entity.positions = geomData.positions;
            entity.indices = geomData.indices;
            entity.faceMapping = geomData.faceMapping;
            entity.edgeLines = geomData.edgeLines;
            if (geomData.brepSnapshot) {
              entity.brepSnapshot = geomData.brepSnapshot;
            }
          } else {
            console.warn(`[PersistenceService] Sweep profile/spine entities not found in document: profileId=${cp.params.profileId}, spineId=${cp.params.spineId}`);
          }
          return;
        }
        default: console.warn(`[PersistenceService] Unknown creationParams type: ${(cp as any).type}`)
      }
      if (geoData) {
        const attr = geoData.getAttribute('position') as any;
        entity.positions = Array.from(attr.array);
        entity.indices = Array.from(geoData.getIndex()!.array);
        entity.faceMapping = geoData.userData?.faceMapping;
        entity.edgeLines = geoData.userData?.edgeLines;
        if (geoData.userData?.brepSnapshot) {
          entity.brepSnapshot = geoData.userData.brepSnapshot;
        }
      }
    } catch (err) {
      this.reportError(`[PersistenceService] Failed to rebuild cache for ${entity.id}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Immediately persists BREP bytes and entity metadata to the database.
   * Call this right after a complex operation (Boolean, Fillet, etc.)
   * to avoid loss during page refreshes before auto-save fires.
   */
  async persistBRepNow(entity: Solid3D, doc: Document): Promise<void> {
    if (!this.activeProjectId) return;
    if (!this.db.entities || !this.db.projects) return;
    console.log("[PersistenceService] [persistBRepNow] BREP SNAPSHOT EXISTS? ", entity.brepSnapshot)
    const brepBytes = entity.brepSnapshot;
    if (!brepBytes || brepBytes.length < 50) {
      console.warn(`[Persistence] persistBRepNow: skipping ${entity.id} — snapshot is empty or too small (${brepBytes?.length ?? 0} bytes)`);
      return;
    }
    console.log("[PersistenceService] persistBRepNow", entity.id, brepBytes.length);
    try {
      // 1. Save BREP data to the cache DB
      if (this.cache.isInMemory()) {
        await this.db.saveBRep(entity.id, this.activeProjectId, brepBytes);
      } else {
        this.cache.saveBRep(entity.id, this.activeProjectId, brepBytes);
      }

      // 2. Save Entity metadata immediately so it appears on reload
      const row = EntitySerializer.serialize(entity, this.activeProjectId);
      await this.db.bulkUpsertEntities([row]);

      // 3. Save Project settings to keep ID counters and other states in sync
      await this.db.upsertProject({
        id: this.activeProjectId,
        name: this.activeProjectName,
        createdAt: Date.now(), // Fallback, though typically already exists
        updatedAt: Date.now(),
        settings: {
          units: doc.units,
          facetres: doc.facetres,
          dimtoh: doc.dimtoh,
          dimtad: doc.dimtad,
          currentLayer: doc.layers.getCurrentLayer().name,
          currentElevation: doc.currentElevation,
          currentThickness: doc.currentThickness,
          idCounters: doc.getIdCounters(),
          constraints: doc.constraints
        }
      });

      console.log(`[PersistenceService] Immediately persisted ${entity.id} and updated project metadata.`);
    } catch (err) {
      console.error(`[PersistenceService] Failed immediate persistence for ${entity.id}:`, err);
    }
  }

  async newProject(doc: Document): Promise<string> {
    const pid = uuidv4()
    this.activeProjectId = pid
    this.activeProjectName = 'Untitled'
    try {
      if (this.db && typeof this.db.upsertProject === 'function') {
        await this.db.upsertProject({
          id: pid, name: 'Untitled',
          createdAt: Date.now(), updatedAt: Date.now(),
          settings: {
            units: doc.units,
            facetres: doc.facetres,
            dimtoh: doc.dimtoh,
            dimtad: doc.dimtad,
            currentLayer: doc.layers.getCurrentLayer().name,
            currentElevation: doc.currentElevation,
            currentThickness: doc.currentThickness,
            idCounters: doc.getIdCounters(),
            constraints: []
          }
        })
      }
    } catch (err) {
      console.warn('[PersistenceService] Database not initialized or available during newProject. Skipping db save.')
    }
    return pid
  }

  async onEntityErased(entityId: string, entity: any): Promise<void> {
    if (!this.activeProjectId) return
    if (!this.db.entities) return;
    await this.db.deleteEntity(entityId)
    if (entity instanceof Solid3D) {
      this.cache.deleteTessellation(entityId, this.activeProjectId)
      this.cache.deleteBRep(entityId, this.activeProjectId)
      await this.occ.releaseShapes([entityId])
    }
  }

  async deleteProject(projectId: string): Promise<void> {
    const rows = await this.db.getEntitiesForProject(projectId);
    const s3dIds = rows.filter((r: any) => r.type === 'Solid3D').map((r: any) => r.id);
    if (s3dIds.length) await this.occ.releaseShapes(s3dIds);

    await this.db.deleteProject(projectId);
    this.cache.clearProject(projectId);
    this.cache.deleteHistory(projectId);

    if (this.activeProjectId === projectId) {
      this.activeProjectId = null;
      this.activeProjectName = 'Untitled';
    }
  }

  scheduleAutoSave(doc: Document, getThumbnail?: () => string): void {
    // Bug 2 fix: do not schedule auto-save while a project is being loaded.
    // loadProject → syncFromDocument → scheduleAutoSave would otherwise fire
    // 2 s later when shapes may not yet be registered in the OCC worker.
    if (this.isLoading) return;
    if (this.autoSaveTimer) clearTimeout(this.autoSaveTimer)
    this.autoSaveTimer = setTimeout(async () => {
      await this.saveProject(doc, this.activeProjectName, getThumbnail?.())
      console.log(`[PersistenceService] Auto-saved "${this.activeProjectName}"`)
    }, 2000)
  }

  cancelAutoSave(): void {
    if (this.autoSaveTimer) { clearTimeout(this.autoSaveTimer); this.autoSaveTimer = null }
  }

  async getHistory(): Promise<any[]> {
    const projects = await this.db.listProjects();
    // Deep clone everything from the DB to avoid frozen/proxy issues in the UI
    return JSON.parse(JSON.stringify(projects));
  }
}
