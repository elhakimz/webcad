import { createRxDatabase, RxDatabase, RxCollection, addRxPlugin } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { PROJECT_SCHEMA, ENTITY_SCHEMA, LAYER_SCHEMA, BREP_SCHEMA } from './schemas'

addRxPlugin(RxDBMigrationSchemaPlugin)

export class DatabaseService {
  private static instance: DatabaseService
  private db!: RxDatabase
  projects!: RxCollection
  entities!: RxCollection
  layers!:   RxCollection

  static getInstance(): DatabaseService {
    if (!this.instance) this.instance = new DatabaseService()
    return this.instance
  }

  async init(): Promise<void> {
    console.log('[DatabaseService] Creating database...');
    this.db = await createRxDatabase({ name: 'webcad', storage: getRxStorageDexie() })
    console.log('[DatabaseService] Database created. Adding collections...');
    await this.db.addCollections({
      projects: { schema: PROJECT_SCHEMA },
      entities: { 
        schema: ENTITY_SCHEMA,
        migrationStrategies: {
          1: (oldDoc: any) => {
            console.log('[DatabaseService] Migrating entity:', oldDoc.id);
            if (oldDoc.updatedAt === undefined) {
              oldDoc.updatedAt = Date.now();
            }
            return oldDoc;
          }
        }
      },
      layers:   { schema: LAYER_SCHEMA   },
      breps:    { schema: BREP_SCHEMA    }
    })
    console.log('[DatabaseService] Collections added.');
    this.projects = this.db.projects
    this.entities = this.db.entities
    this.layers   = this.db.layers
  }

  // Projects
  async upsertProject(row: object): Promise<void> { await this.projects.upsert(row) }
  async getProject(id: string): Promise<any> {
    return (await this.projects.findOne(id).exec())?.toJSON() ?? null
  }
  async listProjects(): Promise<any[]> {
    if (!this.projects) return [];
    return (await this.projects.find({ sort: [{ updatedAt: 'desc' }] }).exec()).map(d => d.toJSON())
  }
  async deleteProject(id: string): Promise<void> {
    await this.projects.findOne(id).remove()
    await this.entities.find({ selector: { projectId: id } }).remove()
    await this.layers.find({ selector: { projectId: id } }).remove()
  }

  // Entities
  async bulkUpsertEntities(rows: object[]): Promise<void> { await this.entities.bulkUpsert(rows) }
  async getEntitiesForProject(pid: string): Promise<any[]> {
    return (await this.entities.find({ selector: { projectId: pid } }).exec()).map(d => d.toJSON())
  }
  async deleteEntity(id: string): Promise<void> { await this.entities.findOne(id).remove() }

  // Layers
  async bulkUpsertLayers(rows: object[]): Promise<void> { await this.layers.bulkUpsert(rows) }
  async getLayersForProject(pid: string): Promise<any[]> {
    return (await this.layers.find({ selector: { projectId: pid } }).exec()).map(d => d.toJSON())
  }

  // BREP Fallback
  async saveBRep(entityId: string, projectId: string, data: Uint8Array): Promise<void> {
    const id = `${projectId}::${entityId}`;
    let binary = '';
    const len = data.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(data[i]);
    }
    const base64 = btoa(binary);
    await (this.db as any).breps.upsert({ id, projectId, entityId, data: base64 });
  }

  async loadBRep(entityId: string, projectId: string): Promise<Uint8Array | null> {
    const id = `${projectId}::${entityId}`;
    const row = await (this.db as any).breps.findOne(id).exec();
    if (!row) return null;
    const binary = atob(row.data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  // Reactive observable for FileToolWindow
  projects$() { return this.projects.find({ sort: [{ updatedAt: 'desc' }] }).$ }
}
