<script setup lang="ts">
interface Props {
  readonly rows?: number
  readonly label?: string
}

withDefaults(defineProps<Props>(), {
  rows: 4,
  label: 'Loading',
})
</script>

<template>
  <div class="ui-skeleton" role="status" :aria-label="label">
    <span class="sr-only">{{ label }}</span>
    <span
      v-for="index in rows"
      :key="index"
      data-testid="ui-skeleton-row"
      class="ui-skeleton__row"
      :style="{ '--skeleton-width': `${100 - (index % 3) * 14}%` }"
    />
  </div>
</template>
