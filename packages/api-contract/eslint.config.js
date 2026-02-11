import { FlatCompat } from '@eslint/eslintrc'
import js from '@eslint/js'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const compat = new FlatCompat({
  baseDirectory: __dirname,
  recommendedConfig: js.configs.recommended,
  allConfig: js.configs.all
})

export default [
  {
    ignores: ['dist', 'node_modules']
  },
  ...compat.config({
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint'],
    extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
    parserOptions: {
      ecmaVersion: 2022,
      sourceType: 'module'
    },
    env: {
      node: true
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'off'
    }
  })
]
