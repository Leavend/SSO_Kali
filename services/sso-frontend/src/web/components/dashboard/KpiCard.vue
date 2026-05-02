<script setup lang="ts">
import { computed } from 'vue'
import { TrendingUp, TrendingDown, Minus } from 'lucide-vue-next'

type TrendDirection = 'up' | 'down' | 'neutral'

const props = withDefaults(defineProps<{
  label: string
  value: string | number
  trend?: TrendDirection
  trendValue?: string
  detail?: string
  loading?: boolean
  icon?: object
}>(), {
  trend: 'neutral',
  loading: false,
})

const formattedValue = computed(() => {
  if (typeof props.value === 'number') {
    return props.value.toLocaleString('id-ID')
  }
  return props.value
})

const trendIcon = computed(() => {
  switch (props.trend) {
    case 'up': return TrendingUp
    case 'down': return TrendingDown
    default: return Minus
  }
})
</script>

<template>
  <article
    class="kpi-card"
    :class="[
      `kpi-card--${trend}`,
      { 'kpi-card--loading': loading }
    ]"
    :aria-label="`${label}: ${formattedValue}`"
  >
    <div class="kpi-card__header">
      <span class="kpi-card__label">{{ label }}</span>
      <div v-if="trend !== 'neutral'" class="kpi-card__trend" :class="`kpi-card__trend--${trend}`">
        <component :is="trendIcon" :size="14" aria-hidden="true" />
        <span v-if="trendValue">{{ trendValue }}</span>
      </div>
    </div>

    <template v-if="loading">
      <span class="skeleton skeleton--number" aria-hidden="true" />
    </template>
    <strong v-else class="kpi-card__value">{{ formattedValue }}</strong>

    <small v-if="detail && !loading" class="kpi-card__detail">{{ detail }}</small>
  </article>
</template>

<style scoped>
.kpi-card {
  display: grid;
  gap: var(--space-1);
  padding: var(--space-5);
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px var(--admin-shadow);
  transition: transform var(--duration-fast) ease, box-shadow var(--duration-fast) ease;
}

@media (hover: hover) and (pointer: fine) {
  .kpi-card:hover {
    box-shadow: 0 8px 24px var(--admin-shadow-lg);
    transform: translateY(-2px);
  }
}

.kpi-card--up {
  border-left: 3px solid var(--status-success);
}

.kpi-card--down {
  border-left: 3px solid var(--status-danger);
}

.kpi-card__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-2);
}

.kpi-card__label {
  color: var(--admin-muted);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.kpi-card__trend {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 2px var(--space-2);
  border-radius: var(--radius-full);
  font-size: 11px;
  font-weight: 700;
}

.kpi-card__trend--up {
  color: var(--status-success);
  background: var(--status-success-soft);
}

.kpi-card__trend--down {
  color: var(--status-danger);
  background: var(--status-danger-soft);
}

.kpi-card__value {
  color: var(--admin-ink);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1;
}

.kpi-card__detail {
  color: var(--admin-subtle);
  font-size: var(--text-xs);
}

/* Loading state */
.kpi-card--loading .skeleton--number {
  height: 40px;
  width: 80px;
}
</style>