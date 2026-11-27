// Keeps the sync data key on this device (IndexedDB stores CryptoKeys as-is, so a
// non-extractable key stays non-extractable). Lets sync run without a passkey prompt per
// session; the local data itself is still plain localStorage, so this adds no new exposure.
// Revisit when local storage gets encrypted at rest (docs/encrypted-local-storage.md).

const DB = "timely-sync";
const STORE = "keys";
const ID = "dek";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result as T);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export const loadKey = () =>
  tx<CryptoKey | undefined>("readonly", (s) => s.get(ID)).then((k) => k ?? null);
export const saveKey = (key: CryptoKey) => tx<void>("readwrite", (s) => s.put(key, ID));
export const deleteKey = () => tx<void>("readwrite", (s) => s.delete(ID));
