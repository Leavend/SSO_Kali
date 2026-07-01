<script setup lang="ts">
export type UiSelectOption = {
  readonly value: string
  readonly label: string
}

interface Props {
  readonly modelValue: string
  readonly options: readonly UiSelectOption[]
  readonly disabled?: boolean
  readonly invalid?: boolean
  readonly class?: string
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  invalid: false,
  class: undefined,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: string): void }>()
</script>

<template>
  <select
    :class="['ui-input', 'ui-select', { 'ui-input--invalid': invalid }, props.class]"
    :value="modelValue"
    :disabled="disabled"
    :aria-invalid="invalid ? 'true' : undefined"
    @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value)"
  >
    <option v-for="option in options" :key="option.value" :value="option.value">
      {{ option.label }}
    </option>
  </select>
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
.ui-input:focus-visible {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-ring);
}
.ui-input:disabled {
  opacity: 0.55;
}
.ui-input--invalid {
  border-color: var(--danger);
}
.ui-select {
  appearance: none;
  padding-right: 32px;
  cursor: pointer;
  background-image: url("data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%234A4A4A' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e");
  background-repeat: no-repeat;
  background-position: right 10px center;
  background-size: 14px;
}
@media (prefers-reduced-motion: reduce) {
  .ui-input {
    transition: none;
  }
}
</style>
