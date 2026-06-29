<!-- app/components/ops/OpsDrillsList.vue -->
<script setup lang="ts">
import { runbookHref, type OpsDrill } from '@/lib/ops/ops-drills'

defineProps<{
  readonly drills: readonly OpsDrill[]
  readonly runbookCtaLabel: string
  readonly evidenceCtaLabel: string
  readonly systemOfRecordLabel: string
}>()
</script>

<template>
  <ul class="ops-drills" data-testid="ops-drills">
    <li
      v-for="drill in drills"
      :key="drill.key"
      class="ops-drills__card"
      :data-testid="`ops-drill-${drill.key}`"
    >
      <strong class="ops-drills__title">{{ drill.title }}</strong>
      <p class="ops-drills__summary">{{ drill.summary }}</p>
      <p class="ops-drills__sor">{{ systemOfRecordLabel }}: {{ drill.systemOfRecord }}</p>
      <p class="ops-drills__links">
        <a
          class="ops-drills__link"
          :href="runbookHref(drill.runbookPath)"
          target="_blank"
          rel="noopener noreferrer"
          :data-testid="`ops-drill-runbook-${drill.key}`"
        >
          {{ runbookCtaLabel }}
        </a>
        <a
          v-if="drill.evidenceRef"
          class="ops-drills__link"
          :href="runbookHref(drill.evidenceRef)"
          target="_blank"
          rel="noopener noreferrer"
          :data-testid="`ops-drill-evidence-${drill.key}`"
        >
          {{ evidenceCtaLabel }}
        </a>
      </p>
    </li>
  </ul>
</template>

<style scoped>
.ops-drills {
  margin: 0;
  padding: 0;
  list-style: none;
  display: grid;
  gap: 12px;
}
.ops-drills__card {
  display: grid;
  gap: 6px;
  padding: 16px;
  background: var(--card);
  border: 1px solid var(--border);
}
.ops-drills__title {
  font: 600 0.875rem/1.3 var(--font-sans);
  color: var(--fg);
}
.ops-drills__summary {
  margin: 0;
  font: 400 0.8125rem/1.5 var(--font-sans);
  color: var(--fg-2);
}
.ops-drills__sor {
  margin: 0;
  font: 400 0.75rem/1.4 var(--font-sans);
  color: var(--fg-3);
}
.ops-drills__links {
  margin: 4px 0 0;
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.ops-drills__link {
  font: 600 0.8125rem/1.4 var(--font-sans);
  color: var(--accent);
  text-decoration: underline;
  text-underline-offset: 2px;
}
.ops-drills__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
