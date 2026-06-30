<script setup lang="ts">
/**
 * AppLauncher.vue — SSO application launcher (9-dot waffle → app grid popover).
 * Mount in the topbar so a single source of truth propagates everywhere.
 *
 * DATA: DEFAULT_APPS is a STATIC FALLBACK SAMPLE. A parent passes a fetched list
 * via the `apps` prop once the backend exposes an apps endpoint; the footer link
 * (`manageAppsUrl`) already points at the real portal `/apps` page. Do NOT invent
 * or call an endpoint here, and do NOT present this sample as live telemetry.
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
  name: string
  short: string
  icon: string
  grad: string
  fav?: boolean
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

// Static fallback sample (replace with a fetched backend list via `apps`).
// Names are proper nouns and intentionally untranslated. `grad` is retained for
// type compatibility but Swiss tiles are flat hairline — the gradient is unused.
const DEFAULT_APPS: SsoApp[] = [
  { name: 'Akun SSO', short: 'Akun SSO', icon: 'user', grad: '', fav: true, url: '/' },
  { name: 'E-Office Bontang', short: 'E-Office', icon: 'app', grad: '', fav: true },
  { name: 'SIMPEG Kepegawaian', short: 'SIMPEG', icon: 'office', grad: '', fav: true },
  { name: 'LAPOR! Bontang', short: 'LAPOR!', icon: 'doc', grad: '', fav: true },
  { name: 'Portal Layanan Publik', short: 'Layanan', icon: 'globe', grad: '', fav: true },
  { name: 'SatuData Bontang', short: 'SatuData', icon: 'layers', grad: '', fav: true },
  { name: 'SIM RSUD Taman Husada', short: 'SIM RSUD', icon: 'pulse', grad: '' },
  { name: 'e-Absensi ASN', short: 'e-Absensi', icon: 'finger', grad: '' },
  { name: 'Arsip Digital', short: 'Arsip', icon: 'search', grad: '' },
]

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
                <span class="al-ico">
                  <component :is="iconFor(app.icon)" :size="20" aria-hidden="true" />
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
                  <span class="al-ico">
                    <component :is="iconFor(app.icon)" :size="20" aria-hidden="true" />
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
  width: 36px;
  height: 36px;
  color: var(--fg-2);
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;
}
.al-trigger:hover {
  background: var(--muted);
  color: var(--fg);
}
.al-trigger:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
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
  top: 44px;
  z-index: 61;
  width: min(336px, 92vw);
  background: var(--card);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  overflow: hidden;
}
.al-pop--right {
  right: 0;
}
.al-pop--left {
  left: 0;
}
.al-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px 8px;
  border-bottom: 1px solid var(--border);
}
.al-title {
  font: 600 0.875rem/1 var(--font-sans);
  letter-spacing: -0.01em;
  color: var(--fg);
}
.al-sub {
  font-size: 0.6875rem;
  color: var(--fg-3);
}
.al-scroll {
  max-height: min(58vh, 420px);
  overflow-y: auto;
  padding: 8px;
}
.al-group__label {
  margin: 0;
  padding: 6px 8px 4px;
  font: 500 0.625rem/1 var(--font-sans);
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: var(--fg-3);
}
.al-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
  border: 1px solid var(--border);
}
.al-tile {
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 14px 6px;
  border: 0;
  background: var(--card);
  cursor: pointer;
  transition: background 0.12s;
}
.al-tile:hover {
  background: var(--muted);
}
.al-tile:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.al-ico {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  color: var(--fg);
  background: var(--bg-2);
  border: 1px solid var(--border);
  border-radius: var(--r-sm);
}
.al-tile:hover .al-ico {
  border-color: var(--accent);
  color: var(--accent);
}
.al-label {
  font: 500 0.6875rem/1.2 var(--font-sans);
  color: var(--fg);
  text-align: center;
}
.al-sep {
  height: 8px;
}
.al-foot {
  border-top: 1px solid var(--border);
  padding: 6px;
}
.al-foot__link {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px;
  border-radius: var(--r-sm);
  font: 500 0.75rem/1 var(--font-sans);
  color: var(--accent-soft-fg);
  text-decoration: none;
}
.al-foot__link:hover {
  background: var(--muted);
}
.al-foot__link:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
@media (prefers-reduced-motion: reduce) {
  .al-tile,
  .al-trigger {
    transition: none;
  }
}
</style>
