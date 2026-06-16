<script setup lang="ts">
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
} from 'reka-ui'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

interface Props {
  readonly open: boolean
  readonly titleId: string
  readonly title: string
  readonly description: string
  readonly closeLabel: string
  readonly overlayClass?: string
  readonly wide?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  wide: false,
})
const emit = defineEmits<{ (event: 'close'): void }>()

function handleOpenChange(open: boolean): void {
  if (!open) emit('close')
}
</script>

<template>
  <DialogRoot :open="open" @update:open="handleOpenChange">
    <DialogPortal disabled>
      <DialogOverlay :class="cn('user-modal-overlay', overlayClass)" />
      <DialogContent
        :class="cn('user-modal-card', 'ui-dialog-content', props.wide && 'ui-dialog-card--wide')"
        :data-dialog-id="titleId"
      >
        <div class="user-modal-header">
          <DialogTitle>{{ title }}</DialogTitle>
          <DialogClose class="user-modal-close" :aria-label="closeLabel">
            <X :size="18" aria-hidden="true" />
          </DialogClose>
        </div>
        <DialogDescription class="sr-only">
          {{ description }}
        </DialogDescription>
        <slot />
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
