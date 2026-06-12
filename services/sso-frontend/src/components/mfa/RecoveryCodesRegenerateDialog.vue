<script setup lang="ts">
/**
 * RecoveryCodesRegenerateDialog — FR-020 / UC-69.
 *
 * Dialog konfirmasi password sebelum regenerasi kode cadangan.
 * Menggunakan pattern yang sama dengan MfaRemoveDialog.
 *
 * Level: Molecule (menggunakan atoms: Dialog, Input, Button).
 */

import { ref, watch } from 'vue'
import { KeyRound } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
const props = defineProps<{
  open: boolean
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [password: string]
}>()

const password = ref('')

watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) password.value = ''
  },
)

function handleSubmit(): void {
  if (password.value.length === 0) return
  emit('confirm', password.value)
}
</script>

<template>
  <Dialog :open="open" @update:open="emit('update:open', $event)">
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle class="flex items-center gap-2 text-base">
          <KeyRound class="size-5 text-amber-600 dark:text-amber-400" />
          {{ t('portal.mfa.regenerate_title') }}
        </DialogTitle>
        <DialogDescription>
          {{ t('portal.mfa.regenerate_description') }}
        </DialogDescription>
      </DialogHeader>

      <form class="grid gap-4" @submit.prevent="handleSubmit">
        <div class="grid gap-2">
          <Label for="regen-password">{{ t('portal.security.password_title') }}</Label>
          <Input
            id="regen-password"
            v-model="password"
            type="password"
            :placeholder="t('portal.mfa.password_placeholder')"
            autocomplete="current-password"
            :disabled="pending"
          />
          <p v-if="error" class="text-xs text-red-600 dark:text-red-400" role="alert">
            {{ error }}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :disabled="pending"
            @click="emit('update:open', false)"
          >
            {{ t('common.cancel') }}
          </Button>
          <Button type="submit" size="sm" :disabled="pending || password.length === 0">
            <KeyRound class="size-4" />
            {{ t('portal.mfa.regenerate') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
