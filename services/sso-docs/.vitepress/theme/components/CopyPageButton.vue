<script setup lang="ts">
import { ref, computed } from 'vue'
import { useData } from 'vitepress'

const { page, lang } = useData()

const rawMarkdown = computed<string | null>(
  () => page.value.frontmatter?.rawMarkdown ?? null,
)

const isVisible = computed(() => rawMarkdown.value !== null)

const isCopied = ref(false)
const isCopying = ref(false)

const label = computed(() =>
  lang.value === 'en' ? 'Copy page' : 'Salin halaman',
)

const copiedLabel = computed(() =>
  lang.value === 'en' ? 'Copied ✓' : 'Disalin ✓',
)

const ariaLabel = computed(() =>
  lang.value === 'en' ? 'Copy page content to clipboard' : 'Salin konten halaman ke papan klip',
)

async function copyContent(): Promise<void> {
  const text = rawMarkdown.value
  if (!text || isCopying.value) return

  isCopying.value = true

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text)
    } else {
      // Fallback for non-secure context
      const textarea = document.createElement('textarea')
      textarea.value = text
      textarea.style.position = 'fixed'
      textarea.style.opacity = '0'
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }

    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  } catch {
    isCopied.value = false
  } finally {
    isCopying.value = false
  }
}
</script>

<template>
  <button
    v-if="isVisible"
    class="vp-copy-page-button"
    type="button"
    :aria-label="ariaLabel"
    :disabled="isCopying"
    @click="copyContent"
  >
    <!-- Clipboard copy icon -->
    <svg
      v-if="!isCopied"
      class="vp-copy-page-button__icon"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
    <!-- Check icon (copied state) -->
    <svg
      v-else
      class="vp-copy-page-button__check"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
    <span class="vp-copy-page-button__label">{{ isCopied ? copiedLabel : label }}</span>
  </button>
</template>
