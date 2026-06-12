<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Mail, X } from 'lucide-vue-next'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import SsoFormField from '@/components/molecules/SsoFormField.vue'
import SsoPasswordField from '@/components/molecules/SsoPasswordField.vue'
import SsoAlertBanner from '@/components/molecules/SsoAlertBanner.vue'
import { useEmailChange } from '@/composables/useEmailChange'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const props = defineProps<{
  open: boolean
  currentEmail: string
}>()

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'done'): void
}>()

const {
  step,
  pending,
  success,
  error,
  fieldErrors,
  newEmail,
  requestChange,
  confirmChange,
  reset,
} = useEmailChange()

const emailInput = ref('')
const passwordInput = ref('')
const tokenInput = ref('')

const isRequestStep = computed<boolean>(() => step.value === 'request')
const isConfirmStep = computed<boolean>(() => step.value === 'confirm')

function handleOpenChange(value: boolean): void {
  if (!value) handleClose()
  emit('update:open', value)
}

function handleClose(): void {
  reset()
  emailInput.value = ''
  passwordInput.value = ''
  tokenInput.value = ''
}

async function handleRequestChange(): Promise<void> {
  await requestChange(emailInput.value, passwordInput.value)
}

async function handleConfirmChange(): Promise<void> {
  await confirmChange(tokenInput.value)
}

watch(success, (val) => {
  if (val && isConfirmStep.value) {
    emit('done')
  }
})
</script>

<template>
  <AlertDialog :open="props.open" @update:open="handleOpenChange">
    <AlertDialogContent class="sm:max-w-md">
      <AlertDialogHeader>
        <AlertDialogTitle>{{ t('portal.email_change.title') }}</AlertDialogTitle>
        <AlertDialogDescription v-if="isRequestStep">
          {{ t('portal.email_change.current') }} <strong>{{ props.currentEmail }}</strong>
          <br />
          {{ t('portal.email_change.request_description') }}
        </AlertDialogDescription>
        <AlertDialogDescription v-else>
          {{ t('portal.email_change.sent_prefix') }} <strong>{{ newEmail }}</strong
          >. {{ t('portal.email_change.confirm_description') }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid gap-4 py-2">
        <SsoAlertBanner v-if="success && isRequestStep" tone="success" :message="success" />

        <template v-if="isRequestStep">
          <SsoFormField
            id="email-change-new-email"
            v-model="emailInput"
            type="email"
            :label="t('portal.email_change.new_email')"
            autocomplete="email"
            :disabled="pending"
            :error="fieldErrors.new_email ?? null"
            required
          />
          <SsoPasswordField
            id="email-change-password"
            v-model="passwordInput"
            :label="t('portal.security.current_password')"
            autocomplete="current-password"
            :disabled="pending"
            :error="fieldErrors.current_password ?? null"
          />
        </template>

        <template v-if="isConfirmStep">
          <SsoFormField
            id="email-change-token"
            v-model="tokenInput"
            type="text"
            :label="t('portal.email_change.token')"
            autocomplete="one-time-code"
            :disabled="pending"
            :error="fieldErrors.token ?? null"
            :hint="t('portal.email_change.token_hint')"
            required
          />
        </template>

        <SsoAlertBanner v-if="error" tone="error" :message="error" />
      </div>

      <AlertDialogFooter>
        <Button type="button" variant="ghost" :disabled="pending" @click="handleClose">
          <X class="size-4" aria-hidden="true" />
          {{ t('common.close') }}
        </Button>
        <Button v-if="isRequestStep" type="button" :disabled="pending" @click="handleRequestChange">
          <Mail class="size-4" aria-hidden="true" />
          {{ pending ? t('common.sending') : t('portal.email_change.send_token') }}
        </Button>
        <Button v-if="isConfirmStep" type="button" :disabled="pending" @click="handleConfirmChange">
          {{ pending ? t('common.verifying') : t('portal.email_change.verify_token') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
