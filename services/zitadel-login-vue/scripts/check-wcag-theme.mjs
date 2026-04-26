#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const css = readFileSync(join(root, 'src/web/styles/main.css'), 'utf8')

const requiredTokens = ['#111827', '#6b7280', '#2563eb', '#ffffff', '#f3f4f6', '#93c5fd']
const missingTokens = requiredTokens.filter((token) => !css.includes(token))

if (missingTokens.length > 0) {
  throw new Error(`Missing WCAG theme token(s): ${missingTokens.join(', ')}`)
}

if (/letter-spacing:\s*-/.test(css)) {
  throw new Error('Negative letter spacing is not allowed')
}

if (/font-size:[^;]*(?:vw|vh|vmin|vmax|clamp)\(/.test(css)) {
  throw new Error('Viewport-scaled font sizes are not allowed')
}

process.stdout.write('ZITADEL Vue login WCAG theme gate passed\n')
