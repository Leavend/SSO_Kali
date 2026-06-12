<script setup lang="ts">
import { Moon, Sun } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useThemeStore } from '@/stores/theme.store'
import { useI18n } from '@/composables/useI18n'

defineProps<{
  class?: string
}>()

const theme = useThemeStore()
const { t } = useI18n()
</script>

<template>
  <Button
    variant="ghost"
    size="icon"
    :aria-label="t('auth.theme_toggle')"
    :class="
      cn(
        'portal-nav-pill relative isolate overflow-hidden rounded-full',
        $props.class,
      )
    "
    @click="theme.toggle"
  >
    <Sun v-if="theme.mode === 'dark'" class="size-4" />
    <Moon v-else class="size-4" />
  </Button>
</template>
