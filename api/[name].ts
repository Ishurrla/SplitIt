import { handleApi } from '../server/http/handle.js'

// The API on Vercel: one function for every /api/<name> (the Hobby plan allows at most 12
// functions, and there are 14 calls). All the work happens in server/http/handle.ts.

/**
 * The call's name. Vercel routes /api/createGroup here as /api/[name]?name=createGroup, so the
 * query is read first; the last path segment covers a request that arrives unrewritten.
 */
function callName(request: Request): string {
  const url = new URL(request.url)
  const fromQuery = url.searchParams.get('name')
  if (fromQuery) return fromQuery
  return decodeURIComponent(url.pathname.split('/').pop() ?? '')
}

function handler(request: Request): Promise<Response> {
  return handleApi(callName(request), request)
}

export { handler as DELETE, handler as GET, handler as PATCH, handler as POST, handler as PUT }
