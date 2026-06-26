<script setup lang="ts">
/**
 * AppLauncher.vue — SSO application launcher (9-dot "waffle" → app grid popover),
 * Google-style. Central component: mount in the topbar of any SSO-connected app
 * so a single data source means a change at the center propagates everywhere.
 *
 * DATA: `DEFAULT_APPS` below is a STATIC PLACEHOLDER only. A parent may pass a
 * fetched list via the `apps` prop once a backend endpoint exists.
 * TODO: source this list from a backend SSO apps endpoint (single source of
 * truth, e.g. GET /widget/apps) instead of the hardcoded placeholder — do NOT
 * invent or call an endpoint here.
 */
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import {
  Grid3X3,
  UserRound,
  AppWindow,
  Building2,
  FileText,
  Globe,
  Layers,
  Activity,
  Fingerprint,
  Search,
  ExternalLink,
  type LucideIcon,
} from 'lucide-vue-next'
import { safeWidgetAppUrl } from '@/services/sso-account-widget.api'
import { useI18n } from '@/composables/useI18n'
import { getAdminEnvironment } from '@/config/adminEnvironment'

export type SsoApp = {
  /** Full display name (also the accessible name / tooltip). */
  name: string
  /** Short label shown under the tile. */
  short: string
  /** Icon key into ICONS below. */
  icon: string
  /** App-specific gradient for the tile background. */
  grad: string
  /** Show in the "frequently used" (favorites) group. */
  fav?: boolean
  /** Navigation target; empty = current app. */
  url?: string
}

const props = withDefaults(
  defineProps<{
    apps?: SsoApp[]
    align?: 'left' | 'right'
  }>(),
  { align: 'right' },
)

const emit = defineEmits<{ (e: 'open', app: SsoApp): void }>()

const { t } = useI18n()

// --- Static placeholder data (replace with a fetched backend list via `apps`). ---
// TODO: these should come from a backend SSO apps endpoint (single source of
// truth). Names are intentionally left untranslated (proper nouns).
const DEFAULT_APPS: SsoApp[] = [
  { name: 'Akun SSO',              short: 'Akun SSO',  icon: 'user',   grad: 'linear-gradient(135deg,oklch(0.62 0.2 274),oklch(0.5 0.21 268))', fav: true, url: '/' },
  { name: 'E-Office Bontang',      short: 'E-Office',  icon: 'app',    grad: 'linear-gradient(135deg,oklch(0.64 0.17 250),oklch(0.52 0.2 258))', fav: true },
  { name: 'SIMPEG Kepegawaian',    short: 'SIMPEG',    icon: 'office', grad: 'linear-gradient(135deg,oklch(0.68 0.15 162),oklch(0.55 0.15 168))', fav: true },
  { name: 'LAPOR! Bontang',        short: 'LAPOR!',    icon: 'doc',    grad: 'linear-gradient(135deg,oklch(0.7 0.13 208),oklch(0.58 0.14 222))', fav: true },
  { name: 'Portal Layanan Publik', short: 'Layanan',   icon: 'globe',  grad: 'linear-gradient(135deg,oklch(0.62 0.2 300),oklch(0.5 0.21 296))', fav: true },
  { name: 'SatuData Bontang',      short: 'SatuData',  icon: 'layers', grad: 'linear-gradient(135deg,oklch(0.76 0.15 70),oklch(0.66 0.16 52))', fav: true },
  { name: 'SIM RSUD Taman Husada', short: 'SIM RSUD',  icon: 'pulse',  grad: 'linear-gradient(135deg,oklch(0.64 0.2 14),oklch(0.55 0.21 18))' },
  { name: 'e-Absensi ASN',         short: 'e-Absensi', icon: 'finger', grad: 'linear-gradient(135deg,oklch(0.66 0.12 192),oklch(0.56 0.13 202))' },
  { name: 'Arsip Digital',         short: 'Arsip',     icon: 'search', grad: 'linear-gradient(135deg,oklch(0.64 0.13 286),oklch(0.52 0.16 290))' },
]

// Map icon keys to lucide components (already a repo dependency — keeps the
// launcher consistent with the rest of the admin shell's iconography).
const ICONS: Record<string, LucideIcon> = {
  user: UserRound,
  app: AppWindow,
  office: Building2,
  doc: FileText,
  globe: Globe,
  layers: Layers,
  pulse: Activity,
  finger: Fingerprint,
  search: Search,
}

const list = computed<SsoApp[]>(() => props.apps ?? DEFAULT_APPS)
const fav = computed<SsoApp[]>(() => list.value.filter((app) => app.fav))
const rest = computed<SsoApp[]>(() => list.value.filter((app) => !app.fav))

// Footer target: the portal's connected-apps page (`/apps` on the portal origin,
// which `ssoBaseUrl` points at). There is no admin route for managing connected
// apps — the end-user portal owns that surface — so we link cross-origin to the
// real, existing page rather than inventing an admin route. `safeWidgetAppUrl`
// rejects anything that isn't http(s).
const manageAppsUrl = computed<string | undefined>(
  () => safeWidgetAppUrl(`${getAdminEnvironment().ssoBaseUrl}/apps`) ?? undefined,
)

function iconFor(key: string): LucideIcon {
  return ICONS[key] ?? AppWindow
}

const open = ref(false)
const root = ref<HTMLElement | null>(null)
const trigger = ref<HTMLButtonElement | null>(null)
const popover = ref<HTMLElement | null>(null)

function focusableItems(): HTMLElement[] {
  if (!popover.value) return []
  return Array.from(
    popover.value.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((item) => !item.hasAttribute('disabled') && item.tabIndex !== -1)
}

async function focusPopover(): Promise<void> {
  await nextTick()
  focusableItems()[0]?.focus()
}

function toggle(): void {
  open.value = !open.value
  if (open.value) void focusPopover()
}

function close(restoreFocus = false): void {
  if (!open.value) return
  open.value = false
  if (restoreFocus) trigger.value?.focus()
}

function openApp(app: SsoApp): void {
  close()
  emit('open', app)
  if (!app.url) return
  // Active SSO session → navigating between connected apps needs no re-login.
  // Allow same-origin relative paths; for absolute URLs require a safe http(s)
  // target (rejects javascript:/data: and other schemes).
  const isRelative = app.url.startsWith('/')
  if (isRelative || safeWidgetAppUrl(app.url)) {
    window.location.assign(app.url)
  }
}

function handleDocumentClick(event: MouseEvent): void {
  if (!root.value || !(event.target instanceof Node)) return
  if (!root.value.contains(event.target)) close()
}

function handleKeydown(event: KeyboardEvent): void {
  if (!open.value) return
  if (event.key === 'Escape') {
    event.preventDefault()
    close(true)
    return
  }

  // Roving Tab focus stays trapped within the open popover.
  if (event.key !== 'Tab') return
  const items = focusableItems()
  if (items.length === 0) return
  event.preventDefault()
  const activeIndex = items.findIndex((item) => item === document.activeElement)
  const direction = event.shiftKey ? -1 : 1
  const nextIndex = activeIndex === -1 ? 0 : (activeIndex + direction + items.length) % items.length
  items[nextIndex]?.focus()
}

onMounted(() => {
  document.addEventListener('click', handleDocumentClick)
  document.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener('click', handleDocumentClick)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="root" class="al">
    <button
      ref="trigger"
      type="button"
      class="al-trigger"
      data-testid="app-launcher-trigger"
      :aria-label="t('app_launcher.aria_label')"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <Grid3X3 class="al-trigger__icon" :size="20" aria-hidden="true" />
    </button>

    <template v-if="open">
      <button
        type="button"
        class="al-backdrop"
        :aria-label="t('app_launcher.aria_label')"
        tabindex="-1"
        @click="close()"
      ></button>
      <div
        ref="popover"
        class="al-pop"
        :class="align === 'left' ? 'al-pop--left' : 'al-pop--right'"
        role="menu"
        :aria-label="t('app_launcher.title')"
        data-testid="app-launcher-popover"
      >
        <div class="al-head">
          <span class="al-title">{{ t('app_launcher.title') }}</span>
          <span class="al-sub">{{ t('app_launcher.subtitle') }}</span>
        </div>
        <div class="al-scroll">
          <div class="al-group" role="group" :aria-label="t('app_launcher.favorites')">
            <p class="al-group__label">{{ t('app_launcher.favorites') }}</p>
            <div class="al-grid">
              <button
                v-for="app in fav"
                :key="app.name"
                type="button"
                class="al-tile"
                role="menuitem"
                :title="app.name"
                :aria-label="app.name"
                @click="openApp(app)"
              >
                <span class="al-ico" :style="{ background: app.grad }">
                  <component :is="iconFor(app.icon)" :size="22" aria-hidden="true" />
                </span>
                <span class="al-label">{{ app.short }}</span>
              </button>
            </div>
          </div>
          <template v-if="rest.length">
            <div class="al-sep" role="separator"></div>
            <div class="al-group" role="group" :aria-label="t('app_launcher.others')">
              <p class="al-group__label">{{ t('app_launcher.others') }}</p>
              <div class="al-grid">
                <button
                  v-for="app in rest"
                  :key="app.name"
                  type="button"
                  class="al-tile"
                  role="menuitem"
                  :title="app.name"
                  :aria-label="app.name"
                  @click="openApp(app)"
                >
                  <span class="al-ico" :style="{ background: app.grad }">
                    <component :is="iconFor(app.icon)" :size="22" aria-hidden="true" />
                  </span>
                  <span class="al-label">{{ app.short }}</span>
                </button>
              </div>
            </div>
          </template>
        </div>
        <div class="al-foot">
          <a
            role="menuitem"
            class="al-foot__link"
            :href="manageAppsUrl"
            target="_blank"
            rel="noopener noreferrer"
            data-testid="app-launcher-manage"
          >
            <span>{{ t('app_launcher.manage') }}</span>
            <ExternalLink :size="14" aria-hidden="true" />
          </a>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.al {
  position: relative;
}

.al-trigger {
  display: inline-grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: var(--r-sm);
  border: 1px solid transparent;
  background: transparent;
  color: var(--fg-2);
  cursor: pointer;
  transition:
    background 0.16s,
    color 0.16s;
}

.al-trigger:hover {
  background: var(--muted);
  color: var(--fg);
}

.al-trigger:focus-visible {
  outline: 2px solid var(--primary-ring);
  outline-offset: 2px;
}

.al-trigger__icon {
  width: 20px;
  height: 20px;
}

.al-backdrop {
  position: fixed;
  inset: 0;
  z-index: 60;
  border: 0;
  padding: 0;
  background: transparent;
  cursor: default;
}

.al-pop {
  position: absolute;
  top: 48px;
  z-index: 61;
  width: min(336px, 92vw);
  background: var(--glass-bg-2);
  backdrop-filter: blur(var(--glass-blur)) saturate(1.3);
  border: 1px solid var(--glass-border);
  border-radius: var(--r-xl);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
  animation: alPop 0.16s ease;
}

.al-pop--right {
  right: 0;
}

.al-pop--left {
  left: 0;
}

@keyframes alPop {
  from {
    opacity: 0;
    transform: scale(0.96);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .al-pop {
    animation: none;
  }
  .al-tile,
  .al-ico,
  .al-trigger {
    transition: none;
  }
}

.al-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 15px 18px 6px;
}

.al-title {
  font: 700 14.5px/1 var(--font-sans);
  color: var(--fg);
  letter-spacing: -0.01em;
}

.al-sub {
  font-size: 11.5px;
  color: var(--fg-3);
}

.al-scroll {
  max-height: min(58vh, 420px);
  overflow-y: auto;
  padding: 6px;
}

.al-group__label {
  margin: 0;
  padding: 4px 10px 2px;
  font: 600 10.5px/1 var(--font-sans);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--fg-3);
}

.al-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
}

.al-tile {
  display: grid;
  justify-items: center;
  gap: 9px;
  padding: 14px 6px;
  border: 0;
  background: transparent;
  border-radius: 16px;
  cursor: pointer;
  transition: background 0.15s;
}

.al-tile:hover {
  background: var(--muted);
}

.al-tile:focus-visible {
  outline: 2px solid var(--primary-ring);
  outline-offset: -2px;
}

.al-ico {
  width: 46px;
  height: 46px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  /* Glyph rides each app's colored gradient tile (background: app.grad) — fixed light contrast. */
  color: #fff;
  box-shadow: var(--shadow-sm);
  transition: transform 0.16s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.al-tile:hover .al-ico {
  transform: translateY(-2px) scale(1.04);
}

.al-label {
  font: 600 11.5px/1.2 var(--font-sans);
  color: var(--fg);
  text-align: center;
}

.al-sep {
  height: 1px;
  background: var(--glass-hairline);
  margin: 8px 12px;
}

.al-foot {
  border-top: 1px solid var(--glass-hairline);
  padding: 7px;
}

.al-foot__link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px;
  border-radius: 12px;
  font: 600 12.5px/1 var(--font-sans);
  color: var(--primary-soft-fg);
  text-decoration: none;
}

.al-foot__link:hover {
  background: var(--muted);
}

.al-foot__link:focus-visible {
  outline: 2px solid var(--primary-ring);
  outline-offset: -2px;
}
</style>
