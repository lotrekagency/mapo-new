<script setup lang="ts">
import { useAuthStore } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Dashboard",
  icon: "i-lucide-layout-dashboard",
});

const auth = useAuthStore();

const sections = [
  {
    to: "/authexample",
    icon: "i-lucide-shield-check",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    title: "Auth & Permissions",
    desc: "User info, role, model permissions and page-level permission display.",
  },
  {
    to: "/feedback",
    icon: "i-lucide-bell",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
    title: "Feedback Components",
    desc: "Snackbar messages and confirm dialog via Pinia stores.",
  },
  {
    to: "/settings",
    icon: "i-lucide-settings",
    color: "text-neutral-500",
    bg: "bg-neutral-100 dark:bg-neutral-800/40",
    title: "Settings",
    desc: "Example of a sidebarFooter page with logout action.",
  },
];
</script>

<template>
  <div class="p-6 max-w-4xl mx-auto space-y-8">
    <!-- Welcome -->
    <div class="flex items-start justify-between gap-4">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          Welcome back<span v-if="auth.username">, {{ auth.username }}</span>
        </h1>
        <p class="text-muted text-sm mt-1">
          Mapo v2 — Nuxt 4 admin framework demo app.
        </p>
      </div>
      <UBadge v-if="auth.role" color="primary" variant="soft" class="shrink-0">
        {{ auth.role }}
      </UBadge>
    </div>

    <!-- Quick stats -->
    <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      <UCard
        v-for="stat in [
          {
            label: 'Auth',
            value: auth.isAuthenticated ? 'Active' : 'None',
            icon: 'i-lucide-lock',
            ok: auth.isAuthenticated,
          },
          {
            label: 'Superuser',
            value: auth.info?.is_superuser ? 'Yes' : 'No',
            icon: 'i-lucide-star',
            ok: auth.info?.is_superuser,
          },
          {
            label: 'Permissions',
            value: auth.permissions?.length ?? 0,
            icon: 'i-lucide-key',
            ok: true,
          },
          {
            label: 'Role',
            value: auth.role ?? '—',
            icon: 'i-lucide-badge',
            ok: !!auth.role,
          },
        ]"
        :key="stat.label"
        class="text-center"
      >
        <UIcon
          :name="stat.icon"
          class="size-5 mx-auto mb-1"
          :class="stat.ok ? 'text-primary' : 'text-muted'"
        />
        <p class="text-xs text-muted">
          {{ stat.label }}
        </p>
        <p class="font-semibold text-sm text-highlighted">
          {{ stat.value }}
        </p>
      </UCard>
    </div>

    <!-- Demo sections -->
    <div>
      <h2
        class="text-sm font-semibold text-muted uppercase tracking-wider mb-3"
      >
        Demo pages
      </h2>
      <div class="grid gap-3 sm:grid-cols-3">
        <NuxtLink
          v-for="section in sections"
          :key="section.to"
          :to="section.to"
          class="group flex items-start gap-3 rounded-xl border border-default p-4 hover:border-primary/40 hover:bg-elevated transition-all"
        >
          <div
            class="size-9 rounded-lg flex items-center justify-center shrink-0"
            :class="section.bg"
          >
            <UIcon
              :name="section.icon"
              class="size-4.5"
              :class="section.color"
            />
          </div>
          <div class="min-w-0">
            <p
              class="font-medium text-sm text-highlighted group-hover:text-primary transition-colors"
            >
              {{ section.title }}
            </p>
            <p class="text-xs text-muted mt-0.5 leading-relaxed">
              {{ section.desc }}
            </p>
          </div>
        </NuxtLink>
      </div>
    </div>
  </div>
</template>
