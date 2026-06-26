import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'
// Design tokens (Bontang DS) must load before main.css so the Tailwind semantic
// vars in main.css can re-point onto them. Keep this import first among styles.
import './assets/tokens.css'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
