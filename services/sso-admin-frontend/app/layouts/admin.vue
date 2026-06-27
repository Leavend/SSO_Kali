<template>
  <div class="admin-shell" data-admin-shell>
    <aside class="admin-shell__sidebar" aria-label="Primary navigation">
      <!-- navigation is wired in a later phase -->
    </aside>
    <header class="admin-shell__topbar">
      <!-- account bar + controls are wired in a later phase -->
    </header>
    <main class="admin-shell__main">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.admin-shell {
  display: grid;
  grid-template-columns: var(--sidebar-w) 1fr;
  grid-template-rows: var(--topbar-h) 1fr;
  grid-template-areas:
    'sidebar topbar'
    'sidebar main';
  min-height: 100vh;
  background: var(--bg);
  color: var(--fg);
}

.admin-shell__sidebar {
  grid-area: sidebar;
  border-right: 1px solid var(--border);
  background: var(--bg-2);
}

.admin-shell__topbar {
  grid-area: topbar;
  border-bottom: 1px solid var(--border);
  background: var(--card);
}

.admin-shell__main {
  grid-area: main;
  padding: var(--content-pad);
}
</style>
