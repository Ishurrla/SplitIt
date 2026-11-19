// Development only (loaded from main.tsx when import.meta.env.DEV). Lets a reviewer try reads
// and writes from the DevTools console as the signed-in user, through the same client SDK the
// app uses, so the security rules decide. See DEMO.md. Not part of a production build.
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

type Outcome = string

function denied(error: unknown): Outcome {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : ''
  return `refused (${code || String(error)})`
}

/** Path segments: a slash-separated path like "groups/abc/expenses". */
const parts = (path: string) => path.split('/').filter(Boolean) as [string, ...string[]]

const probe = {
  /** Who the console is acting as. */
  whoAmI: () => auth.currentUser?.uid ?? 'signed out',

  /** Reads a document (even number of segments) or a whole collection (odd number). */
  async read(path: string): Promise<Outcome> {
    const p = parts(path)
    try {
      if (p.length % 2 === 0) {
        const snap = await getDoc(doc(db, ...p))
        console.log(snap.exists() ? snap.data() : '(no such document)')
      } else {
        const snap = await getDocs(collection(db, ...p))
        console.log(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
      }
      return 'allowed'
    } catch (error) {
      return denied(error)
    }
  },

  /** Merges fields into a document, e.g. write('groups/abc', { balances: { me: 0 } }). */
  async write(path: string, data: DocumentData): Promise<Outcome> {
    try {
      await updateDoc(doc(db, ...parts(path)), data)
      return 'allowed'
    } catch (error) {
      return denied(error)
    }
  },

  /** Creates or replaces a document. */
  async create(path: string, data: DocumentData): Promise<Outcome> {
    try {
      await setDoc(doc(db, ...parts(path)), data)
      return 'allowed'
    } catch (error) {
      return denied(error)
    }
  },

  async remove(path: string): Promise<Outcome> {
    try {
      await deleteDoc(doc(db, ...parts(path)))
      return 'allowed'
    } catch (error) {
      return denied(error)
    }
  },
}

export type Probe = typeof probe

window.__splitit = { ...window.__splitit, ...probe }
console.info(
  'SplitIt dev helpers: __splitit.whoAmI(), .read(path), .write(path, data), .create(path, data), .remove(path). See DEMO.md.',
)
