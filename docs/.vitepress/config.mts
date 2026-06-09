import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  base: process.env.BASE_URL ?? '/',
  title: 'Mapo',
  description: 'Mapo v2 — Vue 3 / Nuxt 4 admin framework',
  ignoreDeadLinks: true,

  head: [
    ['meta', { name: 'theme-color', content: '#16a34a' }],
  ],

  themeConfig: {
    logo: { src: '/logo.svg', alt: 'Mapo' },

    nav: [
      { text: 'How-to', link: '/howto/' },
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'UIKit', link: '/uikit/' },
      { text: 'Modules', link: '/modules/core' },
      { text: 'Integrations', link: '/modules/camomilla' },
      { text: 'Migration', link: '/migration/v1-to-v2' },
    ],

    sidebar: [
      {
        text: 'How-to Recipes',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/howto/' },
          { text: 'First admin page', link: '/howto/first-admin-page' },
          { text: 'CRUD list view', link: '/howto/crud-list' },
          { text: 'CRUD detail / form', link: '/howto/crud-detail' },
          { text: 'Auth & permissions', link: '/howto/auth-permissions' },
          { text: 'Feedback: toasts & dialogs', link: '/howto/feedback' },
          { text: 'Theming & customization', link: '/howto/theming' },
          { text: 'Standalone form', link: '/howto/form-standalone' },
          { text: 'Advanced form patterns', link: '/howto/form-advanced' },
          { text: 'Custom backend integration', link: '/howto/backend-integration' },
        ],
      },
      {
        text: 'Guide',
        collapsed: false,
        items: [
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Compatibility & Troubleshooting', link: '/guide/compatibility' },
          { text: 'Feature Status', link: '/guide/feature-status' },
          { text: 'Architecture & Flows', link: '/guide/architecture-flows' },
          { text: 'Known Limitations', link: '/guide/known-limitations' },
          { text: 'Release Process', link: '/guide/release-process' },
          { text: 'Contributing', link: '/guide/contributing' },
        ],
      },
      {
        text: 'UIKit',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/uikit/' },
          { text: 'Theming', link: '/uikit/theming' },
          { text: 'MapoOverride System', link: '/uikit/mapoverride' },
          { text: 'Layout', link: '/uikit/layout' },
          { text: 'Sidebar', link: '/uikit/sidebar' },
          { text: 'Topbar', link: '/uikit/topbar' },
          { text: 'Login', link: '/uikit/login' },
          { text: 'Feedback (Snack & Confirm)', link: '/uikit/feedback' },
          { text: 'List', link: '/uikit/list' },
          { text: 'Detail', link: '/uikit/detail' },
          { text: 'Component API', link: '/uikit/api' },
        ],
      },
      {
        text: 'Form Engine',
        collapsed: false,
        items: [
          { text: 'Quickstart', link: '/uikit/form/' },
          { text: 'All field types', link: '/uikit/form/add-fields' },
          { text: 'Custom fields', link: '/uikit/form/custom-fields' },
          { text: 'Registry (attrs, accessor)', link: '/uikit/form/registry' },
          { text: 'Slot system', link: '/uikit/form/slots' },
          { text: 'i18n — Translated fields', link: '/uikit/form/i18n' },
          { text: 'Validation', link: '/uikit/form/validation' },
          { text: 'Progressive Disclosure', link: '/uikit/form/progressive-disclosure' },
          { text: 'Focus Mode', link: '/uikit/form/focus-mode' },
          { text: 'Field Expand', link: '/uikit/form/field-expand' },
          { text: 'Draft autosave', link: '/uikit/form/draft' },
          { text: 'From JSON Schema', link: '/uikit/form/schema-to-form' },
          { text: 'useMapoForm() — reference', link: '/uikit/form/composable' },
          { text: 'Devtools panel', link: '/uikit/form/devtools' },
          { text: 'Component API', link: '/uikit/form/api' },
        ],
      },
      {
        text: 'Modules',
        collapsed: false,
        items: [
          { text: 'Core', link: '/modules/core' },
          { text: 'Store', link: '/modules/store' },
          { text: 'Utils', link: '/modules/utils' },
          { text: 'Composable & Function API', link: '/modules/api' },
        ],
      },
      {
        text: 'Backend Integrations',
        collapsed: false,
        items: [
          { text: 'Camomilla CMS', link: '/modules/camomilla' },
          { text: 'Writing your own', link: '/modules/integrations-howto' },
        ],
      },
      {
        text: 'Migration',
        collapsed: false,
        items: [
          { text: 'v1 → v2', link: '/migration/v1-to-v2' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/lotrekagency/mapo' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Lotrek Agency',
    },

    search: {
      provider: 'local',
    },
  },
})
