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
        <AlertDialogTitle>Ubah Email</AlertDialogTitle>
        <AlertDialogDescription v-if="isRequestStep">
          Email saat ini: <strong>{{ props.currentEmail }}</strong>
          <br />
          Masukkan email baru dan password untuk menerima token verifikasi.
        </AlertDialogDescription>
        <AlertDialogDescription v-else>
          Token verifikasi telah dikirim ke <strong>{{ newEmail }}</strong
          >. Masukkan token untuk menyelesaikan perubahan.
        </AlertDialogDescription>
      </AlertDialogHeader>

      <div class="grid gap-4 py-2">
        <SsoAlertBanner v-if="success && isRequestStep" tone="success" :message="success" />

        <template v-if="isRequestStep">
          <SsoFormField
            id="email-change-new-email"
            v-model="emailInput"
            type="email"
            label="Email baru"
            autocomplete="email"
            :disabled="pending"
            :error="fieldErrors.new_email ?? null"
            required
          />
          <SsoPasswordField
            id="email-change-password"
            v-model="passwordInput"
            label="Password saat ini"
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
            label="Token verifikasi"
            autocomplete="one-time-code"
            :disabled="pending"
            :error="fieldErrors.token ?? null"
            hint="Periksa email baru untuk token verifikasi."
            required
          />
        </template>

        <SsoAlertBanner v-if="error" tone="error" :message="error" />
      </div>

      <AlertDialogFooter>
        <Button type="button" variant="ghost" :disabled="pending" @click="handleClose">
          <X class="size-4" aria-hidden="true" />
          Tutup
        </Button>
        <Button v-if="isRequestStep" type="button" :disabled="pending" @click="handleRequestChange">
          <Mail class="size-4" aria-hidden="true" />
          {{ pending ? 'Mengirim…' : 'Kirim Token' }}
        </Button>
        <Button v-if="isConfirmStep" type="button" :disabled="pending" @click="handleConfirmChange">
          {{ pending ? 'Memverifikasi…' : 'Verifikasi Token' }}
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
