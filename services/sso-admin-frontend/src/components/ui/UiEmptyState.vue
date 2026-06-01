<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'

interface Props {
  readonly title: string
  readonly description: string
}

defineProps<Props>()
</script>

<template>
  <section class="ui-empty-state" role="status">
    <div class="ui-empty-state__icon" aria-hidden="true">
      <slot name="icon"><Inbox :size="26" /></slot>
    </div>
    <div>
      <h2>{{ title }}</h2>
      <p>{{ description }}</p>
    </div>
    <div v-if="$slots.action" class="ui-empty-state__action">
      <slot name="action" />
    </div>
  </section>
</template>
