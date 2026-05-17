<script setup lang="ts">
/**
 * SsoGlassInput — atom: text/email/password input dengan Liquid Glass shell.
 *
 * v2 Liquid Glass × Vibrant edition:
 *   Adds `pill` prop (rounded-full + conic shimmer border, à la EaseMize
 *   reference) while preserving every existing behaviour and ARIA wiring.
 *
 * A11y (design.md §10.2):
 *  - aria-invalid otomatis saat ada error
 *  - aria-describedby terhubung ke id error
 *  - role="alert" + aria-live="assertive" pada error message
 *  - Password toggle: aria-label + aria-pressed
 *  - Touch target ≥44px (h-12 = 48px)
 *  - autocomplete dipropagasi sebagaimana adanya (WCAG 1.3.5)
 */

import type { HTMLAttributes } from 'vue'
import { computed, ref } from 'vue'
import { AlertCircle, Eye, EyeOff } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

type InputType = 'text' | 'email' | 'password' | 'tel' | 'url'

const props = withDefaults(
  defineProps<{
    id: string
    type?: InputType
    modelValue: string
    placeholder?: string
    disabled?: boolean
    required?: boolean
    autofocus?: boolean
    autocomplete?: string
    inputmode?: 'text' | 'email' | 'numeric' | 'tel' | 'url'
    /** Pesan error — bila ada, render dengan role="alert". */
    error?: string | null
    /** id eksternal untuk aria-describedby (mis. hint). */
    ariaDescribedby?: string
    /**
     * Pill shape (rounded-full) dengan conic shimmer border.
     * Default true di Liquid Glass × Vibrant edition.
     */
    pill?: boolean
    /** Tailwind utility tambahan untuk container. */
    class?: HTMLAttributes['class']
  }>(),
  {
    type: 'text',
    placeholder: undefined,
    disabled: false,
    required: false,
    autofocus: false,
    autocomplete: undefined,
    inputmode: undefined,
    error: null,
    ariaDescribedby: undefined,
    pill: true,
    class: undefined,
  },
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: string): void
}>()

// Password reveal state
const revealed = ref<boolean>(false)
const isPassword = computed<boolean>(() => props.type === 'password')
const effectiveType = computed<InputType>(() => {
  if (!isPassword.value) return props.type
  return revealed.value ? 'text' : 'password'
})
const toggleLabel = computed<string>(() =>
  revealed.value ? 'Sembunyikan password' : 'Tampilkan password',
)

const hasError = computed<boolean>(() => Boolean(props.error))
const errorId = computed<string>(() => `${props.id}-error`)
const describedBy = computed<string | undefined>(() => {
  if (hasError.value) return errorId.value
  return props.ariaDescribedby
})

function onInput(event: Event): void {
  const target = event.target as HTMLInputElement
  emit('update:modelValue', target.value)
}

function toggleReveal(): void {
  revealed.value = !revealed.value
}
</script>

<template>
  <div :class="cn('w-full', props.class)">
    <div
      :class="
        cn(
          // Pill shape adds vibrant Liquid Glass surface.
          props.pill && 'sso-glass-pill',
          'relative flex items-center gap-2 px-5 h-12 border',
          props.pill
            ? 'rounded-[var(--radius-glass-pill)]'
            : 'rounded-[var(--radius-glass-xl)] backdrop-blur-[var(--glass-blur-sm)] bg-[var(--glass-bg-primary)] shadow-[var(--shadow-glass-sm)]',
          'transition-all duration-[var(--duration-normal)] ease-[var(--ease-smooth)]',
          // Default border (only when not pill — pill draws via ::before)
          !props.pill && !hasError && 'border-[var(--glass-border-subtle)]',
          props.pill && 'border-transparent',
          // Focus-within: brand glass focus ring
          !hasError &&
            'focus-within:shadow-[var(--ring-glass-focus)] focus-within:bg-[var(--glass-bg-elevated)]',
          !hasError && !props.pill && 'focus-within:border-[var(--glass-border-brand)]',
          // Error
          hasError &&
            'border-[var(--glass-border-error)] bg-[color-mix(in_oklch,var(--color-error-50)_40%,transparent)]',
          // Disabled
          props.disabled && 'opacity-40 cursor-not-allowed',
        )
      "
    >
      <slot name="leading" />

      <input
        :id="props.id"
        :type="effectiveType"
        :value="props.modelValue"
        :placeholder="props.placeholder"
        :disabled="props.disabled"
        :required="props.required"
        :autofocus="props.autofocus"
        :autocomplete="props.autocomplete"
        :inputmode="props.inputmode"
        :aria-invalid="hasError || undefined"
        :aria-required="props.required || undefined"
        :aria-describedby="describedBy"
        :class="
          cn(
            'relative z-[2] flex-1 h-full bg-transparent text-sm font-sans',
            'text-[var(--text-primary)] placeholder:text-[var(--text-muted)]',
            'focus:outline-none disabled:cursor-not-allowed',
          )
        "
        @input="onInput"
      />

      <button
        v-if="isPassword"
        type="button"
        :aria-label="toggleLabel"
        :aria-pressed="revealed"
        :disabled="props.disabled"
        class="text-[var(--text-muted)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:shadow-[var(--ring-glass-focus)] relative z-[2] inline-flex size-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-40"
        @click="toggleReveal"
      >
        <EyeOff v-if="revealed" class="size-4" aria-hidden="true" />
        <Eye v-else class="size-4" aria-hidden="true" />
      </button>

      <slot name="trailing" />
    </div>

    <Transition
      enter-active-class="animate-in fade-in-0 slide-in-from-top-1 duration-[var(--duration-normal)]"
      leave-active-class="animate-out fade-out-0 slide-out-to-top-1 duration-[var(--duration-fast)]"
    >
      <p
        v-if="hasError"
        :id="errorId"
        role="alert"
        aria-live="assertive"
        class="mt-1.5 flex items-center gap-1.5 text-error-700 text-sm font-medium leading-relaxed"
      >
        <AlertCircle class="size-4 shrink-0" aria-hidden="true" />
        <span>{{ props.error }}</span>
      </p>
    </Transition>
  </div>
</template>
