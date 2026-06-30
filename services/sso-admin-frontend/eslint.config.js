import { globalIgnores } from 'eslint/config'
import tsParser from '@typescript-eslint/parser'
import pluginVue from 'eslint-plugin-vue'
import vueParser from 'vue-eslint-parser'
import skipFormatting from 'eslint-config-prettier/flat'

export default [
  {
    name: 'app/files-to-lint',
    files: ['app/**/*.vue'],
    languageOptions: {
      parser: vueParser,
      parserOptions: {
        parser: tsParser,
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },

  globalIgnores(['**/dist/**', '**/dist-ssr/**', '**/coverage/**']),

  ...pluginVue.configs['flat/essential'],

  // Nuxt file-routing convention: pages and layouts are single-word by design
  // (e.g. pages/index.vue, layouts/admin.vue). Disabling multi-word rule here
  // is standard Nuxt practice — the file names are not component registration
  // names, they are route/layout selectors.
  {
    name: 'nuxt/pages-layouts-naming',
    files: ['app/pages/**/*.vue', 'app/layouts/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },

  skipFormatting,
]
