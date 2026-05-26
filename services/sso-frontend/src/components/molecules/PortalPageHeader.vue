<script setup lang="ts">
/**
 * PortalPageHeader — reusable liquid-glass hero for portal dashboard pages.
 */

import { computed, type Component } from 'vue'
import { Sparkles } from 'lucide-vue-next'
import { Badge } from '@/components/ui/badge'

const props = defineProps<{
  eyebrow: string
  title: string
  description: string
  icon?: Component
}>()

const headerIcon = computed<Component>(() => props.icon ?? Sparkles)
</script>

<template>
  <header
    data-testid="portal-page-header"
    class="portal-glass-hero relative overflow-hidden rounded-[var(--radius-glass-2xl)] border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-primary)] px-5 py-5 shadow-[var(--shadow-glass-md)] backdrop-blur-[var(--glass-blur-lg)] sm:px-7 sm:py-6"
  >
    <div
      aria-hidden="true"
      class="absolute -right-16 -top-24 size-56 rounded-full bg-[radial-gradient(circle,var(--color-blob-azure)_0%,transparent_68%)] opacity-35 blur-3xl"
    />
    <div
      aria-hidden="true"
      class="absolute -bottom-24 left-1/3 size-48 rounded-full bg-[radial-gradient(circle,var(--color-blob-violet)_0%,transparent_70%)] opacity-25 blur-3xl"
    />

    <div
      data-testid="portal-page-header-content"
      class="relative z-[1] grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
    >
      <div class="grid min-w-0 gap-3 sm:grid-cols-[3.25rem_minmax(0,1fr)] sm:items-center">
        <span
          data-testid="portal-page-header-icon"
          class="sso-glass-pill grid size-13 place-items-center text-white shadow-[var(--shadow-glass-md)]"
          aria-hidden="true"
        >
          <component :is="headerIcon" class="relative z-[2] size-5" />
        </span>
        <div class="min-w-0">
          <Badge
            variant="secondary"
            class="mb-2 w-fit border border-[var(--glass-border-subtle)] bg-[var(--glass-bg-elevated)] text-[11px] text-[var(--text-primary)] shadow-[var(--shadow-glass-sm)] backdrop-blur-[var(--glass-blur-sm)]"
          >
            {{ props.eyebrow }}
          </Badge>
          <h1
            class="font-display text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-heading-1"
          >
            {{ props.title }}
          </h1>
          <p class="mt-1 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
            {{ props.description }}
          </p>
        </div>
      </div>

      <div
        v-if="$slots.actions"
        data-testid="portal-page-header-actions"
        class="flex flex-col gap-2 sm:items-end"
      >
        <slot name="actions" />
      </div>
    </div>
  </header>
</template>
