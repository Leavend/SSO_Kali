<script setup lang="ts">
import { computed } from "vue";
import { ArrowRight, Home, ShieldAlert, AlertTriangle } from "lucide-vue-next";
import type { AuthStatusCopy } from "@shared/auth-status";

const props = defineProps<{
  readonly copy: AuthStatusCopy;
}>();

const icon = computed(() =>
  props.copy.accent === "danger" ? ShieldAlert : AlertTriangle,
);
</script>

<template>
  <section
    class="status-card"
    :data-accent="copy.accent"
    role="alert"
    aria-live="polite"
  >
    <div class="status-card__icon" aria-hidden="true">
      <component :is="icon" :size="22" stroke-width="2" />
    </div>

    <span class="status-card__badge">{{ copy.badge }}</span>
    <h1 id="status-title">{{ copy.title }}</h1>
    <p>{{ copy.description }}</p>

    <div class="status-card__actions">
      <a class="signin-submit" :href="copy.primaryAction.href">
        {{ copy.primaryAction.label }}
        <ArrowRight :size="18" aria-hidden="true" />
      </a>
      <a
        v-if="copy.secondaryAction"
        class="status-card__secondary"
        :href="copy.secondaryAction.href"
      >
        <Home :size="18" aria-hidden="true" />
        {{ copy.secondaryAction.label }}
      </a>
    </div>

    <small v-if="copy.note" class="status-card__note">{{ copy.note }}</small>
  </section>
</template>
