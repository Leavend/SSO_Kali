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
  background: linear-gradient(135deg, var(--admin-panel) 0%, color-mix(in srgb, var(--admin-accent-soft) 10%, var(--admin-panel)) 100%);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-lg);
  box-shadow: 0 1px 3px var(--admin-shadow), 0 1px 2px rgba(0, 0, 0, 0.05);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.2s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease;
}

@media (hover: hover) and (pointer: fine) {
  .kpi-card:hover {
    box-shadow: 0 12px 32px var(--admin-shadow-lg);
    transform: translateY(-3px);
    border-color: var(--admin-line-strong);
  }

  .kpi-card:active {
    transform: translateY(-1px);
    box-shadow: 0 6px 16px var(--admin-shadow-lg);
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
  transition: transform 0.15s ease;
}

.kpi-card:hover .kpi-card__trend {
  transform: scale(1.05);
}

.kpi-card__trend--up {
  color: var(--status-success);
  background: color-mix(in srgb, var(--status-success) 10%, var(--admin-panel));
  border: 1px solid color-mix(in srgb, var(--status-success) 20%, transparent);
}

.kpi-card__trend--down {
  color: var(--status-danger);
  background: color-mix(in srgb, var(--status-danger) 10%, var(--admin-panel));
  border: 1px solid color-mix(in srgb, var(--status-danger) 20%, transparent);
}

.kpi-card__value {
  color: var(--admin-ink);
  font-size: var(--text-3xl);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1;
  background: linear-gradient(135deg, var(--admin-ink) 0%, color-mix(in srgb, var(--admin-ink) 85%, var(--admin-muted)) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
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

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .kpi-card {
    transition: none;
  }

  .kpi-card:hover {
    transform: none;
  }

  .kpi-card:active {
    transform: none;
  }

  .kpi-card__trend {
    transition: none;
  }

  .kpi-card:hover .kpi-card__trend {
    transform: none;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .kpi-card {
    border: 2px solid var(--admin-line);
  }

  .kpi-card__trend--up,
  .kpi-card__trend--down {
    border-width: 2px;
  }
}
</style>
