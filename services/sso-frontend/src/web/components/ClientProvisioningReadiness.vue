<script setup lang="ts">
import type { ClientProvisioningManifest } from '@shared/client-integration'

defineProps<{
  manifest: ClientProvisioningManifest
}>()
</script>

<template>
  <article class="integration-readiness">
    <h4>Provisioning readiness</h4>
    <p>
      Artifact RFC 7642 untuk memastikan lifecycle identitas, deprovisioning, audit, dan rollback sudah siap
      sebelum client dipromosikan.
    </p>

    <dl>
      <div>
        <dt>Mode</dt>
        <dd>{{ manifest.mode.toUpperCase() }}</dd>
      </div>
      <div>
        <dt>Identity source</dt>
        <dd>{{ manifest.identitySource }}</dd>
      </div>
    </dl>

    <div class="integration-readiness__grid">
      <section>
        <h5>Schema dan mapping</h5>
        <ul>
          <li v-for="item in manifest.requiredSchemas" :key="`schema-${item}`">{{ item }}</li>
          <li v-for="item in manifest.userMapping" :key="`user-${item}`">{{ item }}</li>
          <li v-for="item in manifest.groupMapping" :key="`group-${item}`">{{ item }}</li>
        </ul>
      </section>

      <section>
        <h5>Deprovisioning dan gates</h5>
        <ul>
          <li v-for="item in manifest.deprovisioning" :key="`deprovision-${item}`">{{ item }}</li>
          <li v-for="item in manifest.riskGates" :key="`gate-${item}`">{{ item }}</li>
          <li v-for="item in manifest.auditEvidence" :key="`audit-${item}`">{{ item }}</li>
        </ul>
      </section>
    </div>
  </article>
</template>
