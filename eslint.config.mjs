import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.nuxt/**',
      '**/.output/**',
      '**/.vitepress/cache/**',
      '**/.turbo/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: {
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        tsconfigRootDir: __dirname,
      },
    },
  },
  {
    files: ['**/*.{ts,tsx,vue}'],
    languageOptions: {
      globals: {
        // Browser built-ins used in package components (not a Nuxt app, no auto-import of globals)
        URLSearchParams: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        BeforeUnloadEvent: 'readonly',
        DragEvent: 'readonly',
        KeyboardEvent: 'readonly',
        MouseEvent: 'readonly',
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        File: 'readonly',
        FileList: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLElement: 'readonly',
        URL: 'readonly',
        NodeFilter: 'readonly',
        Element: 'readonly',
        structuredClone: 'readonly',
        localStorage: 'readonly',
        // Nuxt auto-imports used in package components
        useRuntimeConfig: 'readonly',
        useRequestURL: 'readonly',
        $fetch: 'readonly',
        useConfirmStore: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // Nuxt pages can be single-word (index, login, etc.) and use compile-time macros
    // (definePageMeta, useHead) that are auto-imported — not real undefined globals.
    files: ['**/pages/**/*.vue', '**/layouts/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-undef': 'off',
    },
  },
  {
    // Vue 3 dynamic slot syntax (#['slot.name']) uses [ and ] in attribute position,
    // which the HTML parser flags as unexpected. Allow it project-wide since dot-notation
    // slot names (field.key, field.key.subslot) are used throughout MapoForm.
    files: ['**/*.vue'],
    rules: {
      'vue/no-parsing-error': ['error', { 'unexpected-character-in-attribute-name': false }],
    },
  },
)
