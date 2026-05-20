<script setup lang="ts">
/**
 * RegisterEmailStep — molecule rendering the email pill for the multi-step
 * registration flow. Extracted from RegisterPage.vue so the page stays an
 * orchestrator (standart-quality-code §1.1) and so each step is independently
 * mountable in tests.
 *
 * a11y:
 *   - Pill action button mirrors `valid` state via `aria-hidden` + tabindex
 *     so SR users only land on it once advancement is allowed (WCAG 2.4.3).
 */

import { ArrowRight, Mail } from 'lucide-vue-next'
import SsoGlassInput from '@/components/atoms/SsoGlassInput.vue'
import { cn } from '@/lib/utils'

interface Props {
  modelValue: string
  valid: boolean
  pending: boolean
  error?: string | null
}
const props = withDefaults(defineProps<Props>(), { error: null })

interface Emits {
  (e: 'update:modelValue', value: string): void
  (e: 'advance'): void
  (e: 'enter', event: KeyboardEvent): void
}
const emit = defineEmits<Emits>()
</script>

<template>
  <div class="flex flex-col items-stretch gap-3">
    <SsoGlassInput
      id="register-email"
      :model-value="props.modelValue"
      type="email"
      autocomplete="email"
      inputmode="email"
      placeholder="Email"
      :required="true"
      :autofocus="true"
      :disabled="props.pending"
      :error="props.error ?? null"
      @update:model-value="(value: string) => emit('update:modelValue', value)"
      @keydown="(event: KeyboardEvent) => emit('enter', event)"
    >
      <template #leading>
        <Mail class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </template>
      <template #trailing>
        <button
          type="button"
          aria-label="Lanjut ke step password"
          :aria-hidden="!props.valid"
          :tabindex="props.valid ? 0 : -1"
          :disabled="!props.valid"
          :class="cn('sso-pill-action', props.valid && 'sso-pill-action--active')"
          @click="emit('advance')"
        >
          <ArrowRight class="size-4" aria-hidden="true" />
        </button>
      </template>
    </SsoGlassInput>
  </div>
</template>
