<script setup lang="ts">
interface Props {
  readonly modelValue: string
  readonly rows?: number
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  rows: 4,
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <textarea
    :class="['ui-input', 'ui-textarea', { 'ui-input--invalid': invalid }, props.class]"
    :value="modelValue"
    :rows="rows"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
  />
</template>

<style scoped>
.ui-input {
  width: 100%;
  padding: 8px 10px;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  outline: none;
  transition: border-color 0.12s ease;
}
.ui-input:focus-visible {
  border-color: var(--accent);
  outline: 2px solid var(--accent);
  outline-offset: -1px;
}
.ui-input:disabled {
  opacity: 0.55;
}
.ui-input--invalid {
  border-color: var(--danger);
}
.ui-textarea {
  min-height: 88px;
  resize: vertical;
  line-height: 1.5;
}
@media (prefers-reduced-motion: reduce) {
  .ui-input {
    transition: none;
  }
}
</style>
