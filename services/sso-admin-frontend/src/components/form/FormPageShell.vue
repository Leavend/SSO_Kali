<script setup lang="ts">
import { ChevronRight } from 'lucide-vue-next'
import UiButton from '@/components/ui/UiButton.vue'

interface Props {
  readonly parentLabel: string
  readonly activeLabel: string
  readonly title: string
  readonly description?: string
  readonly submitLabel: string
  readonly cancelLabel?: string
  readonly isSubmitting?: boolean
  readonly isInvalid?: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (event: 'submit'): void
  (event: 'cancel'): void
}>()
</script>

<template>
  <div class="form-page-shell max-w-form mx-auto px-4 md:px-6 py-8">
    <!-- Breadcrumbs -->
    <nav class="mb-4" aria-label="Breadcrumb">
      <ol class="flex items-center gap-2 text-xs text-muted-foreground">
        <li>{{ parentLabel }}</li>
        <li><ChevronRight :size="12" class="opacity-50" /></li>
        <li class="font-medium text-foreground">{{ activeLabel }}</li>
      </ol>
    </nav>

    <!-- Header Section -->
    <div class="mb-8">
      <h1 class="text-2xl font-bold tracking-tight text-foreground">{{ title }}</h1>
      <p v-if="description" class="text-muted-foreground mt-1 text-sm">
        {{ description }}
      </p>
    </div>

    <!-- Main Form Content -->
    <div class="space-y-8">
      <slot />
    </div>

    <!-- Actions Footer -->
    <footer class="pt-6 border-t border-border flex items-center justify-between mt-8">
      <slot name="footer-left">
        <UiButton
          variant="secondary"
          type="button"
          :disabled="isSubmitting"
          @click="emit('cancel')"
        >
          {{ cancelLabel || 'Batal' }}
        </UiButton>
      </slot>
      <slot name="footer-right">
        <UiButton
          variant="primary"
          type="button"
          :disabled="isInvalid || isSubmitting"
          @click="emit('submit')"
        >
          {{ isSubmitting ? 'Memproses...' : submitLabel }}
        </UiButton>
      </slot>
    </footer>
  </div>
</template>
