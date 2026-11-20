import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { Readable } from 'node:stream'
import { handleApi } from './handle.js'

// Runs the API on plain Node: inside the Vite dev server (pnpm dev), and on its own for the API
// tests. It only turns Node's request into a Web Request and back; everything else happens in
// handleApi, the same function api/[name].ts calls on Vercel.

/** Handles one request. `path` is the part after /api/, for example "createGroup". */
export async function serveApi(req: IncomingMessage, res: ServerResponse, path: string) {
  const name = decodeURIComponent(path.split('?')[0] ?? '').replace(/^\/+/, '')
  const headers = new Headers()
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value)
    else if (Array.isArray(value)) for (const v of value) headers.append(key, v)
  }
  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  const request = new Request(`http://${req.headers.host ?? 'localhost'}/api/${name}`, {
    method: req.method ?? 'GET',
    headers,
    body: hasBody ? (Readable.toWeb(req) as ReadableStream<Uint8Array>) : null,
    // Node's fetch needs this for a streamed request body.
    duplex: 'half',
  } as RequestInit)

  const response = await handleApi(name, request)
  res.writeHead(response.status, Object.fromEntries(response.headers))
  res.end(Buffer.from(await response.arrayBuffer()))
}

/** A server answering /api/<name> and nothing else. Used by the API tests (tests/api). */
export function startApiServer(port: number): Promise<Server> {
  const server = createServer((req, res) => {
    const url = req.url ?? '/'
    if (!url.startsWith('/api/')) {
      res.writeHead(404).end()
      return
    }
    serveApi(req, res, url.slice('/api/'.length)).catch((error: unknown) => {
      console.error(error)
      if (!res.headersSent) res.writeHead(500)
      res.end()
    })
  })
  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      resolve(server)
    })
  })
}
