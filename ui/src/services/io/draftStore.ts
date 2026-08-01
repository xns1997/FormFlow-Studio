export interface EditorDraft {
  id: string;
  projectId: string;
  scopeKey: string;
  updatedAt: number;
  forms?: unknown;
  activeFormId?: string | null;
  behaviorDraft?: string;
}

const DB_NAME = 'formflow-recovery';
const STORE_NAME = 'editor-drafts';
const memory = new Map<string, EditorDraft>();

function openDb(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(undefined);
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(undefined);
  });
}

export async function loadEditorDraft(id: string): Promise<EditorDraft | undefined> {
  const cached = memory.get(id);
  const db = await openDb();
  if (!db) return cached;
  try {
    return await new Promise<EditorDraft | undefined>((resolve) => {
      const request = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
      request.onsuccess = () => { const value = request.result as EditorDraft | undefined; if (value) memory.set(id, value); resolve(value || cached); };
      request.onerror = () => resolve(cached);
    });
  } finally { db.close(); }
}

export async function saveEditorDraft(draft: EditorDraft): Promise<void> {
  memory.set(draft.id, draft);
  const db = await openDb();
  if (!db) return;
  try {
    await new Promise<void>((resolve) => {
      const request = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(draft);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
    });
  } finally { db.close(); }
}

export async function clearEditorDraft(id: string): Promise<void> {
  memory.delete(id);
  const db = await openDb();
  if (!db) return;
  try { db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id); } finally { db.close(); }
}
