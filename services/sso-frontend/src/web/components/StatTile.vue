<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  readonly label: string
  readonly value: string | number
  readonly detail?: string
  readonly loading?: boolean
}>()

const formattedValue = computed(() =>
  typeof props.value === 'number'
    ? props.value.toLocaleString('id-ID')
    : props.value
)
</script>

<template>
  <article class="stat-tile" :aria-label="`${label}: ${formattedValue}`">
    <span class="stat-tile__label">{{ label }}</span>
    <template v-if="loading">
      <span class="skeleton skeleton--number" aria-hidden="true" />
    </template>
    <strong v-else class="stat-tile__value">{{ formattedValue }}</strong>
    <small v-if="detail && !loading" class="stat-tile__detail">{{ detail }}</small>
  </article>
</template>
