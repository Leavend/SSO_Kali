<script setup lang="ts">
interface Props {
  readonly modelValue: boolean
  readonly label: string
  readonly disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()

function handleLabelClick(): void {
  if (!props.disabled) emit('update:modelValue', !props.modelValue)
}
</script>

<template>
  <div class="ui-switch-wrapper" :class="{ 'ui-switch-wrapper--disabled': disabled }">
    <button
      class="ui-switch"
      :class="{ 'ui-switch--checked': modelValue }"
      type="button"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      @click="emit('update:modelValue', !modelValue)"
    >
      <span class="ui-switch__track" aria-hidden="true">
        <span class="ui-switch__thumb" />
      </span>
    </button>
    <span class="ui-switch__label" @click="handleLabelClick()">
      {{ label }}
    </span>
  </div>
</template>

<style scoped>
.ui-switch-wrapper {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  cursor: pointer;
}
.ui-switch-wrapper--disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.ui-switch {
  display: inline-flex;
  padding: 0;
  background: transparent;
  border: 0;
  cursor: pointer;
  flex-shrink: 0;
}
.ui-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.ui-switch__track {
  display: flex;
  align-items: center;
  width: 34px;
  height: 18px;
  padding: 2px;
  background: var(--muted-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-full);
  transition:
    background 0.14s ease,
    border-color 0.14s ease;
}
.ui-switch__thumb {
  width: 12px;
  height: 12px;
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-full);
  transition: transform 0.14s ease;
}
.ui-switch--checked .ui-switch__track {
  background: var(--accent);
  border-color: var(--accent);
}
.ui-switch--checked .ui-switch__thumb {
  border-color: var(--accent);
  transform: translateX(16px);
}
.ui-switch__label {
  font: 500 0.8125rem/1.2 var(--font-sans);
  color: var(--fg);
  user-select: none;
}
@media (prefers-reduced-motion: reduce) {
  .ui-switch__track,
  .ui-switch__thumb {
    transition: none;
  }
}
</style>
