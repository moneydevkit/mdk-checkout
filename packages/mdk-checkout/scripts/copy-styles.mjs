import { mkdirSync, copyFileSync } from 'node:fs'
import { resolve } from 'node:path'

const distDir = resolve('dist')

mkdirSync(distDir, { recursive: true })
copyFileSync(resolve('src', 'mdk-styles.css'), resolve(distDir, 'mdk-styles.css'))
