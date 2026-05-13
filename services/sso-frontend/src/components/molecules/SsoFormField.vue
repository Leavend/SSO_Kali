<script setup lang="ts">
/**
 * SsoFormField — molecule: Label + Input + hint + error.
 *
 * Mewajibkan `id` + `label` (WCAG 1.3.1 & 4.1.2).
 * Error message terhubung otomatis lewat aria-describedby.
 */

import { computed } from 'vue'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

type InputType = 'text' | 'email' | 'password' | 'tel' | 'url' | 'number'

const props = withDefaults(
  defineProps<{
    id: string
    label: string
    modelValue: string
    type?: InputType
    autocomplete?: string
    placeholder?: string
    hint?: string
    error?: string | null
    disabled?: boolean
    required?: boolean
    autofocus?: boolean
    inputmode?: 'text' | 'email' | 'numeric' | 'tel' | 'url'
    /** Tailwind utility tambahan untuk root container. */
    class?: string
    /** Tailwind utility tambahan untuk input element. */
    inputClass?: string
  }>(),
  {
    type: 'text',
    autocomplete: undefined,
    placeholder: undefined,
    hint: undefined,
    error: null,
    disabled: false,
    required: false,
    autofocus: false,
    inputmode: undefined,
    class: undefined,
    inputClass: undefined,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

const describedById = computed<string | undefined>(() => {
  if (props.error) return `${props.id}-error`
  if (props.hint) return `${props.id}-hint`
  return undefined
})

const hasError = computed<boolean>(() => Boolean(props.error))
</script>

<template>
  <div :class="cn('grid gap-1.5', props.class)">
    <Label :for="props.id" :class="hasError ? 'text-error-700' : ''">
      {{ props.label }}
      <span v-if="props.required" aria-hidden="true" class="text-error-700">*</span>
    </Label>
    <div class="relative">
      <Input
        :id="props.id"
        :model-value="props.modelValue"
        :type="props.type"
        :autocomplete="props.autocomplete"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        :required="props.required"
        :autofocus="props.autofocus"
        :inputmode="props.inputmode"
        :aria-invalid="hasError || undefined"
        :aria-required="props.required || undefined"
        :aria-describedby="describedById"
        :class="cn(hasError ? 'border-error-700 focus-visible:border-error-700 focus-visible:ring-error-700/30' : '', props.inputClass)"
        @update:model-value="emit('update:modelValue', String($event))"
      />
      <slot name="suffix" />
    </div>
    <p
      v-if="hasError"
      :id="`${props.id}-error`"
      role="alert"
      class="text-error-700 text-xs leading-relaxed"
    >
      {{ props.error }}
    </p>
    <p
      v-else-if="props.hint"
      :id="`${props.id}-hint`"
      class="text-muted-foreground text-xs leading-relaxed"
    >
      {{ props.hint }}
    </p>
  </div>
</template>
