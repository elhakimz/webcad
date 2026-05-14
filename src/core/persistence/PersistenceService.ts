import { DatabaseService } from './DatabaseService'
import { ShapeCacheDB } from './ShapeCacheDB'
import { EntitySerializer } from './EntitySerializer'
import { Document } from '../model/Document'
import { Solid3D } from '../model/Solid3D'
import { OpenCascadeService } from '../io/OpenCascadeService'
import { v4 as uuidv4 } from 'uuid'

export class PersistenceService {
  private static instance: PersistenceService;
  private db: DatabaseService;
  private cache: ShapeCacheDB;
  private occ: OpenCascadeService;

  private autoSaveTimer: ReturnType<typeof setTimeout> | null = null;
  public activeProjectId: string | null = null;
  public activeProjectName: string = 'Untitled';

  private constructor() {
    this.db = DatabaseService.getInstance();
    this.cache = ShapeCacheDB.getInstance();
    this.occ = OpenCascadeService.getInstance();
  }

  static getInstance(): PersistenceService {
    if (!this.instance) this.instance = new PersistenceService();
    return this.instance;
  }

  async init(): Promise<void> {
    await this.db.init()
    await this.cache.init()
  }

  async saveProject(doc: Document, name: string, thumbnail?: string): Promise<string> {
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
        idCounters: doc.getIdCounters() // Bug 4 fix
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
      // we must save its BREP data to the cache DB.
      if (ent instanceof Solid3D && !(ent as any).creationParams) {
        try {
          const brepBytes = await this.occ.exportBRep(ent.id)
          if (this.cache.isInMemory()) {
            await this.db.saveBRep(ent.id, projectId, brepBytes)
          } else {
            this.cache.saveBRep(ent.id, projectId, brepBytes)
          }
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          if (!errorMsg.includes("No cached shape")) {
            console.error(`[Persistence] Failed to export BREP for ${ent.id}:`, e);
          } else {
            console.log(`[Persistence] Skipping BREP export for ${ent.id} (not in worker cache - likely imported raw mesh).`);
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

  async loadProject(projectId: string, doc: Document, app: any): Promise<void> {
    const proj = await this.db.getProject(projectId)
    if (!proj) throw new Error(`Project ${projectId} not found`)

    this.activeProjectId = projectId
    this.activeProjectName = proj.name
    doc.id = projectId
    doc.clear() // clear existing before loading
    doc.units = proj.settings.units
    doc.facetres = proj.settings.facetres
    doc.dimtoh = proj.settings.dimtoh
    doc.dimtad = proj.settings.dimtad
    doc.currentElevation = proj.settings.currentElevation
    doc.currentThickness = proj.settings.currentThickness
    if (proj.settings.idCounters) {
      doc.restoreIdCounters(proj.settings.idCounters) // Bug 4 fix
    }

    // Load layers
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
    const entRows = await this.db.getEntitiesForProject(projectId)

    for (const row of entRows) {
      const ent = EntitySerializer.deserialize(row)

      if (ent instanceof Solid3D) {
        // Try to load tessellation first for instant display
        const tess = this.cache.loadTessellation(ent.id, projectId)
        if (tess) {
          ent.positions = tess.positions
          ent.indices = tess.indices
        }

        // Rebuild geometry in worker if it's a primitive or from BREP
        if (ent.creationParams) {
          await this.rebuildFromCreationParams(ent, doc.facetres || 5.0)
        } else {
          // It's a boolean or complex shape — load BREP
          let brep;
          if (this.cache.isInMemory()) {
            brep = await this.db.loadBRep(ent.id, projectId)
          } else {
            brep = this.cache.loadBRep(ent.id, projectId)
          }
          if (brep) {
            try {
              const deflection = 0.1 / (doc.facetres || 5.0);
              const geometryData = await this.occ.importBRep(ent.id, brep, deflection);
              ent.positions = geometryData.positions;
              ent.indices = geometryData.indices;
            } catch (e) {
              console.error(`[Persistence] Failed to import BREP for ${ent.id}:`, e)
            }
          }
        }
      }

      doc.addEntity(ent)
    }

    // Single re-render
    app.syncFromDocument()
  }

  private async rebuildFromCreationParams(entity: Solid3D, facetres: number): Promise<void> {
    const { type, params } = entity.creationParams!
    const deflection = 0.1 / (facetres ?? 5.0)
    try {
      let geoData;
      switch (type) {
        case 'box':      geoData = await this.occ.createBox(params.x, params.y, params.z, params.dx, params.dy, params.dz, deflection, entity.id); break
        case 'cylinder': geoData = await this.occ.createCylinder(params.x, params.y, params.z, params.radius, params.height, deflection, entity.id); break
        case 'sphere':   geoData = await this.occ.createSphere(params.x, params.y, params.z, params.r, deflection, entity.id); break
        case 'cone':     geoData = await this.occ.createCone(params.x, params.y, params.z, params.r, params.h, deflection, entity.id); break
        case 'torus':    geoData = await this.occ.createTorus(params.x, params.y, params.z, params.r1, params.r2, deflection, entity.id); break
        case 'extrude':  geoData = await this.occ.createExtrude(params.points, params.height, params.thickness, deflection, params.isClosed, entity.id); break
        case 'revolve':  geoData = await this.occ.createRevolve(params.points, params.axisPoint, params.axisDir, params.angle, params.thickness, deflection, params.isClosed, entity.id); break
        default: console.warn(`[PersistenceService] Unknown creationParams type: ${type}`)
      }
      if (geoData) {
        const attr = geoData.getAttribute('position') as any;
        entity.positions = Array.from(attr.array);
        entity.indices = Array.from(geoData.getIndex()!.array);
      }
    } catch (err) {
      console.error(`[PersistenceService] Failed to rebuild cache for ${entity.id}:`, err)
    }
  }

  async newProject(doc: Document): Promise<string> {
    const pid = uuidv4()
    this.activeProjectId = pid
    this.activeProjectName = 'Untitled'
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
        idCounters: doc.getIdCounters()
      }
    })
    return pid
  }

  async onEntityErased(entityId: string, entity: any): Promise<void> {
    if (!this.activeProjectId) return
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
      this.activeProjectId   = null;
      this.activeProjectName = 'Untitled';
    }
  }

  scheduleAutoSave(doc: Document, getThumbnail?: () => string): void {
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
    return await this.db.listProjects()
  }
}
