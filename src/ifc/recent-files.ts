const DB_NAME = "visualizador-bim";
const DB_VERSION = 1;
const META_STORE = "recentFilesMeta";
const DATA_STORE = "recentFilesData";
const MAX_RECENT = 5;

export interface RecentFileEntry {
  name: string;
  size: number;
  timestamp: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE, { keyPath: "name" });
      if (!db.objectStoreNames.contains(DATA_STORE)) db.createObjectStore(DATA_STORE, { keyPath: "name" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function reqToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txToPromise(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Guarda el archivo en IndexedDB y descarta los más antiguos por encima de MAX_RECENT. */
export async function saveRecentFile(name: string, data: Uint8Array): Promise<void> {
  const db = await openDb();
  const meta: RecentFileEntry = { name, size: data.byteLength, timestamp: Date.now() };

  const writeTx = db.transaction([META_STORE, DATA_STORE], "readwrite");
  writeTx.objectStore(META_STORE).put(meta);
  writeTx.objectStore(DATA_STORE).put({ name, data });
  await txToPromise(writeTx);

  const entries = await reqToPromise<RecentFileEntry[]>(
    db.transaction(META_STORE).objectStore(META_STORE).getAll(),
  );
  if (entries.length > MAX_RECENT) {
    const stale = entries.sort((a, b) => a.timestamp - b.timestamp).slice(0, entries.length - MAX_RECENT);
    const pruneTx = db.transaction([META_STORE, DATA_STORE], "readwrite");
    for (const entry of stale) {
      pruneTx.objectStore(META_STORE).delete(entry.name);
      pruneTx.objectStore(DATA_STORE).delete(entry.name);
    }
    await txToPromise(pruneTx);
  }

  db.close();
}

export async function listRecentFiles(): Promise<RecentFileEntry[]> {
  const db = await openDb();
  const entries = await reqToPromise<RecentFileEntry[]>(
    db.transaction(META_STORE).objectStore(META_STORE).getAll(),
  );
  db.close();
  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getRecentFileData(name: string): Promise<Uint8Array | undefined> {
  const db = await openDb();
  const record = await reqToPromise<{ name: string; data: Uint8Array } | undefined>(
    db.transaction(DATA_STORE).objectStore(DATA_STORE).get(name),
  );
  db.close();
  return record?.data;
}
