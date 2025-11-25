import { mkdirSync, copyFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const [, , destArg] = process.argv

const __dirname = dirname(fileURLToPath(import.meta.url))
const source = resolve(__dirname, '..', 'src', 'mdk-styles.css')
const destination = destArg ? resolve(destArg) : resolve(process.cwd(), 'dist', 'mdk-styles.css')

mkdirSync(dirname(destination), { recursive: true })
copyFileSync(source, destination)
