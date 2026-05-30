import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const currentFilePath = fileURLToPath(import.meta.url)
const serviceRootPath = path.resolve(path.dirname(currentFilePath), '..')
const sourceRootPath = path.join(serviceRootPath, 'src')
const invalidSourceFilePaths = []

async function collectInvalidSourceFilePaths(directoryPath) {
  const directoryEntries = await readdir(directoryPath, { withFileTypes: true })

  for (const directoryEntry of directoryEntries) {
    const entryPath = path.join(directoryPath, directoryEntry.name)

    if (directoryEntry.isDirectory()) {
      await collectInvalidSourceFilePaths(entryPath)
      continue
    }

    if (/\s/.test(directoryEntry.name)) {
      invalidSourceFilePaths.push(path.relative(serviceRootPath, entryPath))
    }
  }
}

await collectInvalidSourceFilePaths(sourceRootPath)

if (invalidSourceFilePaths.length > 0) {
  console.error('Source filenames must not contain whitespace:')
  for (const invalidSourceFilePath of invalidSourceFilePaths) {
    console.error(`- ${invalidSourceFilePath}`)
  }
  process.exit(1)
}
