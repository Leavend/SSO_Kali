import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const nginxConfig = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8')
const deployWorkflow = readFileSync(resolve(process.cwd(), '../../.github/workflows/deploy-main.yml'), 'utf8')
const sourceRoot = resolve(process.cwd(), 'src')

describe('admin nginx backend proxy contract', () => {
  it('rewrites same-origin admin API calls to the backend admin prefix', () => {
    expect(nginxConfig).toContain('location /api/admin/')
    expect(nginxConfig).toContain('rewrite ^/api/admin/(.*)$ /admin/api/$1 break;')
    expect(nginxConfig).toContain('proxy_pass https://api-sso.timeh.my.id;')
  })

  it('keeps backend admin prefix hidden behind the nginx mapping only', () => {
    expect(nginxConfig).not.toContain('location /admin/api/')
    expect(adminSourceFiles()).not.toContain('/admin/api/')
    expect(adminSourceFiles()).toContain('/api/admin/me')
  })

  it('proxies auth API calls without rewriting the backend route prefix', () => {
    expect(nginxConfig).toContain('location /api/auth/')
    expect(nginxConfig).toContain('proxy_pass https://api-sso.timeh.my.id;')
  })

  it('preserves browser session and request correlation headers upstream', () => {
    expect(nginxConfig).toContain('proxy_set_header Host api-sso.timeh.my.id;')
    expect(nginxConfig).toContain('proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;')
    expect(nginxConfig).toContain('proxy_set_header X-Forwarded-Proto $scheme;')
    expect(nginxConfig).toContain('proxy_set_header Cookie $http_cookie;')
    expect(nginxConfig).toContain('proxy_set_header X-Request-Id $admin_proxy_request_id;')
  })

  it('keeps backend session cookies host-only when passed through the admin origin', () => {
    const apiAdminLocation = locationBlock('/api/admin/')
    const apiAuthLocation = locationBlock('/api/auth/')

    for (const block of [apiAdminLocation, apiAuthLocation]) {
      expect(block).toContain('proxy_pass_header Set-Cookie;')
      expect(block).toContain('proxy_cookie_domain off;')
      expect(block).not.toContain('Domain=.timeh.my.id')
    }
  })

  it('keeps the deploy smoke strict enough to catch SPA fallback responses', () => {
    expect(deployWorkflow).toContain('/api/admin/me')
    expect(deployWorkflow).toContain('expected anonymous /api/admin/me to return 401 JSON')
    expect(deployWorkflow).toContain('^content-type: application/json')
    expect(deployWorkflow).toContain('<!doctype html\\|<html')
    expect(deployWorkflow).toContain('"error"[[:space:]]*:[[:space:]]*"unauthorized"')
  })
})

function locationBlock(path: string): string {
  const pattern = new RegExp(`location ${escapeRegExp(path)} \\{(?<block>[\\s\\S]*?)\\n  \\}`, 'u')
  const match = pattern.exec(nginxConfig)
  expect(match?.groups?.block).toBeDefined()
  return match?.groups?.block ?? ''
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
}

function adminSourceFiles(): string {
  return readSourceFiles(sourceRoot).join('\n')
}

function readSourceFiles(directory: string): readonly string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = resolve(directory, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) return readSourceFiles(path)
    if (path.includes('__tests__')) return []
    if (!/\.(ts|vue)$/u.test(entry)) return []
    return readFileSync(path, 'utf8')
  })
}
