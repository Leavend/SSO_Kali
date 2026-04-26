#!/usr/bin/env node

import { spawn } from 'node:child_process'

const port = String(3910 + Math.floor(Math.random() * 1000))
const server = spawn(process.execPath, ['dist/server/server/index.js'], {
  env: {
    ...process.env,
    LOGIN_COOKIE_SECRET: 'test-zitadel-login-vue-cookie-secret-32',
    NODE_ENV: 'test',
    PORT: port,
    PUBLIC_BASE_PATH: '/ui/v2/login-vue',
    SECURE_COOKIES: 'false',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

try {
  await waitForHealth(port)
  await assertOk(`http://127.0.0.1:${port}/ui/v2/login-vue/login`)
  process.stdout.write('ZITADEL Vue login production smoke passed\n')
} finally {
  server.kill('SIGTERM')
}

async function waitForHealth(portValue) {
  for (let index = 0; index < 40; index += 1) {
    if (await isOk(`http://127.0.0.1:${portValue}/ui/v2/login-vue/healthz`)) return
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  throw new Error('Timed out waiting for healthz')
}

async function assertOk(url) {
  if (!(await isOk(url))) throw new Error(`Smoke request failed: ${url}`)
}

async function isOk(url) {
  try {
    const response = await fetch(url)
    return response.ok
  } catch {
    return false
  }
}
