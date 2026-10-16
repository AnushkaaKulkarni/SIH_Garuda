export async function readJson(request: Request, maxBytes = 1024 * 1024): Promise<unknown> {
  const declaredLength = Number(request.headers.get('content-length') || 0)
  if (declaredLength > maxBytes) throw new RangeError('Request is too large.')
  if (!request.body) throw new SyntaxError('Request body must be valid JSON.')

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel()
      throw new RangeError('Request is too large.')
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown
  } catch {
    throw new SyntaxError('Request body must be valid JSON.')
  }
}

export function requestBodyError(error: unknown) {
  if (error instanceof RangeError) return Response.json({ error: error.message }, { status: 413 })
  return Response.json({ error: 'Request body must be valid JSON.' }, { status: 400 })
}

export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } })
}
