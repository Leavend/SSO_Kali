<script setup lang="ts">
interface Props {
  readonly title: string
  readonly description?: string
}

defineProps<Props>()
</script>

<template>
  <section class="grid grid-cols-1 md:grid-cols-3 gap-6 py-6 border-b border-border last:border-b-0">
    <!-- Left Column: Title & Description -->
    <div class="md:col-span-1">
      <h2 class="text-sm font-semibold text-foreground">{{ title }}</h2>
      <p v-if="description" class="text-xs text-muted-foreground mt-1.5 leading-relaxed">
        {{ description }}
      </p>
    </div>

    <!-- Right Column: Fields Slot -->
    <div class="md:col-span-2 space-y-4">
      <slot />
    </div>
  </section>
</template>
