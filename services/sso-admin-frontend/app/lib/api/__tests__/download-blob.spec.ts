import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { triggerBlobDownload } from '../download-blob'
import type { BlobResponse } from '@/lib/api/api-client'

// jsdom does not implement URL.createObjectURL/revokeObjectURL, so we stub the
// whole URL global with just the two static methods the helper uses.
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:mock-url')
const revokeObjectURL = vi.fn<(url: string) => void>()

// Capture every <a> the helper creates and replace its click() with a spy so a
// click never triggers a real navigation in jsdom.
const clickedAnchors: HTMLAnchorElement[] = []
const clickSpy = vi.fn<(this: HTMLAnchorElement) => void>()

function makeResponse(filename: string | null): BlobResponse {
  return { blob: new Blob(['id,action\n1,login'], { type: 'text/csv' }), filename }
}

beforeEach(() => {
  clickedAnchors.length = 0
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL } as unknown as typeof URL)
  const realCreateElement = document.createElement.bind(document)
  vi.spyOn(document, 'createElement').mockImplementation(((tag: string) => {
    const element = realCreateElement(tag)
    if (tag === 'a') {
      const anchor = element as HTMLAnchorElement
      anchor.click = clickSpy
      clickedAnchors.push(anchor)
    }
    return element
  }) as typeof document.createElement)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  createObjectURL.mockClear()
  revokeObjectURL.mockClear()
  clickSpy.mockClear()
})

describe('triggerBlobDownload', () => {
  it('uses the response filename when the Content-Disposition header supplied one', () => {
    triggerBlobDownload(makeResponse('admin-audit-events.csv'), 'fallback.csv')

    expect(createObjectURL).toHaveBeenCalledTimes(1)
    expect(createObjectURL.mock.calls[0]?.[0]).toBeInstanceOf(Blob)
    expect(clickedAnchors).toHaveLength(1)
    expect(clickedAnchors[0]?.download).toBe('admin-audit-events.csv')
    expect(clickedAnchors[0]?.rel).toBe('noopener')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('falls back to the provided name when filename is null', () => {
    triggerBlobDownload(makeResponse(null), 'compliance-evidence-pack.zip')

    expect(clickedAnchors[0]?.download).toBe('compliance-evidence-pack.zip')
    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('revokes the object URL immediately after the click (no retained blob URL)', () => {
    triggerBlobDownload(makeResponse('admin-audit-events.jsonl'), 'fallback.jsonl')

    expect(revokeObjectURL).toHaveBeenCalledTimes(1)
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-url')
  })

  it('is a safe no-op server-side (no DOM): nothing runs and nothing throws', () => {
    vi.stubGlobal('document', undefined)

    expect(() =>
      triggerBlobDownload(makeResponse('admin-audit-events.csv'), 'fallback.csv'),
    ).not.toThrow()
    expect(createObjectURL).not.toHaveBeenCalled()
    expect(clickSpy).not.toHaveBeenCalled()
  })
})
