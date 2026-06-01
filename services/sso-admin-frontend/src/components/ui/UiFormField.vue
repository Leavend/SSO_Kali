<script setup lang="ts">
interface Props {
  readonly id: string
  readonly label: string
  readonly hint?: string
  readonly error?: string
  readonly required?: boolean
}

withDefaults(defineProps<Props>(), {
  hint: undefined,
  error: undefined,
  required: false,
})
</script>

<template>
  <div class="ui-form-field">
    <label class="ui-form-field__label" :for="id" :data-required="required ? 'true' : undefined">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="hint" class="ui-form-field__hint">{{ hint }}</p>
    <p v-if="error" class="ui-form-field__error" role="alert">{{ error }}</p>
  </div>
</template>
