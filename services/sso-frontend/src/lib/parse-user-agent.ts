/**
 * parseUserAgent — lightweight UA parser (zero dependency).
 *
 * Extracts browser name, OS, and device type from user-agent string.
 * Not exhaustive — covers 95%+ of real-world traffic patterns.
 */

export type ParsedUserAgent = {
  readonly browser: string
  readonly os: string
  readonly device: 'desktop' | 'mobile' | 'tablet' | 'unknown'
}

export function parseUserAgent(ua: string | null | undefined): ParsedUserAgent {
  if (!ua) return { browser: 'Unknown', os: 'Unknown', device: 'unknown' }

  const browser = detectBrowser(ua)
  const os = detectOS(ua)
  const device = detectDevice(ua)

  return { browser, os, device }
}

function detectBrowser(ua: string): string {
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('OPR/') || ua.includes('Opera')) return 'Opera'
  if (ua.includes('Brave')) return 'Brave'
  if (ua.includes('Vivaldi')) return 'Vivaldi'
  if (ua.includes('Chrome/') && !ua.includes('Chromium')) return 'Chrome'
  if (ua.includes('Chromium')) return 'Chromium'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari'
  if (ua.includes('MSIE') || ua.includes('Trident/')) return 'IE'
  return 'Unknown'
}

function detectOS(ua: string): string {
  if (ua.includes('Windows NT 10')) return 'Windows 10/11'
  if (ua.includes('Windows NT')) return 'Windows'
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS'
  if (ua.includes('Android')) return 'Android'
  if (ua.includes('Mac OS X')) return 'macOS'
  if (ua.includes('CrOS')) return 'ChromeOS'
  if (ua.includes('Linux')) return 'Linux'
  return 'Unknown'
}

function detectDevice(ua: string): 'desktop' | 'mobile' | 'tablet' | 'unknown' {
  if (/iPad|tablet|Kindle|PlayBook/i.test(ua)) return 'tablet'
  if (/Mobile|Android.*Mobile|iPhone|iPod|Opera Mini|IEMobile/i.test(ua)) return 'mobile'
  if (/Windows NT|Macintosh|Mac OS X|Linux|X11|CrOS/i.test(ua)) return 'desktop'
  return 'unknown'
}
