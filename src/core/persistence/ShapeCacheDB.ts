import sqlite3InitModule from '@sqlite.org/sqlite-wasm'

export class ShapeCacheDB {
  private static instance: ShapeCacheDB
  private db: any = null
  private inMemory: boolean = false;

  static getInstance(): ShapeCacheDB {
    if (!this.instance) this.instance = new ShapeCacheDB()
    return this.instance
  }

  isInMemory(): boolean {
    return this.inMemory;
  }

  async init(): Promise<void> {
    console.log('[ShapeCacheDB] Initializing SQLite...');
    const sqlite3 = await (sqlite3InitModule as any)({
      print: console.log,
      printErr: console.error,
      locateFile: (path: string, prefix: string) => {
        if (path.endsWith('.wasm')) {
          return '/sqlite3.wasm';
        }
        return prefix + path;
      }
    })
    if (sqlite3.capi.sqlite3_vfs_find('opfs')) {
      this.db = new sqlite3.oo1.OpfsDb('/webcad-cache.db')
      this.inMemory = false;
    } else {
      console.warn('[ShapeCacheDB] OPFS unavailable — falling back to in-memory (data will not persist)')
      this.db = new sqlite3.oo1.DB(':memory:')
      this.inMemory = true;
    }
    this.createSchema()
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tessellation_cache (
        entity_id   TEXT NOT NULL,
        project_id  TEXT NOT NULL,
        positions   BLOB NOT NULL,
        indices     BLOB NOT NULL,
        deflection  REAL NOT NULL,
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (entity_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS brep_cache (
        entity_id   TEXT NOT NULL,
        project_id  TEXT NOT NULL,
        brep_data   BLOB NOT NULL,
        created_at  INTEGER NOT NULL,
        PRIMARY KEY (entity_id, project_id)
      );
      CREATE TABLE IF NOT EXISTS file_history (
        project_id   TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        last_opened  INTEGER NOT NULL,
        thumbnail    TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_tess ON tessellation_cache(project_id);
      CREATE INDEX IF NOT EXISTS idx_brep ON brep_cache(project_id);
    `)
  }

  // Tessellation
  saveTessellation(eid: string, pid: string, positions: number[], indices: number[], deflection: number): void {
    this.db.exec({ sql: `INSERT OR REPLACE INTO tessellation_cache VALUES (?,?,?,?,?,?)`,
      bind: [eid, pid, new Uint8Array(new Float32Array(positions).buffer),
             new Uint8Array(new Uint32Array(indices).buffer), deflection, Date.now()] })
  }
  loadTessellation(eid: string, pid: string): { positions: number[], indices: number[], deflection: number } | null {
    const rows = this.db.exec({ sql: `SELECT positions,indices,deflection FROM tessellation_cache WHERE entity_id=? AND project_id=?`,
      bind: [eid, pid], returnValue: 'resultRows', rowMode: 'array' })
    if (!rows.length) return null
    const [p, i, d] = rows[0]
    return { positions: Array.from(new Float32Array(p.buffer)), indices: Array.from(new Uint32Array(i.buffer)), deflection: d }
  }
  deleteTessellation(eid: string, pid: string): void {
    this.db.exec({ sql: 'DELETE FROM tessellation_cache WHERE entity_id=? AND project_id=?', bind: [eid, pid] })
  }

  // BREP
  saveBRep(eid: string, pid: string, brepBytes: Uint8Array): void {
    this.db.exec({ sql: `INSERT OR REPLACE INTO brep_cache VALUES (?,?,?,?)`,
      bind: [eid, pid, brepBytes, Date.now()] })
  }
  loadBRep(eid: string, pid: string): Uint8Array | null {
    const rows = this.db.exec({ sql: `SELECT brep_data FROM brep_cache WHERE entity_id=? AND project_id=?`,
      bind: [eid, pid], returnValue: 'resultRows', rowMode: 'array' })
    return rows.length ? rows[0][0] : null
  }
  deleteBRep(eid: string, pid: string): void {
    this.db.exec({ sql: 'DELETE FROM brep_cache WHERE entity_id=? AND project_id=?', bind: [eid, pid] })
  }

  // File history
  upsertHistory(pid: string, name: string, thumbnail?: string): void {
    this.db.exec({ sql: `INSERT OR REPLACE INTO file_history VALUES (?,?,?,?)`,
      bind: [pid, name, Date.now(), thumbnail ?? null] })
  }
  getHistory(): any[] {
    if (!this.db) return []
    return this.db.exec({ sql: 'SELECT project_id,name,last_opened,thumbnail FROM file_history ORDER BY last_opened DESC LIMIT 20',
      returnValue: 'resultRows', rowMode: 'object' })
  }
  deleteHistory(pid: string): void {
    this.db.exec({ sql: 'DELETE FROM file_history WHERE project_id=?', bind: [pid] })
  }

  // Bulk clear
  clearProject(pid: string): void {
    this.db.exec('BEGIN')
    try {
      this.db.exec({ sql: 'DELETE FROM tessellation_cache WHERE project_id=?', bind: [pid] })
      this.db.exec({ sql: 'DELETE FROM brep_cache WHERE project_id=?',         bind: [pid] })
      this.db.exec('COMMIT')
    } catch (e) { this.db.exec('ROLLBACK'); throw e }
  }
}
