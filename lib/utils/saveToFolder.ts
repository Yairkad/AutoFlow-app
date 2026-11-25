// Saves files straight into a folder the user picked once (File System Access API — Chrome /
// Edge). The folder handle is kept in IndexedDB under `key`, so later saves don't ask again
// (the browser may ask once per session to re-allow access). Other browsers: plain downloads.

const DB = 'autoflow-folders'
const STORE = 'handles'

/* eslint-disable @typescript-eslint/no-explicit-any */
type DirHandle = any

function idb<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open(DB, 1)
    open.onupgradeneeded = () => open.result.createObjectStore(STORE)
    open.onerror = () => reject(open.error)
    open.onsuccess = () => {
      const req = fn(open.result.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result as T)
      req.onerror = () => reject(req.error)
    }
  })
}

export const canPickFolder = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

export async function getSavedFolder(key: string): Promise<DirHandle | null> {
  if (!canPickFolder()) return null
  try { return (await idb<DirHandle>('readonly', s => s.get(key))) ?? null } catch { return null }
}

export async function pickFolder(key: string): Promise<DirHandle | null> {
  try {
    const dir = await (window as any).showDirectoryPicker({ id: key, mode: 'readwrite' })
    await idb('readwrite', s => s.put(dir, key))
    return dir
  } catch { return null } // user cancelled
}

function download(name: string, data: ArrayBuffer) {
  const url = URL.createObjectURL(new Blob([data]))
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Returns where the files went: the folder's name, or null for plain downloads. */
export async function saveFiles(key: string, files: { name: string; buffer: ArrayBuffer }[]): Promise<string | null> {
  let dir = await getSavedFolder(key)
  if (dir && (await dir.queryPermission({ mode: 'readwrite' })) !== 'granted'
      && (await dir.requestPermission({ mode: 'readwrite' })) !== 'granted') dir = null
  if (!dir && canPickFolder()) dir = await pickFolder(key)
  if (!dir) {
    files.forEach((f, i) => setTimeout(() => download(f.name, f.buffer), i * 400))
    return null
  }
  for (const f of files) {
    const fh = await dir.getFileHandle(f.name, { create: true })
    const w = await fh.createWritable()
    await w.write(f.buffer)
    await w.close()
  }
  return dir.name as string
}
