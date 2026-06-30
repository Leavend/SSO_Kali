<!-- app/components/profile/ProfileIdentityCard.vue -->
<script setup lang="ts">
import UiStatusBadge from '@/components/ui/UiStatusBadge.vue'
import UiFolio from '@/components/ui/UiFolio.vue'
import type { AdminPrincipal } from '@/types/auth.types'

export type ProfileIdentityLabels = {
  readonly title: string
  readonly email: string
  readonly subjectId: string
  readonly givenName: string
  readonly familyName: string
  readonly role: string
}

defineProps<{
  readonly principal: AdminPrincipal
  readonly labels: ProfileIdentityLabels
}>()
</script>

<template>
  <section class="profile-card" data-testid="profile-identity" aria-labelledby="profile-identity-title">
    <div class="profile-card__head">
      <h2 id="profile-identity-title" class="profile-card__title">{{ labels.title }}</h2>
      <UiStatusBadge data-testid="profile-role" tone="neutral" :label="`${labels.role}: ${principal.role}`" />
    </div>
    <p class="profile-card__name">{{ principal.display_name }}</p>
    <dl class="profile-card__grid">
      <div class="profile-card__wide">
        <dt>{{ labels.email }}</dt>
        <dd data-testid="profile-email">{{ principal.email }}</dd>
      </div>
      <div class="profile-card__wide">
        <dt>{{ labels.subjectId }}</dt>
        <dd><UiFolio :value="principal.subject_id" variant="id" /></dd>
      </div>
      <div>
        <dt>{{ labels.givenName }}</dt>
        <dd data-testid="profile-given-name">{{ principal.given_name ?? '—' }}</dd>
      </div>
      <div>
        <dt>{{ labels.familyName }}</dt>
        <dd data-testid="profile-family-name">{{ principal.family_name ?? '—' }}</dd>
      </div>
    </dl>
  </section>
</template>

<style scoped>
.profile-card {
  display: grid;
  gap: 14px;
  padding: 20px;
  background: var(--card);
  border: 1px solid var(--border);
}
.profile-card__head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.profile-card__title {
  margin: 0;
  font: 600 1rem/1.3 var(--font-sans);
  color: var(--fg);
}
.profile-card__name {
  margin: 0;
  font: 600 1.25rem/1.2 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.profile-card__grid {
  margin: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px 16px;
}
.profile-card__wide {
  grid-column: 1 / -1;
}
.profile-card__grid dt {
  font: 600 0.625rem/1.2 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.profile-card__grid dd {
  margin: 2px 0 0;
  font: 400 0.8125rem/1.4 var(--font-sans);
  color: var(--fg);
  overflow-wrap: anywhere;
}
</style>
