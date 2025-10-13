import { cp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = join(__dirname, '..')
const source = join(projectRoot, 'src', 'server', 'lightning-entry.cjs')
const destinationDir = join(projectRoot, 'dist', 'server')
const destination = join(destinationDir, 'lightning-entry.cjs')

await cp(source, destination)
