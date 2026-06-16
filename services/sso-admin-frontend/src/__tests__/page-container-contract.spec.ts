import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const srcDir = join(process.cwd(), 'src')
const featuresDir = join(srcDir, 'features')
const pageContainerClasses = ['max-w-page', 'mx-auto', 'px-4', 'md:px-6', 'py-8']
const formContainerClasses = ['max-w-form', 'mx-auto', 'px-4', 'md:px-6', 'py-8']

function collectPageFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry)
    if (statSync(fullPath).isDirectory()) {
      return collectPageFiles(fullPath)
    }

    return fullPath.endsWith('Page.vue') ? [fullPath] : []
  })
}

function readSource(path: string): string {
  return readFileSync(path, 'utf8')
}

function getRootTag(source: string): string {
  return source.match(/<template>\s*<([A-Z][\w-]*|[a-z][\w-]*)\b/s)?.[1] ?? ''
}

describe('admin page container contract', () => {
  it('keeps route pages inside the standard centered page container', () => {
    const pages = collectPageFiles(featuresDir)
    const pagesMissingContainer = pages.filter((page) => {
      const source = readSource(page)

      if (getRootTag(source) === 'FormPageShell') {
        return false
      }

      const rootSectionClasses =
        source.match(/<template>\s*<section\b[^>]*\bclass="([^"]+)"/s)?.[1] ?? ''

      return !pageContainerClasses.every((className) => rootSectionClasses.includes(className))
    })

    expect(pagesMissingContainer).toEqual([])
  })

  it('keeps form pages centered with responsive horizontal padding', () => {
    const source = readSource(join(srcDir, 'components/form/FormPageShell.vue'))
    const shellClasses = source.match(/<div\s+class="([^"]*form-page-shell[^"]*)"/)?.[1] ?? ''

    expect(formContainerClasses.every((className) => shellClasses.includes(className))).toBe(true)
  })
})
