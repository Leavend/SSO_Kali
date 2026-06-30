<script setup lang="ts">
interface Props {
  readonly modelValue: string
  readonly type?: string
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  type: 'text',
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <input
    :class="['ui-input', { 'ui-input--invalid': invalid }, props.class]"
    :type="type"
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
  />
</template>

<style scoped>
.ui-input {
  width: 100%;
  min-height: var(--ctl-h);
  padding: 0 10px;
  color: var(--fg);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-sm);
  outline: none;
  transition: border-color 0.12s ease;
}
.ui-input::placeholder {
  color: var(--fg-3);
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
@media (prefers-reduced-motion: reduce) {
  .ui-input {
    transition: none;
  }
}
</style>
