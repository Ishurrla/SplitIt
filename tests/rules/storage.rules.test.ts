import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { afterAll, beforeAll, describe, it } from 'vitest'
import {
  A,
  AVATAR_A,
  B,
  BUCKET,
  C,
  COVER,
  EMAIL,
  G1,
  RECEIPT,
  createWorld,
  smallFile,
} from './world'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createWorld()
})
afterAll(async () => {
  await env.cleanup()
})

const as = (uid: keyof typeof EMAIL) =>
  env.authenticatedContext(uid, { email: EMAIL[uid] }).storage(BUCKET)
const signedOut = () => env.unauthenticatedContext().storage(BUCKET)

const FIVE_MB = 5 * 1024 * 1024
const BIG_UPLOAD_TIMEOUT = 60_000
const upload = (
  storage: ReturnType<typeof as>,
  path: string,
  contentType: string,
  bytes = 1024,
): Promise<unknown> => Promise.resolve(storage.ref(path).put(smallFile(bytes), { contentType }))

describe('receipts/{gid}/{eid}/{file}', () => {
  it('A (member) can read a receipt', () => assertSucceeds(as(A).ref(RECEIPT).getDownloadURL()))
  it('C (member) can read a receipt', () => assertSucceeds(as(C).ref(RECEIPT).getMetadata()))
  it('B (outsider) cannot read a receipt', () => assertFails(as(B).ref(RECEIPT).getDownloadURL()))
  it('signed-out visitor cannot read a receipt', () =>
    assertFails(signedOut().ref(RECEIPT).getDownloadURL()))
  it('a member can upload a JPEG', () =>
    assertSucceeds(upload(as(C), `receipts/${G1}/e2/r.jpg`, 'image/jpeg')))
  it('a member can upload a PNG', () =>
    assertSucceeds(upload(as(A), `receipts/${G1}/e2/r.png`, 'image/png')))
  it('a member can upload a WebP', () =>
    assertSucceeds(upload(as(A), `receipts/${G1}/e2/r.webp`, 'image/webp')))
  it('rejects an SVG (can carry scripts)', () =>
    assertFails(upload(as(A), `receipts/${G1}/e2/r.svg`, 'image/svg+xml')))
  it('rejects a PDF', () =>
    assertFails(upload(as(A), `receipts/${G1}/e2/r.pdf`, 'application/pdf')))
  // The 5 MB uploads (here and for avatars) get a minute each, not the 20 s default: on a busy machine the emulator
  // can take longer than that to receive 5 MB before it even checks the rule (decision log 33).
  it(
    'rejects a file of exactly 5 MB',
    () => assertFails(upload(as(A), `receipts/${G1}/e2/big.jpg`, 'image/jpeg', FIVE_MB)),
    BIG_UPLOAD_TIMEOUT,
  )
  it(
    'accepts a file just under 5 MB',
    () => assertSucceeds(upload(as(A), `receipts/${G1}/e2/ok.jpg`, 'image/jpeg', FIVE_MB - 1)),
    BIG_UPLOAD_TIMEOUT,
  )
  it('B (outsider) cannot upload a receipt', () =>
    assertFails(upload(as(B), `receipts/${G1}/e2/b.jpg`, 'image/jpeg')))
  it('signed-out visitor cannot upload a receipt', () =>
    assertFails(upload(signedOut(), `receipts/${G1}/e2/anon.jpg`, 'image/jpeg')))
  it('a member cannot delete a receipt (only deleteExpense can)', () =>
    assertFails(as(A).ref(RECEIPT).delete()))
})

describe('avatars/{uid}/{file}', () => {
  it('anyone can read an avatar, even signed out', () =>
    assertSucceeds(signedOut().ref(AVATAR_A).getDownloadURL()))
  it('A can upload to their own folder', () =>
    assertSucceeds(upload(as(A), `avatars/${A}/new.jpg`, 'image/jpeg')))
  it("B cannot upload into A's folder", () =>
    assertFails(upload(as(B), `avatars/${A}/fake.jpg`, 'image/jpeg')))
  it("B cannot delete A's avatar", () => assertFails(as(B).ref(AVATAR_A).delete()))
  it('rejects a non-image avatar', () =>
    assertFails(upload(as(A), `avatars/${A}/x.html`, 'text/html')))
  it(
    'rejects an avatar of 5 MB or more',
    () => assertFails(upload(as(A), `avatars/${A}/big.jpg`, 'image/jpeg', FIVE_MB)),
    BIG_UPLOAD_TIMEOUT,
  )
  it('signed-out visitor cannot upload an avatar', () =>
    assertFails(upload(signedOut(), `avatars/${A}/anon.jpg`, 'image/jpeg')))
})

describe('covers/{gid}/{file}', () => {
  it('A (owner) can read the cover', () => assertSucceeds(as(A).ref(COVER).getDownloadURL()))
  it('C (member) can read the cover', () => assertSucceeds(as(C).ref(COVER).getDownloadURL()))
  it('B (outsider) cannot read the cover', () => assertFails(as(B).ref(COVER).getDownloadURL()))
  it('A (owner) can upload a cover', () =>
    assertSucceeds(upload(as(A), `covers/${G1}/new.jpg`, 'image/jpeg')))
  it('C (member, not owner) cannot upload a cover', () =>
    assertFails(upload(as(C), `covers/${G1}/c.jpg`, 'image/jpeg')))
  it('B (outsider) cannot upload a cover', () =>
    assertFails(upload(as(B), `covers/${G1}/b.jpg`, 'image/jpeg')))
  it('C (member, not owner) cannot delete the cover', () => assertFails(as(C).ref(COVER).delete()))
})

describe('anywhere else in the bucket', () => {
  it('A cannot upload outside the known folders', () =>
    assertFails(upload(as(A), 'public/x.jpg', 'image/jpeg')))
  it('A cannot read outside the known folders', () =>
    assertFails(as(A).ref('public/x.jpg').getMetadata()))
})
