<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { useTheme } from './useTheme'

const { isDark, toggleTheme } = useTheme()
</script>

<template>
  <button
    class="ui-icon-button"
    type="button"
    :aria-label="isDark ? 'Use light theme' : 'Use dark theme'"
    @click="toggleTheme"
  >
    <Sun v-if="isDark" :size="18" aria-hidden="true" />
    <Moon v-else :size="18" aria-hidden="true" />
  </button>
</template>
