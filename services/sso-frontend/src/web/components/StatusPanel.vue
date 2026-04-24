<script setup lang="ts">
import { ArrowRight, Home } from 'lucide-vue-next'
import type { AuthStatusCopy } from '@shared/auth-status'

defineProps<{
  readonly copy: AuthStatusCopy
}>()
</script>

<template>
  <section class="status-panel" :data-accent="copy.accent">
    <span class="status-badge">{{ copy.badge }}</span>
    <h1>{{ copy.title }}</h1>
    <p>{{ copy.description }}</p>
    <div class="status-actions">
      <a class="button button--primary" :href="copy.primaryAction.href">
        {{ copy.primaryAction.label }}
        <ArrowRight :size="18" aria-hidden="true" />
      </a>
      <a v-if="copy.secondaryAction" class="button button--secondary" :href="copy.secondaryAction.href">
        <Home :size="18" aria-hidden="true" />
        {{ copy.secondaryAction.label }}
      </a>
    </div>
    <small v-if="copy.note">{{ copy.note }}</small>
  </section>
</template>
