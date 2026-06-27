<script setup lang="ts">
interface Props {
  readonly title: string
  readonly description?: string
}

withDefaults(defineProps<Props>(), {
  description: undefined,
})
</script>

<template>
  <section class="form-section">
    <div class="form-section__intro">
      <h2 class="form-section__title">{{ title }}</h2>
      <p v-if="description" class="form-section__desc">{{ description }}</p>
    </div>
    <div class="form-section__fields">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.form-section {
  display: grid;
  grid-template-columns: 1fr;
  gap: 16px;
  padding: 20px 0;
  border-bottom: 1px solid var(--border);
}
.form-section:last-child {
  border-bottom: 0;
}
.form-section__title {
  margin: 0;
  font: 600 0.8125rem/1.2 var(--font-sans);
  color: var(--fg);
}
.form-section__desc {
  margin: 6px 0 0;
  font: 400 0.6875rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.form-section__fields {
  display: grid;
  gap: 14px;
}
@media (min-width: 768px) {
  .form-section {
    grid-template-columns: 1fr 2fr;
    gap: 24px;
  }
}
</style>
