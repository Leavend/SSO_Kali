<script setup lang="ts">
/**
 * SsoGlassFormField — molecule: Label + SsoGlassInput + (hint | error).
 *
 * Glass variant dari SsoFormField. Hanya dipakai di Portal SSO (auth flow).
 *
 * A11y (design.md §10.2):
 *  - <label for=id> selalu dirender visible (bukan hanya placeholder)
 *  - aria-required, aria-invalid, aria-describedby otomatis via SsoGlassInput
 *  - Error message disambungkan via id="{id}-error"
 */

import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import SsoGlassInput from '@/components/atoms/SsoGlassInput.vue'

type InputType = 'text' | 'email' | 'password' | 'tel' | 'url'

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    modelValue: string
    type?: InputType
    placeholder?: string
    hint?: string
    error?: string | null
    disabled?: boolean
    required?: boolean
    autofocus?: boolean
    autocomplete?: string
    inputmode?: 'text' | 'email' | 'numeric' | 'tel' | 'url'
    class?: HTMLAttributes['class']
  }>(),
  {
    type: 'text',
    placeholder: undefined,
    hint: undefined,
    error: null,
    disabled: false,
    required: false,
    autofocus: false,
    autocomplete: undefined,
    inputmode: undefined,
    class: undefined,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const hasError = computed<boolean>(() => Boolean(props.error))
const hintId = computed<string>(() => `${props.id}-hint`)
const ariaDescribedby = computed<string | undefined>(() => {
  if (hasError.value) return undefined // SsoGlassInput uses error id otomatis
  return props.hint ? hintId.value : undefined
})
</script>

<template>
  <div :class="cn('flex flex-col gap-1.5', props.class)">
    <label
      :for="props.id"
      :class="
        cn(
          'font-sans font-semibold text-xs tracking-wide',
          hasError ? 'text-error-700' : 'text-[var(--text-secondary)]',
        )
      "
    >
      {{ props.label }}
      <span v-if="props.required" aria-hidden="true" class="text-error-700">*</span>
    </label>

    <SsoGlassInput
      :id="props.id"
      :type="props.type"
      :model-value="props.modelValue"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      :required="props.required"
      :autofocus="props.autofocus"
      :autocomplete="props.autocomplete"
      :inputmode="props.inputmode"
      :error="props.error"
      :aria-describedby="ariaDescribedby"
      @update:model-value="emit('update:modelValue', $event)"
    >
      <template v-if="$slots.leading" #leading>
        <slot name="leading" />
      </template>
      <template v-if="$slots.trailing" #trailing>
        <slot name="trailing" />
      </template>
    </SsoGlassInput>

    <p
      v-if="!hasError && props.hint"
      :id="hintId"
      class="text-[var(--text-muted)] text-xs leading-relaxed"
    >
      {{ props.hint }}
    </p>
  </div>
</template>
