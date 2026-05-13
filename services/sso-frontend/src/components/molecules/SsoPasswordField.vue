<script setup lang="ts">
/**
 * SsoPasswordField — molecule: password input dengan show/hide toggle.
 *
 * Toggle visibility menggunakan button + aria-pressed.
 */

import { computed, ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import SsoFormField from './SsoFormField.vue'

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    modelValue: string
    autocomplete?: 'current-password' | 'new-password' | 'off'
    hint?: string
    error?: string | null
    disabled?: boolean
    required?: boolean
  }>(),
  {
    autocomplete: 'current-password',
    hint: undefined,
    error: null,
    disabled: false,
    required: true,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const revealed = ref<boolean>(false)
const inputType = computed<'password' | 'text'>(() => (revealed.value ? 'text' : 'password'))
const toggleLabel = computed<string>(() => (revealed.value ? 'Sembunyikan password' : 'Tampilkan password'))

function toggle(): void {
  revealed.value = !revealed.value
}
</script>

<template>
  <SsoFormField
    :id="props.id"
    :label="props.label"
    :model-value="props.modelValue"
    :type="inputType"
    :autocomplete="props.autocomplete"
    :hint="props.hint"
    :error="props.error"
    :disabled="props.disabled"
    :required="props.required"
    input-class="pr-10"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <template #suffix>
      <button
        type="button"
        :aria-label="toggleLabel"
        :aria-pressed="revealed"
        :disabled="props.disabled"
        class="text-muted-foreground hover:text-foreground focus-visible:ring-brand-500/30 absolute inset-y-0 right-2 my-auto inline-flex size-7 items-center justify-center rounded-md transition-colors focus-visible:ring-[3px] focus-visible:outline-none disabled:opacity-40"
        @click="toggle"
      >
        <EyeOff v-if="revealed" class="size-4" aria-hidden="true" />
        <Eye v-else class="size-4" aria-hidden="true" />
      </button>
    </template>
  </SsoFormField>
</template>
