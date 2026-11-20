import { handleApi } from '../server/http/handle.js'

// The API on Vercel: one function for every /api/<name> (the Hobby plan allows at most 12
// functions, and there are 14 calls). All the work happens in server/http/handle.ts.

function handler(request: Request): Promise<Response> {
  const name = decodeURIComponent(new URL(request.url).pathname.split('/').pop() ?? '')
  return handleApi(name, request)
}

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT }
