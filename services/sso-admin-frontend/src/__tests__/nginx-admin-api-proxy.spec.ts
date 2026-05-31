import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const nginxConfig = readFileSync(resolve(process.cwd(), 'nginx.conf'), 'utf8')

describe('admin nginx backend proxy contract', () => {
  it('rewrites same-origin admin API calls to the backend admin prefix', () => {
    expect(nginxConfig).toContain('location /api/admin/')
    expect(nginxConfig).toContain('rewrite ^/api/admin/(.*)$ /admin/api/$1 break;')
    expect(nginxConfig).toContain('proxy_pass https://api-sso.timeh.my.id;')
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
})
