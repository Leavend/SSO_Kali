<script setup lang="ts">
import { Inbox } from 'lucide-vue-next'

interface Props {
  readonly title: string
  readonly description: string
}

defineProps<Props>()
</script>

<template>
  <section class="ui-empty">
    <div class="ui-empty__icon" aria-hidden="true">
      <slot name="icon"><Inbox :size="24" /></slot>
    </div>
    <div class="ui-empty__copy">
      <h2 class="ui-empty__title">{{ title }}</h2>
      <p class="ui-empty__desc">{{ description }}</p>
    </div>
    <div v-if="$slots.action" class="ui-empty__action">
      <slot name="action" />
    </div>
  </section>
</template>

<style scoped>
.ui-empty {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 28px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
}
.ui-empty__icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--fg-2);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.ui-empty__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.ui-empty__desc {
  margin: 4px 0 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ui-empty__action {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
</style>
