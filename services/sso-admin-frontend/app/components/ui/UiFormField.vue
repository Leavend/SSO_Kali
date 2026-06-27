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
  <div class="ui-field">
    <label class="ui-field__label" :for="id" :data-required="required ? 'true' : undefined">
      {{ label }}
      <span v-if="required" aria-hidden="true">*</span>
    </label>
    <slot />
    <p v-if="hint" :id="`${id}-hint`" class="ui-field__hint">{{ hint }}</p>
    <p v-if="error" :id="`${id}-error`" class="ui-field__error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.ui-field {
  display: grid;
  gap: 6px;
  min-width: 0;
  width: 100%;
}
.ui-field__label {
  font: 600 0.75rem/1.2 var(--font-sans);
  color: var(--fg);
}
.ui-field__label span {
  color: var(--danger);
}
.ui-field__hint {
  margin: 0;
  font: 400 0.6875rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.ui-field__error {
  margin: 0;
  font: 500 0.6875rem/1.4 var(--font-sans);
  color: var(--danger);
}
</style>
