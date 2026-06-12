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
      <span class="ui-switch__thumb" aria-hidden="true" />
    </button>
    <span
      class="ui-switch__label"
      @click="!disabled && emit('update:modelValue', !modelValue)"
    >
      {{ label }}
    </span>
  </div>
</template>
