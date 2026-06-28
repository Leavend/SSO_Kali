import type { BlobResponse } from '@/lib/api/api-client'

// The ONLY DOM-touching piece of the blob-download path: turns the transient
// BlobResponse from apiClient.getBlob into a file download via an object URL +
// a one-shot anchor, then revokes the URL immediately so the blob is never
// retained (and therefore never reaches useState/Pinia/storage or the SSR
// payload). The service and composable layers stay DOM-free.
export function triggerBlobDownload(response: BlobResponse, fallback: string): void {
  // ponytail: dual guard. import.meta.client strips this from the SSR build;
  // typeof document is the runtime no-op the unit test can exercise (vitest
  // compiles import.meta.client to a constant true).
  if (!import.meta.client || typeof document === 'undefined') return

  const url = URL.createObjectURL(response.blob)
  try {
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = response.filename ?? fallback
    anchor.rel = 'noopener'
    anchor.click()
  } finally {
    // Revoke even if click() throws, so a failed download never leaks the URL.
    URL.revokeObjectURL(url)
  }
}
