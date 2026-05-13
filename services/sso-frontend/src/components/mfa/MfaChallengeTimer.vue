<script setup lang="ts">
/**
 * MfaChallengeTimer — FR-019 / UC-67.
 *
 * Countdown timer yang menunjukkan sisa waktu challenge.
 * Emit 'expired' saat waktu habis.
 */

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Clock } from 'lucide-vue-next'

const props = defineProps<{
  expiresAt: string
}>()

const emit = defineEmits<{
  expired: []
}>()

const remainingSeconds = ref<number>(0)
let intervalId: ReturnType<typeof setInterval> | null = null

function calculateRemaining(): number {
  const diff = new Date(props.expiresAt).getTime() - Date.now()
  return Math.max(0, Math.floor(diff / 1000))
}

const formattedTime = computed<string>(() => {
  const minutes = Math.floor(remainingSeconds.value / 60)
  const seconds = remainingSeconds.value % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
})

const isUrgent = computed<boolean>(() => remainingSeconds.value <= 60)

function tick(): void {
  remainingSeconds.value = calculateRemaining()
  if (remainingSeconds.value <= 0) {
    if (intervalId) clearInterval(intervalId)
    emit('expired')
  }
}

onMounted(() => {
  remainingSeconds.value = calculateRemaining()
  intervalId = setInterval(tick, 1000)
})

onBeforeUnmount(() => {
  if (intervalId) clearInterval(intervalId)
})
</script>

<template>
  <div
    class="flex items-center gap-2 rounded-md px-3 py-2 text-sm"
    :class="isUrgent ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'"
  >
    <Clock class="size-4 shrink-0" aria-hidden="true" />
    <span>Sisa waktu verifikasi: <strong>{{ formattedTime }}</strong></span>
  </div>
</template>
