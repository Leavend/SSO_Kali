import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router, { preloadInitialAdminRoute } from './router'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

if (typeof window !== 'undefined') {
  void preloadInitialAdminRoute(window.location.pathname)
}

app.mount('#app')
