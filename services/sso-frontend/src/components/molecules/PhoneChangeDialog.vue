<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Phone, X } from 'lucide-vue-next'
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
import { usePhoneChange } from '@/composables/usePhoneChange'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const props = defineProps<{
  open: boolean
  currentPhone: string | null
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
  newPhone,
  requestChange,
  confirmChange,
  reset,
} = usePhoneChange()

const phoneInput = ref('')
const passwordInput = ref('')
const otpInput = ref('')

const isRequestStep = computed<boolean>(() => step.value === 'request')
const isConfirmStep = computed<boolean>(() => step.value === 'confirm')
const isEditing = computed<boolean>(() => Boolean(props.currentPhone))

function handleOpenChange(value: boolean): void {
  if (!value) handleClose()
  emit('update:open', value)
}

function handleClose(): void {
  reset()
  phoneInput.value = ''
  passwordInput.value = ''
  otpInput.value = ''
}

async function handleRequestChange(): Promise<void> {
  await requestChange(phoneInput.value, passwordInput.value)
}

async function handleConfirmChange(): Promise<void> {
  await confirmChange(otpInput.value)
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
        <AlertDialogTitle>{{
          isEditing ? t('portal.phone_change.edit_title') : t('portal.phone_change.add_title')
        }}</AlertDialogTitle>
        <AlertDialogDescription v-if="isRequestStep">
          <template v-if="isEditing">
            {{ t('portal.phone_change.current') }} <strong>{{ props.currentPhone }}</strong>
            <br />
          </template>
          {{ t('portal.phone_change.request_description') }}
        </AlertDialogDescription>
        <AlertDialogDescription v-else>
          {{ t('portal.phone_change.sent_prefix') }} <strong>{{ newPhone }}</strong
          >. {{ t('portal.phone_change.confirm_description') }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid gap-4 py-2">
        <SsoAlertBanner v-if="success && isRequestStep" tone="success" :message="success" />

        <template v-if="isRequestStep">
          <SsoFormField
            id="phone-change-number"
            v-model="phoneInput"
            type="tel"
            :label="t('portal.phone_change.new_phone')"
            autocomplete="tel"
            inputmode="tel"
            :disabled="pending"
            :error="fieldErrors.new_phone ?? null"
            :hint="t('portal.phone_change.format_hint')"
            required
          />
          <SsoPasswordField
            id="phone-change-password"
            v-model="passwordInput"
            :label="t('portal.security.current_password')"
            autocomplete="current-password"
            :disabled="pending"
            :error="fieldErrors.current_password ?? null"
          />
        </template>

        <template v-if="isConfirmStep">
          <SsoFormField
            id="phone-change-otp"
            v-model="otpInput"
            type="text"
            :label="t('portal.phone_change.otp')"
            autocomplete="one-time-code"
            inputmode="numeric"
            :disabled="pending"
            :error="fieldErrors.otp ?? null"
            :hint="t('portal.phone_change.otp_hint')"
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
          <Phone class="size-4" aria-hidden="true" />
          {{ pending ? t('common.sending') : t('portal.phone_change.send_otp') }}
        </Button>
        <Button v-if="isConfirmStep" type="button" :disabled="pending" @click="handleConfirmChange">
          {{ pending ? t('common.verifying') : t('portal.phone_change.verify_otp') }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
