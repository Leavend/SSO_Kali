import { describe, expect, it } from 'vitest'
import { createEntityTag, requestHasMatchingEtag } from '../http-cache.js'

describe('portal BFF HTTP cache helpers', () => {
  it('creates stable quoted entity tags from shell body content', () => {
    expect(createEntityTag('<html>shell</html>')).toMatch(/^W\/"[a-f0-9]{16}"$/)
    expect(createEntityTag('<html>shell</html>')).toBe(createEntityTag('<html>shell</html>'))
    expect(createEntityTag('<html>updated</html>')).not.toBe(createEntityTag('<html>shell</html>'))
  })

  it('matches If-None-Match values without treating partial tags as fresh', () => {
    const etag = createEntityTag('shell')

    expect(requestHasMatchingEtag({ headers: { 'if-none-match': `"old", ${etag}` } } as never, etag)).toBe(true)
    expect(requestHasMatchingEtag({ headers: { 'if-none-match': '*' } } as never, etag)).toBe(true)
    expect(requestHasMatchingEtag({ headers: { 'if-none-match': '"old"' } } as never, etag)).toBe(false)
  })
})
