<script setup lang="ts">
// Landing page — lists all E2E test pages so a tester can navigate quickly.
definePageMeta({
  layout: "mapo-default",
  icon: "i-lucide-home",
  label: "Home",
});

const sections = [
  {
    title: "Form Engine",
    icon: "i-lucide-layout-list",
    items: [
      {
        label: "NUI Wrappers",
        to: "/form/nui-wrappers",
        desc: "text/email/url/number/textarea/slider/checkbox/select/switch",
      },
      {
        label: "Form Engine",
        to: "/form/form-engine",
        desc: "v-model, dirty tracking, getPatch, resetDirty, submit flow",
      },
      {
        label: "Validation",
        to: "/form/validation",
        desc: "required, type-based, sync/async validators, cross-field",
      },
      {
        label: "Progressive Disclosure",
        to: "/form/progressive-disclosure",
        desc: "when/whenAny/whenNot/matchesField/isOneOf/greaterThan",
      },
      {
        label: "Repeater",
        to: "/form/repeater",
        desc: "add/remove/reorder/duplicate/miniCard/bulk/undo/readonly",
      },
      {
        label: "Draft Autosave",
        to: "/form/draft",
        desc: "localStorage debounce, TTL, restore banner, clearDraft",
      },
      {
        label: "Form Slots",
        to: "/form/slots",
        desc: "#field.key full override + granular sub-slots",
      },
      {
        label: "Schema → Form",
        to: "/form/schema-to-form",
        desc: "useFormFromSchema — JSON Schema to FieldDescriptor[]",
      },
      {
        label: "Custom Fields",
        to: "/form/custom-fields",
        desc: "defineFormField, registry, accessor, unknown type fallback",
      },
      {
        label: "Focus Mode",
        to: "/form/focus-mode",
        desc: "MapoFocusPortal + useFocusMode — full-screen item overlay",
      },
      {
        label: "Field Expand",
        to: "/form/field-expand",
        desc: "expandable: true — compact + expanded views",
      },
    ],
  },
  {
    title: "UIKit",
    icon: "i-lucide-layout-dashboard",
    items: [
      {
        label: "Sidebar",
        to: "/sidebar-parent",
        desc: "Nested menus, mini mode, permission filtering",
      },
      {
        label: "Feedback",
        to: "/feedback",
        desc: "SnackBar types and ConfirmDialog flows",
      },
      {
        label: "Layout slots",
        to: "/layout-slots",
        desc: "sidebar:logo, topbar:right and other layout slots",
      },
    ],
  },
  {
    title: "Auth & Middleware",
    icon: "i-lucide-shield",
    items: [
      {
        label: "Auth store",
        to: "/auth",
        desc: "User info, permissions, hasPermission, pagePermissions",
      },
      {
        label: "Permissions (model)",
        to: "/permissions-model",
        desc: "meta.permissions = { model: 'article' }",
      },
      {
        label: "Permissions (raw)",
        to: "/permissions-raw",
        desc: "meta.permissions = ['view_article']",
      },
      {
        label: "Roles (admin group)",
        to: "/roles-admin",
        desc: "meta.roles = ['admin'] — only admin group can enter",
      },
    ],
  },
  {
    title: "Store",
    icon: "i-lucide-database",
    items: [
      {
        label: "Store inspector",
        to: "/store",
        desc: "Sidebar toggle, sidebar mini, snack queue, confirm queue",
      },
    ],
  },
  {
    title: "Settings (footer)",
    icon: "i-lucide-settings",
    items: [
      {
        label: "Settings",
        to: "/settings",
        desc: "sidebarFooter: true — appears at the bottom of the sidebar",
      },
    ],
  },
] as const;
</script>

<template>
  <!-- Tests: sidebar renders meta.label, active route is highlighted, icon shown -->
  <UContainer class="py-8 max-w-3xl">
    <h1 class="text-2xl font-bold mb-2 text-highlighted">
      Mapo v2 — E2E Test App
    </h1>
    <p class="text-muted text-sm mb-8">
      Navigate to a test page from the sidebar or the cards below. Login
      credentials: <code class="bg-elevated px-1 rounded">admin/admin</code>,
      <code class="bg-elevated px-1 rounded">editor/editor</code>,
      <code class="bg-elevated px-1 rounded">viewer/viewer</code>.
    </p>

    <div class="space-y-6">
      <div v-for="section in sections" :key="section.title">
        <div class="flex items-center gap-2 mb-3">
          <UIcon :name="section.icon" class="size-4 text-primary" />
          <h2
            class="font-semibold text-sm text-highlighted uppercase tracking-wide"
          >
            {{ section.title }}
          </h2>
        </div>
        <div class="grid gap-2 sm:grid-cols-2">
          <NuxtLink
            v-for="item in section.items"
            :key="item.to"
            :to="item.to"
            class="block rounded-xl border border-default p-4 hover:border-primary/40 hover:bg-elevated transition-all"
          >
            <div class="font-medium text-sm text-highlighted">
              {{ item.label }}
            </div>
            <div class="text-xs text-muted mt-0.5">
              {{ item.desc }}
            </div>
          </NuxtLink>
        </div>
      </div>
    </div>
  </UContainer>
</template>
