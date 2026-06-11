import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'Dev-SSO Developer Docs',
  description: 'Dokumentasi integrasi OpenID Connect untuk aplikasi pihak ketiga',
  lang: 'id',
  
  sitemap: {
    hostname: 'https://docs.sso.timeh.my.id'
  },

  head: [
    ['meta', { name: 'theme-color', content: '#6366f1' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'Dev-SSO Developer Docs' }],
    ['meta', { name: 'og:site_name', content: 'Dev-SSO Developer Docs' }],
    ['meta', { name: 'og:url', content: 'https://docs.sso.timeh.my.id/' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'Dev-SSO Docs',
    
    nav: [
      { text: 'Mulai', link: '/' },
      { text: 'Onboarding', link: '/onboarding' },
      { text: 'API Reference', link: '/api-reference' },
      { text: 'Scopes & Claims', link: '/scopes-and-claims' },
      { text: 'Errors & FAQ', link: '/errors' },
      { text: 'Security', link: '/security-model' },
      { text: 'Resource Server', link: '/resource-server' },
    ],

    sidebar: [
      {
        text: 'Mulai',
        items: [
          { text: 'Overview', link: '/' },
          { text: 'Onboarding', link: '/onboarding' },
        ]
      },
      {
        text: 'Referensi',
        items: [
          { text: 'API Reference', link: '/api-reference' },
          { text: 'Scopes & Claims', link: '/scopes-and-claims' },
          { text: 'Errors & FAQ', link: '/errors' },
        ]
      },
      {
        text: 'Keamanan',
        items: [
          { text: 'Security Model', link: '/security-model' },
          { text: 'Resource Server', link: '/resource-server' },
        ]
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/leavend/sso-kali' }
    ],

    search: {
      provider: 'local'
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2026 Dev-SSO Team'
    },

    editLink: {
      pattern: ({ relativePath }) => {
        // Map onboarding.md to its actual source location
        if (relativePath === 'onboarding.md') {
          return 'https://github.com/leavend/sso-kali/edit/main/docs/onboarding/client-web-app-onboarding.md'
        }
        // All other pages come from docs/developers/
        return `https://github.com/leavend/sso-kali/edit/main/docs/developers/${relativePath}`
      },
      text: 'Edit halaman ini di GitHub'
    },

    lastUpdated: {
      text: 'Terakhir diperbarui',
      formatOptions: {
        dateStyle: 'full',
        timeStyle: 'short'
      }
    },

    docFooter: {
      prev: 'Halaman sebelumnya',
      next: 'Halaman selanjutnya'
    },

    outline: {
      label: 'Di halaman ini'
    },

    returnToTopLabel: 'Kembali ke atas',
    sidebarMenuLabel: 'Menu',
    darkModeSwitchLabel: 'Tema',
    lightModeSwitchTitle: 'Beralih ke mode terang',
    darkModeSwitchTitle: 'Beralih ke mode gelap',
  }
})
