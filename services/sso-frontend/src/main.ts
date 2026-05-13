import './assets/styles/main.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
import { warmOidcMetadata } from '@/lib/oidc/warmer'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// Dismiss loading screen after Vue mount
const loader = document.getElementById('app-loader')
if (loader) {
  loader.classList.add('is-hidden')
  loader.addEventListener('transitionend', () => loader.remove(), { once: true })
}

// FR-003: warm Discovery + JWKS caches at idle time so the first OIDC
// flow experiences a hot cache instead of a cold handshake.
warmOidcMetadata()
