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

// FR-003: warm Discovery + JWKS caches at idle time so the first OIDC
// flow experiences a hot cache instead of a cold handshake.
warmOidcMetadata()
