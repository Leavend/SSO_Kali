<script setup lang="ts">
/**
 * RegisterConfirmStep — molecule rendering the final step (password
 * confirmation + display name + submit). Extracted from RegisterPage.vue
 * so the page stays under the 300-line file budget (standart-quality-code
 * §2.1) and so the final-step submit ergonomics live with the inputs.
 *
 * a11y:
 *   - Submit button drives loading copy + ArrowRight slot only when idle.
 *   - Back button is a real <button>, not a div-with-handler.
 */

import { ArrowLeft, ArrowRight, Lock, User } from 'lucide-vue-next'
import SsoGlassButton from '@/components/atoms/SsoGlassButton.vue'
import SsoGlassInput from '@/components/atoms/SsoGlassInput.vue'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
interface Props {
  passwordConfirmation: string
  name: string
  pending: boolean
  canSubmit: boolean
  passwordConfirmationError?: string | null
  nameError?: string | null
}
const props = withDefaults(defineProps<Props>(), {
  passwordConfirmationError: null,
  nameError: null,
})

interface Emits {
  (e: 'update:passwordConfirmation', value: string): void
  (e: 'update:name', value: string): void
  (e: 'back'): void
}
const emit = defineEmits<Emits>()
</script>

<template>
  <div class="flex flex-col items-stretch gap-3">
    <SsoGlassInput
      id="register-password-confirm"
      :model-value="props.passwordConfirmation"
      type="password"
      autocomplete="new-password"
      :placeholder="t('auth.register.confirm_password')"
      :required="true"
      :autofocus="true"
      :disabled="props.pending"
      :error="props.passwordConfirmationError ?? null"
      @update:model-value="(value: string) => emit('update:passwordConfirmation', value)"
    >
      <template #leading>
        <Lock class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </template>
    </SsoGlassInput>

    <SsoGlassInput
      id="register-name"
      :model-value="props.name"
      type="text"
      autocomplete="name"
      :placeholder="t('auth.register.full_name')"
      :required="true"
      :disabled="props.pending"
      :error="props.nameError ?? null"
      @update:model-value="(value: string) => emit('update:name', value)"
    >
      <template #leading>
        <User class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </template>
    </SsoGlassInput>

    <SsoGlassButton
      type="submit"
      variant="vibrant"
      size="fullWidth"
      :loading="props.pending"
      :disabled="!props.canSubmit"
    >
      <template v-if="!props.pending" #trailing>
        <ArrowRight class="size-4" aria-hidden="true" />
      </template>
      {{ props.pending ? t('auth.register.submitting') : t('auth.register.submit') }}
    </SsoGlassButton>

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
