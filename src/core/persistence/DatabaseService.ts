import { createRxDatabase, RxDatabase, RxCollection, addRxPlugin, removeRxDatabase } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode'
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv'
import { PROJECT_SCHEMA, ENTITY_SCHEMA, LAYER_SCHEMA, BREP_SCHEMA } from './schemas'

addRxPlugin(RxDBMigrationSchemaPlugin)
addRxPlugin(RxDBDevModePlugin)

export class DatabaseService {
  private static instance: DatabaseService
  private db!: RxDatabase
  projects!: RxCollection
  entities!: RxCollection
  layers!:   RxCollection
  breps!:    RxCollection

  private initPromise: Promise<void> | null = null;

  static getInstance(): DatabaseService {
    if (!this.instance) this.instance = new DatabaseService()
    return this.instance
  }

  private getStorage() {
    return wrappedValidateAjvStorage({ storage: getRxStorageDexie() });
  }

  /**
   * Performs a standard database reset by removing the existing database
   * and re-initializing from scratch.
   */
  async resetDatabase(): Promise<void> {
    console.warn('[DatabaseService] Performing standard database reset...');
    if (this.db) {
      try {
        await this.db.remove();
      } catch (e) {
        console.error('[DatabaseService] db.remove() failed:', e);
      }
    }
    await removeRxDatabase('webcad', this.getStorage());
    this.initPromise = null;
    console.log('[DatabaseService] Database removal complete.');
  }

  async init(forceReset: boolean = false): Promise<void> {
    if (this.initPromise && !forceReset) return this.initPromise;
    
    this.initPromise = (async () => {
      if (forceReset) {
        await this.resetDatabase();
      }

      console.log('[DatabaseService] Initializing database (stable + AJV)...');
      try {
        this.db = await createRxDatabase({ 
          name: 'webcad', 
          storage: this.getStorage(),
          ignoreDuplicate: true
        })
        
        console.log('[DatabaseService] Syncing collections...');
        await this.db.addCollections({
          projects: { 
            schema: PROJECT_SCHEMA,
            migrationStrategies: {
              1: (oldDoc: any) => {
                const doc = JSON.parse(JSON.stringify(oldDoc));
                if (!doc.settings) doc.settings = {};
                if (!doc.settings.constraints) doc.settings.constraints = [];
                return doc;
              }
            }
          },
          entities: { 
            schema: ENTITY_SCHEMA,
            migrationStrategies: {
              1: (oldDoc: any) => {
                const doc = JSON.parse(JSON.stringify(oldDoc));
                if (doc.updatedAt === undefined) doc.updatedAt = Date.now();
                return doc;
              }
            }
          },
          layers: { schema: LAYER_SCHEMA },
          breps:  { schema: BREP_SCHEMA  }
        })

        this.projects = this.db.projects
        this.entities = this.db.entities
        this.layers   = this.db.layers
        this.breps    = (this.db as any).breps
        console.log('[DatabaseService] Database initialization successful.');
      } catch (err) {
        console.error('[DatabaseService] INIT ERROR:', err);
        this.initPromise = null;
        throw err;
      }
    })();
    return this.initPromise;
  }

  // Projects
  async upsertProject(row: object): Promise<void> { await this.projects.upsert(row) }
  async getProject(id: string): Promise<any> {
    if (!this.projects) return null;
    return (await this.projects.findOne(id).exec())?.toJSON() ?? null
  }
  async listProjects(): Promise<any[]> {
    if (!this.projects) return [];
    return (await this.projects.find({ sort: [{ updatedAt: 'desc' }] }).exec()).map(d => d.toJSON())
  }
  async deleteProject(id: string): Promise<void> {
    if (!this.projects) return;
    await this.projects.findOne(id).remove()
    await this.entities.find({ selector: { projectId: id } }).remove()
    await this.layers.find({ selector: { projectId: id } }).remove()
  }

  // Entities
  async bulkUpsertEntities(rows: object[]): Promise<void> { 
    if (!this.entities) return;
    await this.entities.bulkUpsert(rows) 
  }
  async getEntitiesForProject(pid: string): Promise<any[]> {
    if (!this.entities) return [];
    return (await this.entities.find({ selector: { projectId: pid } }).exec()).map(d => d.toJSON())
  }
  async deleteEntity(id: string): Promise<void> { 
    if (!this.entities) return;
    await this.entities.findOne(id).remove() 
  }

  // Layers
  async bulkUpsertLayers(rows: object[]): Promise<void> { 
    if (!this.layers) return;
    await this.layers.bulkUpsert(rows) 
  }
  async getLayersForProject(pid: string): Promise<any[]> {
    if (!this.layers) return [];
    return (await this.layers.find({ selector: { projectId: pid } }).exec()).map(d => d.toJSON())
  }

  // BREP Fallback
  async saveBRep(entityId: string, projectId: string, data: Uint8Array): Promise<void> {
    if (!this.breps) return;
    const id = `${projectId}::${entityId}`;
    let binary = '';
    const len = data.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(data[i]);
    }
    const base64 = btoa(binary);
    await this.breps.upsert({ id, projectId, entityId, data: base64 });
  }

  async loadBRep(entityId: string, projectId: string): Promise<Uint8Array | null> {
    if (!this.breps) return null;
    const id = `${projectId}::${entityId}`;
    const row = await this.breps.findOne(id).exec();
    if (!row) return null;
    const binary = atob(row.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Reactive observable for FileToolWindow
  projects$() { 
    if (!this.projects) return null;
    return this.projects.find({ sort: [{ updatedAt: 'desc' }] }).$ 
  }
}
