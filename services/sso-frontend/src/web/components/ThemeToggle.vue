<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'
import { AUTH_SHELL, getNextTheme, normalizeTheme } from '@parent-ui/auth-shell.mjs'
import type { Theme } from '@parent-ui/auth-shell.mjs'

const theme = ref<Theme>(AUTH_SHELL.theme.defaultTheme)
const isDark = computed(() => theme.value === 'dark')

onMounted(() => {
  applyTheme(theme.value)
})

watch(theme, (value) => {
  applyTheme(value)
})

function toggleTheme(): void {
  theme.value = getNextTheme(theme.value)
}

function applyTheme(value: Theme): void {
  const normalized = normalizeTheme(value)
  document.documentElement.setAttribute(AUTH_SHELL.theme.attribute, normalized)
  document.documentElement.classList.toggle(AUTH_SHELL.theme.darkClass, normalized === 'dark')
}
</script>

<template>
  <button
    :id="AUTH_SHELL.theme.toggleId"
    class="theme-toggle"
    type="button"
    :aria-label="isDark ? AUTH_SHELL.theme.lightLabel : AUTH_SHELL.theme.darkLabel"
    @click="toggleTheme"
  >
    <Sun v-if="isDark" :size="16" aria-hidden="true" />
    <Moon v-else :size="16" aria-hidden="true" />
  </button>
</template>
