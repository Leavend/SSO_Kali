/**
 * Triggers a browser download for an in-memory blob without persisting it.
 *
 * Isolated here so service and store layers stay DOM-free per the admin
 * frontend code standards. The object URL is revoked immediately after the
 * synthetic click so no blob reference lingers in memory.
 */
export function triggerBlobDownload(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = filename
  anchor.rel = 'noopener'

  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  URL.revokeObjectURL(objectUrl)
}
