import { spawn } from 'node:child_process'

const port = String(3307 + Math.floor(Math.random() * 1000))
const baseUrl = `http://127.0.0.1:${port}`
const child = spawn('node', ['dist/server/server/index.js'], {
  env: {
    ...process.env,
    NODE_ENV: 'production',
    PORT: port,
    SESSION_ENCRYPTION_SECRET: process.env.SESSION_ENCRYPTION_SECRET ?? 'smoke-secret-with-more-than-32-characters',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})

const logs = []
child.stdout.on('data', (chunk) => logs.push(String(chunk)))
child.stderr.on('data', (chunk) => logs.push(String(chunk)))

try {
  await waitForHealth()
  await assertSpaFallback()
  console.log('[sso-frontend-smoke][PASS] built BFF serves /healthz and SPA fallback')
} finally {
  child.kill('SIGTERM')
}

async function waitForHealth() {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`BFF exited early with code ${child.exitCode}\n${logs.join('')}`)
    }

    try {
      const response = await fetch(`${baseUrl}/healthz`)
      const body = await response.text()
      if (response.ok && body.trim() === 'ok') return
    } catch {
      await sleep(150)
    }
  }

  throw new Error(`Timed out waiting for /healthz\n${logs.join('')}`)
}

async function assertSpaFallback() {
  const response = await fetch(`${baseUrl}/dashboard`)
  const body = await response.text()

  if (!response.ok || !body.includes('<div id="app">')) {
    throw new Error(`SPA fallback failed with HTTP ${response.status}`)
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
