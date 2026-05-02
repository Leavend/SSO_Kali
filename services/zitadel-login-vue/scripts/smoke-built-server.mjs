#!/usr/bin/env node

import { spawn } from 'node:child_process'

const port = String(3910 + Math.floor(Math.random() * 1000))
const server = spawn(process.execPath, ['dist/server/server/index.js'], {
  env: {
    ...process.env,
    LOGIN_COOKIE_SECRET: 'test-zitadel-login-vue-cookie-secret-32',
    NODE_ENV: 'test',
    PORT: port,
    PUBLIC_BASE_PATH: '/ui/v2/auth',
    SECURE_COOKIES: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitForHealth(port)
  await assertOk(`http://127.0.0.1:${port}/ui/v2/auth/login`)
  await assertRedirect(
    `http://127.0.0.1:${port}/ui/v2/login-vue/otp/time-based`,
    '/ui/v2/auth/otp/time-based',
  )
  process.stdout.write('ZITADEL Vue login production smoke passed\n')
} finally {
  server.kill('SIGTERM')
}

async function waitForHealth(portValue) {
  for (let index = 0; index < 40; index += 1) {
    if (await isOk(`http://127.0.0.1:${portValue}/ui/v2/auth/healthz`)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for healthz')
}

async function assertOk(url) {
  if (!(await isOk(url))) throw new Error(`Smoke request failed: ${url}`)
}

async function assertRedirect(url, expectedPath) {
  const response = await fetch(url, { redirect: 'manual' })
  const location = response.headers.get('location') ?? ''
  if (response.status !== 308 || !location.endsWith(expectedPath)) {
    throw new Error(`Expected ${url} to 308 redirect to ${expectedPath}; got ${response.status} ${location}`)
  }
}

async function isOk(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}
