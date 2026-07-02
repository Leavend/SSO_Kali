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
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
  padding: 40px 24px;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-sm);
}
.ui-empty__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  color: var(--accent);
  background: var(--accent-soft);
  border: 1px solid var(--accent-soft-border);
  border-radius: var(--r-md);
}
.ui-empty__copy {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.ui-empty__title {
  margin: 0;
  font: 600 0.9375rem/1.2 var(--font-sans);
  color: var(--fg);
}
.ui-empty__desc {
  margin: 0;
  max-width: 40ch;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ui-empty__action {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 10px;
  margin-top: 4px;
}
</style>
