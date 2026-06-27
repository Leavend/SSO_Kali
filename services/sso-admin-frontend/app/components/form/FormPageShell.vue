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

withDefaults(defineProps<Props>(), {
  description: undefined,
  cancelLabel: 'Cancel',
  isSubmitting: false,
  isInvalid: false,
})

const emit = defineEmits<{ (event: 'submit'): void; (event: 'cancel'): void }>()
</script>

<template>
  <div class="form-shell">
    <nav class="form-shell__breadcrumb" aria-label="Breadcrumb">
      <ol>
        <li>{{ parentLabel }}</li>
        <li aria-hidden="true"><ChevronRight :size="12" /></li>
        <li class="form-shell__breadcrumb-active">{{ activeLabel }}</li>
      </ol>
    </nav>

    <header class="form-shell__header">
      <h1 class="form-shell__title">{{ title }}</h1>
      <p v-if="description" class="form-shell__desc">{{ description }}</p>
    </header>

    <div class="form-shell__body">
      <slot />
    </div>

    <footer class="form-shell__footer">
      <div class="form-shell__footer-left">
        <slot name="footer-left">
          <UiButton
            variant="secondary"
            type="button"
            data-testid="form-cancel"
            :disabled="isSubmitting"
            @click="emit('cancel')"
          >
            {{ cancelLabel }}
          </UiButton>
        </slot>
      </div>
      <div class="form-shell__footer-right">
        <slot name="footer-right">
          <UiButton
            variant="primary"
            type="button"
            data-testid="form-submit"
            :disabled="isInvalid || isSubmitting"
            :aria-busy="isSubmitting ? 'true' : undefined"
            @click="emit('submit')"
          >
            {{ submitLabel }}
          </UiButton>
        </slot>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.form-shell {
  width: min(48rem, 100%);
  margin: 0 auto;
  padding: 24px;
}
.form-shell__breadcrumb ol {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 0 16px;
  padding: 0;
  list-style: none;
  font: 500 0.6875rem/1 var(--font-sans);
  color: var(--fg-3);
}
.form-shell__breadcrumb-active {
  color: var(--fg);
}
.form-shell__header {
  margin-bottom: 8px;
}
.form-shell__title {
  margin: 0;
  font: 600 1.375rem/1.2 var(--font-sans);
  letter-spacing: -0.02em;
  color: var(--fg);
}
.form-shell__desc {
  margin: 6px 0 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.form-shell__body {
  margin-top: 8px;
}
.form-shell__footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 24px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
}
</style>
