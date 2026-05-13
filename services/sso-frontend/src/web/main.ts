import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import './styles/main.css'
import './styles/auth-shell-floating.css'

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
