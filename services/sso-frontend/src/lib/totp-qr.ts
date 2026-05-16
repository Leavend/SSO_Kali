import qrcode from 'qrcode-generator'

export function totpQrDataUrl(provisioningUri: string): string {
  const qr = qrcode(0, 'M')
  qr.addData(provisioningUri, 'Byte')
  qr.make()

  return svgDataUrl(qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true }))
}

function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;base64,${base64(svg)}`
}

function base64(value: string): string {
  const binary = Array.from(new TextEncoder().encode(value), (byte) => String.fromCharCode(byte)).join('')
  return btoa(binary)
}
