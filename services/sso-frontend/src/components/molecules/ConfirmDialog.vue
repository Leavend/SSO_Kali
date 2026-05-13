<script setup lang="ts">
/**
 * ConfirmDialog — molecule: reusable confirm alert, pengganti window.confirm.
 */

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

const props = withDefaults(
  defineProps<{
    open: boolean
    title: string
    description?: string
    confirmLabel?: string
    cancelLabel?: string
    destructive?: boolean
  }>(),
  {
    description: undefined,
    confirmLabel: 'Lanjutkan',
    cancelLabel: 'Batal',
    destructive: false,
  },
)

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'confirm'): void
  (e: 'cancel'): void
}>()

function handleOpenChange(value: boolean): void {
  emit('update:open', value)
  if (!value) emit('cancel')
}

function handleConfirm(): void {
  emit('confirm')
  emit('update:open', false)
}
</script>

<template>
  <AlertDialog :open="props.open" @update:open="handleOpenChange">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ props.title }}</AlertDialogTitle>
        <AlertDialogDescription v-if="props.description">
          {{ props.description }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ props.cancelLabel }}</AlertDialogCancel>
        <AlertDialogAction
          :class="props.destructive ? 'bg-destructive text-white hover:bg-destructive/90' : ''"
          @click="handleConfirm"
        >
          {{ props.confirmLabel }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
