<script setup lang="ts">
/**
 * SecurityPasswordForm — molecule for mobile-safe password updates.
 */

import { KeyRound } from 'lucide-vue-next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ChangePasswordPayload } from '@/services/profile.api'

interface Props {
  form: ChangePasswordPayload
  errors: Record<string, string[]>
  isPending: boolean
}

interface Emits {
  (e: 'update:field', field: keyof ChangePasswordPayload, value: string): void
  (e: 'submit'): void
  (e: 'cancel'): void
}

const props = defineProps<Props>()
const emit = defineEmits<Emits>()

function updateField(field: keyof ChangePasswordPayload, value: string | number): void {
  emit('update:field', field, String(value))
}

function handleSubmit(): void {
  emit('submit')
}

function handleCancel(): void {
  emit('cancel')
}
</script>

<template>
  <form class="grid gap-3" @submit.prevent="handleSubmit">
    <div class="grid gap-1.5">
      <Label for="current_password" class="text-xs">Password Saat Ini</Label>
      <Input
        id="current_password"
        :model-value="props.form.current_password"
        type="password"
        autocomplete="current-password"
        class="h-10 py-2"
        required
        @update:model-value="updateField('current_password', $event)"
      />
      <p v-if="props.errors.current_password" class="text-destructive text-xs">
        {{ props.errors.current_password[0] }}
      </p>
    </div>

    <div class="grid gap-1.5">
      <Label for="new_password" class="text-xs">Password Baru</Label>
      <Input
        id="new_password"
        :model-value="props.form.new_password"
        type="password"
        autocomplete="new-password"
        class="h-10 py-2"
        required
        minlength="8"
        @update:model-value="updateField('new_password', $event)"
      />
      <p v-if="props.errors.new_password" class="text-destructive text-xs">
        {{ props.errors.new_password[0] }}
      </p>
    </div>

    <div class="grid gap-1.5">
      <Label for="new_password_confirmation" class="text-xs">
        Konfirmasi Password Baru
      </Label>
      <Input
        id="new_password_confirmation"
        :model-value="props.form.new_password_confirmation"
        type="password"
        autocomplete="new-password"
        class="h-10 py-2"
        required
        minlength="8"
        @update:model-value="updateField('new_password_confirmation', $event)"
      />
    </div>

    <p v-if="props.errors._general" class="text-destructive text-xs">
      {{ props.errors._general[0] }}
    </p>

    <div data-testid="password-form-actions" class="flex flex-col gap-2 pt-1 sm:flex-row">
      <Button type="submit" size="sm" class="w-full sm:w-fit" :disabled="props.isPending">
        <KeyRound class="size-4" aria-hidden="true" />
        {{ props.isPending ? 'Menyimpan...' : 'Simpan' }}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        class="w-full sm:w-fit"
        @click="handleCancel"
      >
        Batal
      </Button>
    </div>
  </form>
</template>
