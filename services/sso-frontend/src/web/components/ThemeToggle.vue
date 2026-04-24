<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { Moon, Sun } from 'lucide-vue-next'

type Theme = 'light' | 'dark'

const theme = ref<Theme>('light')
const isDark = computed(() => theme.value === 'dark')

onMounted(() => {
  document.documentElement.setAttribute('data-theme', theme.value)
})

watch(theme, (value) => {
  document.documentElement.setAttribute('data-theme', value)
})

function toggleTheme(): void {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <button
    class="theme-toggle"
    type="button"
    :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
    @click="toggleTheme"
  >
    <Sun v-if="isDark" :size="16" aria-hidden="true" />
    <Moon v-else :size="16" aria-hidden="true" />
  </button>
</template>
