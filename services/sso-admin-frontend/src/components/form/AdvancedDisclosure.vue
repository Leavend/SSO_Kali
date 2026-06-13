<script setup lang="ts">
import { ref } from 'vue'
import { ChevronDown, ChevronRight } from 'lucide-vue-next'

interface Props {
  readonly title?: string
}

withDefaults(defineProps<Props>(), {
  title: 'ADVANCED CONFIGURATION',
})

const isOpen = ref(false)

function toggle() {
  isOpen.value = !isOpen.value
}
</script>

<template>
  <div class="border border-border rounded-lg overflow-hidden bg-card/30">
    <button
      type="button"
      class="w-full flex items-center justify-between px-4 py-3 text-xs font-semibold text-muted-foreground hover:bg-muted/50 transition-colors uppercase tracking-wider text-left"
      @click="toggle"
    >
      <span>{{ title }}</span>
      <component :is="isOpen ? ChevronDown : ChevronRight" :size="16" />
    </button>
    <div v-show="isOpen" class="px-4 py-4 border-t border-border space-y-4">
      <slot />
    </div>
  </div>
</template>
