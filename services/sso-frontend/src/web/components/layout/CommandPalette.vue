<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { Search, LayoutDashboard, Users, Activity, AppWindow, LogOut, X } from 'lucide-vue-next'

const router = useRouter()

const isOpen = ref(false)
const searchQuery = ref('')
const inputRef = ref<HTMLInputElement | null>(null)
const selectedIndex = ref(0)

interface Command {
  id: string
  label: string
  icon: object
  action: () => void
  category: string
}

const commands = computed<Command[]>(() => {
  const all: Command[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
      action: () => { router.push('/dashboard'); close() },
      category: 'Navigation',
    },
    {
      id: 'users',
      label: 'Users',
      icon: Users,
      action: () => { router.push('/users'); close() },
      category: 'Navigation',
    },
    {
      id: 'sessions',
      label: 'Sessions',
      icon: Activity,
      action: () => { router.push('/sessions'); close() },
      category: 'Navigation',
    },
    {
      id: 'apps',
      label: 'Applications',
      icon: AppWindow,
      action: () => { router.push('/apps'); close() },
      category: 'Navigation',
    },
    {
      id: 'logout',
      label: 'Logout',
      icon: LogOut,
      action: () => { window.location.href = '/auth/logout' },
      category: 'Actions',
    },
  ]

  if (!searchQuery.value) return all

  const query = searchQuery.value.toLowerCase()
  return all.filter(cmd =>
    cmd.label.toLowerCase().includes(query) ||
    cmd.category.toLowerCase().includes(query)
  )
})

const groupedCommands = computed(() => {
  const groups: Record<string, Command[]> = {}
  commands.value.forEach(cmd => {
    if (!groups[cmd.category]) groups[cmd.category] = []
    groups[cmd.category].push(cmd)
  })
  return groups
})

async function open() {
  isOpen.value = true
  searchQuery.value = ''
  selectedIndex.value = 0
  await nextTick()
  inputRef.value?.focus()
}

function close() {
  isOpen.value = false
  searchQuery.value = ''
}

function handleKeydown(event: KeyboardEvent) {
  if (!isOpen.value) return

  switch (event.key) {
    case 'ArrowDown':
      event.preventDefault()
      selectedIndex.value = Math.min(selectedIndex.value + 1, commands.value.length - 1)
      break
    case 'ArrowUp':
      event.preventDefault()
      selectedIndex.value = Math.max(selectedIndex.value - 1, 0)
      break
    case 'Enter':
      event.preventDefault()
      commands.value[selectedIndex.value]?.action()
      break
    case 'Escape':
      event.preventDefault()
      close()
      break
  }
}

function globalKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
    event.preventDefault()
    isOpen.value ? close() : open()
  }
}

onMounted(() => {
  document.addEventListener('keydown', globalKeydown)
})

onUnmounted(() => {
  document.removeEventListener('keydown', globalKeydown)
})

watch(searchQuery, () => {
  selectedIndex.value = 0
})
</script>

<template>
  <Teleport to="body">
    <Transition name="command-palette">
      <div
        v-if="isOpen"
        class="command-palette-backdrop"
        @click="close"
      >
        <div
          class="command-palette"
          role="dialog"
          aria-modal="true"
          aria-label="Command palette"
          @click.stop
        >
          <div class="command-palette__header">
            <Search :size="18" class="command-palette__search-icon" aria-hidden="true" />
            <input
              ref="inputRef"
              v-model="searchQuery"
              type="text"
              class="command-palette__input"
              placeholder="Ketik perintah atau cari..."
              role="combobox"
              aria-expanded="true"
              aria-controls="command-palette-listbox"
              :aria-activedescendant="commands[selectedIndex] ? `cmd-${commands[selectedIndex].id}` : undefined"
              @keydown="handleKeydown"
            />
            <button
              type="button"
              class="command-palette__close"
              aria-label="Close"
              @click="close"
            >
              <X :size="18" aria-hidden="true" />
            </button>
          </div>

          <div class="command-palette__body" id="command-palette-listbox" role="listbox">
            <template v-for="(cmds, category) in groupedCommands" :key="category">
              <div class="command-palette__category">{{ category }}</div>
              <button
                v-for="cmd in cmds"
                :key="cmd.id"
                :id="`cmd-${cmd.id}`"
                type="button"
                class="command-palette__item"
                role="option"
                :aria-selected="commands.indexOf(cmd) === selectedIndex"
                :class="{ 'command-palette__item--selected': commands.indexOf(cmd) === selectedIndex }"
                @click="cmd.action()"
                @mouseenter="selectedIndex = commands.indexOf(cmd)"
              >
                <component :is="cmd.icon" :size="18" aria-hidden="true" />
                <span>{{ cmd.label }}</span>
              </button>
            </template>

            <div v-if="commands.length === 0" class="command-palette__empty">
              Tidak ada hasil
            </div>
          </div>

          <div class="command-palette__footer">
            <span><kbd>↑↓</kbd> navigasi</span>
            <span><kbd>Enter</kbd> pilih</span>
            <span><kbd>Esc</kbd> tutup</span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Keyboard shortcut hint -->
    <button
      type="button"
      class="command-palette-trigger"
      aria-label="Buka command palette"
      @click="open"
    >
      <Search :size="16" aria-hidden="true" />
      <span class="command-palette-trigger__text">Cari...</span>
      <kbd>Ctrl+K</kbd>
    </button>
  </Teleport>
</template>

<style scoped>
.command-palette-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 15vh;
  background: rgb(0 0 0 / 60%);
  backdrop-filter: blur(4px);
}

.command-palette {
  width: 100%;
  max-width: 560px;
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-xl);
  box-shadow: 0 25px 50px var(--admin-shadow-lg);
  overflow: hidden;
}

.command-palette__header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4);
  border-bottom: 1px solid var(--admin-line);
}

.command-palette__search-icon {
  color: var(--admin-muted);
  flex-shrink: 0;
}

.command-palette__input {
  flex: 1;
  height: 36px;
  padding: 0;
  color: var(--admin-ink);
  background: transparent;
  border: 0;
  font-size: var(--text-base);
  outline: none;
}

.command-palette__input::placeholder {
  color: var(--admin-muted);
}

.command-palette__close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  padding: 0;
  color: var(--admin-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  cursor: pointer;
}

.command-palette__close:hover {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

.command-palette__body {
  max-height: 400px;
  overflow-y: auto;
  padding: var(--space-2);
}

.command-palette__category {
  padding: var(--space-2) var(--space-3);
  color: var(--admin-subtle);
  font-size: var(--text-xs);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.command-palette__item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  width: 100%;
  padding: var(--space-3) var(--space-4);
  color: var(--admin-muted);
  background: transparent;
  border: 0;
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  text-align: left;
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

.command-palette__item:hover,
.command-palette__item--selected {
  color: var(--admin-ink);
  background: var(--admin-panel-muted);
}

.command-palette__item--selected {
  background: var(--admin-accent-soft);
}

.command-palette__empty {
  padding: var(--space-8);
  text-align: center;
  color: var(--admin-muted);
}

.command-palette__footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-6);
  padding: var(--space-3);
  border-top: 1px solid var(--admin-line);
  color: var(--admin-subtle);
  font-size: var(--text-xs);
}

.command-palette__footer kbd {
  padding: 2px 6px;
  background: var(--admin-panel-muted);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 11px;
}

/* Trigger button */
.command-palette-trigger {
  display: none;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-3);
  color: var(--admin-muted);
  background: var(--admin-panel-muted);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  cursor: pointer;
  transition: all var(--duration-fast) ease;
}

@media (min-width: 769px) {
  .command-palette-trigger {
    display: flex;
  }
}

.command-palette-trigger:hover {
  color: var(--admin-ink);
  border-color: var(--admin-line-strong);
}

.command-palette-trigger__text {
  flex: 1;
}

.command-palette-trigger kbd {
  padding: 2px 6px;
  background: var(--admin-panel);
  border: 1px solid var(--admin-line);
  border-radius: var(--radius-sm);
  font-family: inherit;
  font-size: 11px;
}

/* Transition */
.command-palette-enter-active,
.command-palette-leave-active {
  transition: opacity 0.15s ease;
}

.command-palette-enter-active .command-palette,
.command-palette-leave-active .command-palette {
  transition: transform 0.15s var(--ease-out), opacity 0.15s ease;
}

.command-palette-enter-from,
.command-palette-leave-to {
  opacity: 0;
}

.command-palette-enter-from .command-palette,
.command-palette-leave-to .command-palette {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}

@media (max-width: 640px) {
  .command-palette-backdrop {
    padding-top: 0;
    align-items: flex-end;
  }

  .command-palette {
    max-width: 100%;
    border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    max-height: 80vh;
  }
}
</style>
