import { describe, expect, it } from 'vitest'
import { parseUserAgent } from '../parse-user-agent'

describe('parseUserAgent', () => {
  it('parses Chrome on Windows', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    )
    expect(result.browser).toBe('Chrome')
    expect(result.os).toBe('Windows 10/11')
    expect(result.device).toBe('desktop')
  })

  it('parses Safari on macOS', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
    )
    expect(result.browser).toBe('Safari')
    expect(result.os).toBe('macOS')
    expect(result.device).toBe('desktop')
  })

  it('parses Firefox on Linux', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
    )
    expect(result.browser).toBe('Firefox')
    expect(result.os).toBe('Linux')
    expect(result.device).toBe('desktop')
  })

  it('parses Chrome on Android mobile', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    )
    expect(result.browser).toBe('Chrome')
    expect(result.os).toBe('Android')
    expect(result.device).toBe('mobile')
  })

  it('parses Safari on iPhone', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    )
    expect(result.browser).toBe('Safari')
    expect(result.os).toBe('iOS')
    expect(result.device).toBe('mobile')
  })

  it('parses Edge on Windows', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    )
    expect(result.browser).toBe('Edge')
    expect(result.os).toBe('Windows 10/11')
    expect(result.device).toBe('desktop')
  })

  it('parses iPad as tablet', () => {
    const result = parseUserAgent(
      'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    )
    expect(result.device).toBe('tablet')
  })

  it('returns unknown for null/undefined', () => {
    expect(parseUserAgent(null)).toEqual({ browser: 'Unknown', os: 'Unknown', device: 'unknown' })
    expect(parseUserAgent(undefined)).toEqual({ browser: 'Unknown', os: 'Unknown', device: 'unknown' })
  })

  it('returns unknown for empty string', () => {
    expect(parseUserAgent('')).toEqual({ browser: 'Unknown', os: 'Unknown', device: 'unknown' })
  })
})
