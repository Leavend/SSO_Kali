<script setup lang="ts">
interface Props {
  readonly modelValue: boolean
  readonly label: string
  readonly disabled?: boolean
}

withDefaults(defineProps<Props>(), {
  disabled: false,
})

const emit = defineEmits<{ (event: 'update:modelValue', value: boolean): void }>()
</script>

<template>
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
    <span class="ui-switch__thumb" aria-hidden="true" />
    <span class="ui-switch__label">{{ label }}</span>
  </button>
</template>
