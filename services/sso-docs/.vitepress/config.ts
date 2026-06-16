import { defineConfig } from 'vitepress'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { withMermaid } from 'vitepress-plugin-mermaid'

const githubRepository = 'https://github.com/Leavend/SSO_Kali'

const integrationItemsId = [
  { text: 'Laravel', link: '/integrations/laravel' },
  { text: 'Next.js', link: '/integrations/nextjs' },
  { text: 'Vue.js SPA', link: '/integrations/vuejs' },
  { text: 'Express', link: '/integrations/express' },
]

const integrationItemsEn = [
  { text: 'Laravel', link: '/en/integrations/laravel' },
  { text: 'Next.js', link: '/en/integrations/nextjs' },
  { text: 'Vue.js SPA', link: '/en/integrations/vuejs' },
  { text: 'Express', link: '/en/integrations/express' },
]

const config = defineConfig({
  title: 'Dev-SSO Developer Docs',
  description: 'Dokumentasi integrasi OpenID Connect untuk aplikasi pihak ketiga',

  mermaid: {
    theme: 'base',
    securityLevel: 'strict',
    sequence: {
      mirrorActors: false,
      wrap: true,
      width: 140,
    },
    themeVariables: {
      primaryColor: '#eef2ff',
      primaryBorderColor: '#6366f1',
      primaryTextColor: '#1f2937',
      lineColor: '#6366f1',
      actorBorder: '#6366f1',
      actorTextColor: '#1f2937',
      noteBkgColor: '#f5f3ff',
      noteTextColor: '#1f2937',
    },
  },

  locales: {
    root: {
      lang: 'id',
      label: 'Bahasa Indonesia',
      title: 'Dev-SSO Developer Docs',
      description: 'Dokumentasi integrasi OpenID Connect untuk aplikasi pihak ketiga',
      themeConfig: {
        nav: [
          { text: 'Mulai', link: '/' },
          { text: 'Onboarding', link: '/onboarding' },
          { text: 'Integrasi', items: integrationItemsId },
          { text: 'API Reference', link: '/api-reference' },
          { text: 'Security', link: '/security-model' },
        ],
        sidebar: [
          {
            text: 'Mulai',
            items: [
              { text: 'Overview', link: '/' },
              { text: 'Onboarding', link: '/onboarding' },
            ],
          },
          { text: 'Integrasi', items: integrationItemsId },
          {
            text: 'Referensi',
            items: [
              { text: 'API Reference', link: '/api-reference' },
              { text: 'Scopes & Claims', link: '/scopes-and-claims' },
              { text: 'Errors & FAQ', link: '/errors' },
            ],
          },
          {
            text: 'Keamanan',
            items: [
              { text: 'Security Model', link: '/security-model' },
              { text: 'Resource Server', link: '/resource-server' },
            ],
          },
        ],
        footer: {
          message: 'Dirilis dengan lisensi MIT.',
          copyright: 'Copyright © 2026 Dev-SSO Team',
        },
        docFooter: {
          prev: 'Halaman sebelumnya',
          next: 'Halaman selanjutnya',
        },
        outline: { label: 'Di halaman ini' },
        returnToTopLabel: 'Kembali ke atas',
        skipToContentLabel: 'Lewati ke konten',
        langMenuLabel: 'Ganti bahasa',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Tema',
        lightModeSwitchTitle: 'Beralih ke mode terang',
        darkModeSwitchTitle: 'Beralih ke mode gelap',
      },
    },
    en: {
      lang: 'en',
      label: 'English',
      link: '/en/',
      title: 'Dev-SSO Developer Docs',
      description: 'OpenID Connect integration documentation for third-party applications',
      themeConfig: {
        nav: [
          { text: 'Start', link: '/en/' },
          { text: 'Onboarding', link: '/en/onboarding' },
          { text: 'Integrations', items: integrationItemsEn },
          { text: 'API Reference', link: '/en/api-reference' },
          { text: 'Security', link: '/en/security-model' },
        ],
        sidebar: [
          {
            text: 'Start',
            items: [
              { text: 'Overview', link: '/en/' },
              { text: 'Onboarding', link: '/en/onboarding' },
            ],
          },
          { text: 'Integrations', items: integrationItemsEn },
          {
            text: 'Reference',
            items: [
              { text: 'API Reference', link: '/en/api-reference' },
              { text: 'Scopes & Claims', link: '/en/scopes-and-claims' },
              { text: 'Errors & FAQ', link: '/en/errors' },
            ],
          },
          {
            text: 'Security',
            items: [
              { text: 'Security Model', link: '/en/security-model' },
              { text: 'Resource Server', link: '/en/resource-server' },
            ],
          },
        ],
        footer: {
          message: 'Released under the MIT License.',
          copyright: 'Copyright © 2026 Dev-SSO Team',
        },
        docFooter: {
          prev: 'Previous page',
          next: 'Next page',
        },
        outline: { label: 'On this page' },
        returnToTopLabel: 'Return to top',
        skipToContentLabel: 'Skip to content',
        langMenuLabel: 'Change language',
        sidebarMenuLabel: 'Menu',
        darkModeSwitchLabel: 'Theme',
        lightModeSwitchTitle: 'Switch to light theme',
        darkModeSwitchTitle: 'Switch to dark theme',
      },
    },
  },

  sitemap: {
    hostname: 'https://docs.sso.timeh.my.id',
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
    socialLinks: [{ icon: 'github', link: githubRepository }],
    search: { provider: 'local' },
  },

  /**
   * Expose raw markdown source to client for integration pages only.
   * The CopyPageButton component reads frontmatter.rawMarkdown to
   * enable one-click copying of the page content (e.g. for pasting
   * into an LLM or issue tracker).
   *
   * Note: ctx (TransformPageContext) only exposes { siteConfig }, not
   * the raw content — so we read the source file from disk directly.
   */
  transformPageData(pageData, ctx) {
    if (pageData.relativePath.includes('integrations/')) {
      const raw = readFileSync(
        join(ctx.siteConfig.srcDir, pageData.filePath),
        'utf-8',
      )
      // Strip frontmatter block (--- ... ---) so users get clean markdown
      pageData.frontmatter.rawMarkdown = raw.replace(/^---[\s\S]*?---\n*/g, '')
    }
  },
})

export default withMermaid(config)
