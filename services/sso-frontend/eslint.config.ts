import { globalIgnores } from 'eslint/config'
import { defineConfigWithVueTs, vueTsConfigs } from '@vue/eslint-config-typescript'
import pluginVue from 'eslint-plugin-vue'
import pluginVitest from '@vitest/eslint-plugin'
import pluginOxlint from 'eslint-plugin-oxlint'
import skipFormatting from 'eslint-config-prettier/flat'

export default defineConfigWithVueTs(
  {
    name: 'sso-frontend/files',
    files: ['src/**/*.{vue,ts,mts}', '*.ts'],
  },
  globalIgnores([
    '.next/**',
    '.codex-temp/**',
    'out/**',
    'build/**',
    'dist/**',
    'coverage/**',
    'node_modules/**',
    'test-results/**',
    'e2e/**',
    'next-env.d.ts',
  ]),
  ...pluginVue.configs['flat/essential'],
  vueTsConfigs.recommended,
  {
    ...pluginVitest.configs.recommended,
    files: ['src/**/*.test.ts', 'src/**/*.spec.ts'],
  },
  {
    name: 'sso-frontend/ui-primitives',
    files: ['src/components/ui/**/*.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  ...pluginOxlint.buildFromOxlintConfigFile('.oxlintrc.json'),
  skipFormatting,
)
