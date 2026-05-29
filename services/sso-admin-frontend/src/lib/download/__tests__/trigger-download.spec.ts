import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerBlobDownload } from '../trigger-download'

describe('triggerBlobDownload', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn<(obj: Blob | MediaSource) => string>(() => 'blob:fake-url')
    URL.revokeObjectURL = vi.fn<(url: string) => void>()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('creates an object URL, clicks a named download anchor, then revokes the URL', () => {
    const anchor = document.createElement('a')
    const clickSpy = vi.spyOn(anchor, 'click').mockImplementation(() => {})
    vi.spyOn(document, 'createElement').mockReturnValue(anchor)

    const blob = new Blob(['action,outcome\n'], { type: 'text/csv' })
    triggerBlobDownload(blob, 'audit-export.csv')

    expect(URL.createObjectURL).toHaveBeenCalledWith(blob)
    expect(anchor.download).toBe('audit-export.csv')
    expect(clickSpy).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake-url')
  })
})
