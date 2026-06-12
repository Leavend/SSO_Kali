<script setup lang="ts">
/**
 * MfaRemoveDialog — FR-019 / UC-49.
 *
 * Dialog konfirmasi untuk menonaktifkan MFA.
 * Memerlukan password re-authentication sebelum removal.
 *
 * Level: Organism (menggunakan Dialog primitive + composable).
 */

import { ref } from 'vue'
import { ShieldOff } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { useI18n } from '@/composables/useI18n'

const { t } = useI18n()
defineProps<{
  open: boolean
  pending: boolean
  error: string | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  confirm: [password: string]
}>()

const password = ref('')

function handleConfirm(): void {
  if (password.value.length > 0) {
    emit('confirm', password.value)
  }
}

function handleCancel(): void {
  password.value = ''
  emit('update:open', false)
}
</script>

<template>
  <AlertDialog :open="open" @update:open="emit('update:open', $event)">
    <AlertDialogContent>
      <AlertDialogHeader>
        <div class="mx-auto grid size-12 place-items-center rounded-full bg-destructive/10">
          <ShieldOff class="size-6 text-destructive" />
        </div>
        <AlertDialogTitle class="text-center text-base font-semibold">
          {{ t('portal.mfa.disable_title') }}
        </AlertDialogTitle>
        <AlertDialogDescription class="text-center text-sm text-muted-foreground">
          {{ t('portal.mfa.disable_description') }}
        </AlertDialogDescription>
      </AlertDialogHeader>

      <form class="grid gap-3" @submit.prevent="handleConfirm">
        <div class="grid gap-1.5">
          <Label for="mfa-remove-password" class="text-xs font-medium">{{
            t('portal.security.password_title')
          }}</Label>
          <Input
            id="mfa-remove-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            :placeholder="t('portal.mfa.password_placeholder')"
            :disabled="pending"
            required
          />
        </div>

        <p v-if="error" class="text-destructive text-center text-xs" role="alert">
          {{ error }}
        </p>

        <AlertDialogFooter class="flex gap-2 pt-2">
          <AlertDialogCancel as-child>
            <Button
              type="button"
              variant="outline"
              size="sm"
              class="flex-1"
              :disabled="pending"
              @click="handleCancel"
            >
              {{ t('common.cancel') }}
            </Button>
          </AlertDialogCancel>
          <AlertDialogAction as-child>
            <Button
              type="submit"
              variant="destructive"
              size="sm"
              class="flex-1"
              :disabled="pending || password.length === 0"
            >
              {{ pending ? t('common.disabling') : t('portal.mfa.disable') }}
            </Button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </form>
    </AlertDialogContent>
  </AlertDialog>
</template>
