<script setup lang="ts">
/**
 * RegisterPasswordStep — molecule rendering the password pill for the
 * registration flow. Owns its own back-button + policy hint copy so the
 * orchestrator (RegisterPage.vue) stays under the file-size hard limit
 * (standart-quality-code §2.1).
 *
 * a11y:
 *   - Hint paragraph uses `aria-live="polite"` so SR users hear the policy
 *     gap update as they type, without preempting current focus.
 *   - Back button is a real <button>, not a div-with-handler, so keyboard
 *     and SR users can return to step 1 (TDD-standart-prod §1.2).
 */

import { ArrowLeft, ArrowRight, Lock } from 'lucide-vue-next'
import SsoGlassInput from '@/components/atoms/SsoGlassInput.vue'
import { cn } from '@/lib/utils'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
interface Props {
  modelValue: string
  valid: boolean
  pending: boolean
  hints: readonly string[]
  error?: string | null
}
const props = withDefaults(defineProps<Props>(), { error: null })

interface Emits {
  (e: 'update:modelValue', value: string): void
  (e: 'advance'): void
  (e: 'back'): void
  (e: 'enter', event: KeyboardEvent): void
}
const emit = defineEmits<Emits>()
</script>

<template>
  <div class="flex flex-col items-stretch gap-3">
    <SsoGlassInput
      id="register-password"
      :model-value="props.modelValue"
      type="password"
      autocomplete="new-password"
      :placeholder="t('portal.security.new_password')"
      :required="true"
      :autofocus="true"
      :disabled="props.pending"
      :error="props.error ?? null"
      @update:model-value="(value: string) => emit('update:modelValue', value)"
      @keydown="(event: KeyboardEvent) => emit('enter', event)"
    >
      <template #leading>
        <Lock class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </template>
      <template #trailing>
        <button
          type="button"
          :aria-label="t('auth.register.continue_confirm')"
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

    <p
      v-if="props.hints.length > 0"
      class="text-center text-xs leading-relaxed text-muted-foreground"
      aria-live="polite"
    >
      {{ t('auth.register.missing_requirements', { items: props.hints.join(', ') }) }}
    </p>

    <button
      type="button"
      class="mt-1 inline-flex items-center justify-center gap-1.5 self-center text-sm text-muted-foreground transition-colors hover:text-foreground"
      @click="emit('back')"
    >
      <ArrowLeft class="size-3.5" aria-hidden="true" />
      {{ t('common.back') }}
    </button>
  </div>
</template>
