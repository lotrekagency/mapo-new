# Auth & permissions

How to set up authentication, protect routes, and gate UI elements based on what the current user can do.

## Login page

```vue
<!-- pages/login.vue -->
<script setup lang="ts">
definePageMeta({ layout: false });
</script>

<template>
  <MapoLogin />
</template>
```

`MapoLogin` handles the form, POST to `mapo.authLoginUrl`, user fetch, and redirect. It reads `?redirect=` from the URL so the `auth` middleware's automatic redirect works without any extra code.

### Custom login UI

If you need a fully custom design, call `useMapoAuth()` directly:

```vue
<script setup lang="ts">
definePageMeta({ layout: false });

const { login } = useMapoAuth();
const loading = ref(false);
const error = ref<string | null>(null);

async function submit(username: string, password: string) {
  loading.value = true;
  error.value = null;
  try {
    await login({ username, password });
    const route = useRoute();
    await navigateTo(String(route.query.redirect ?? "/"));
  } catch {
    error.value = "Invalid credentials.";
  } finally {
    loading.value = false;
  }
}
</script>
```

### Login slots

Add a custom logo or footer link without replacing the whole form:

```vue
<MapoLogin>
  <template #header>
    <div class="flex flex-col items-center gap-3">
      <img src="~/assets/logo.svg" class="h-10" alt="Acme" />
      <h1 class="text-xl font-semibold">Acme Admin</h1>
    </div>
  </template>

  <template #footer>
    <p class="text-center text-sm text-muted">
      <a href="/password-reset" class="underline">Forgot password?</a>
    </p>
  </template>
</MapoLogin>
```

## Protecting routes

Add `middleware: ["auth"]` to any page to redirect unauthenticated users to the login page:

```ts
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth"],
  label: "Articles",
  icon: "i-lucide-newspaper",
});
```

The middleware appends `?redirect=/articles` so the user lands back on the right page after login.

## Permissions — model-based (recommended)

Use `{ model: "article" }` to derive Django-style CRUD permissions for a model. After navigation, `authStore.pagePermissions[routeName]` is populated with the actions the user actually has (`"add"`, `"view"`, `"change"`, `"delete"`).

```ts
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth", "permissions"],
  label: "Articles",
  icon: "i-lucide-newspaper",
  permissions: { model: "article" },
});
```

Read the actions in the component:

```vue
<script setup lang="ts">
const auth = useAuthStore();
const route = useRoute();

const pagePerms = computed(
  () => auth.pagePermissions[String(route.name)] ?? [],
);
</script>

<template>
  <div>
    <!-- Only users with "add" can create -->
    <UButton v-if="pagePerms.includes('add')" to="/articles/new">
      New article
    </UButton>

    <!-- Only users with "delete" see the delete button -->
    <UButton
      v-if="pagePerms.includes('delete')"
      color="error"
      @click="deleteArticle(id)"
    >
      Delete
    </UButton>
  </div>
</template>
```

How the mapping works under the hood:

```
User has: ["view_article", "change_article"]
  → pagePermissions["articles-index"] = ["view", "change"]
```

## Permissions — explicit codenames

For fine-grained control outside Django's default convention:

```ts
definePageMeta({
  middleware: ["auth", "permissions"],
  permissions: ["view_article", "change_article"], // must have ALL of these
});
```

This checks the raw permission codenames directly. It does **not** populate `pagePermissions`.

## Role-based access

```ts
definePageMeta({
  middleware: ["auth", "roles"],
  roles: ["editor", "admin"], // user must belong to at least one
});
```

## Checking permissions in composables

```ts
const { can, hasRole } = usePermissions();

can("change", "article"); // true if user has change_article
can("delete", "article");
hasRole("editor");
hasRole(["editor", "admin"]); // true if user has any of these roles
```

## Reading user info

```ts
const auth = useAuthStore();

auth.isAuthenticated; // boolean
auth.username; // string | null
auth.role; // first group name | null
auth.info?.email;
auth.info?.is_superuser;
auth.info?.groups; // string[]
auth.permissions; // string[] — all raw codenames (getter alias for rawPermissions)
```

## Full page example

Showing user info and page permissions side by side:

```vue
<script setup lang="ts">
definePageMeta({
  layout: "mapo-default",
  middleware: ["auth", "permissions"],
  label: "Dashboard",
  icon: "i-lucide-layout-dashboard",
  permissions: { model: "article" },
});

const auth = useAuthStore();
const route = useRoute();
const pagePerms = computed(
  () => auth.pagePermissions[String(route.name)] ?? [],
);
</script>

<template>
  <UContainer class="py-8">
    <UCard>
      <template #header>User Info</template>
      <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
        <dt class="text-muted">Username</dt>
        <dd>{{ auth.username }}</dd>
        <dt class="text-muted">Role</dt>
        <dd>{{ auth.role ?? "—" }}</dd>
        <dt class="text-muted">Superuser</dt>
        <dd>{{ auth.info?.is_superuser }}</dd>
      </dl>
    </UCard>

    <UCard class="mt-4">
      <template #header>Page Permissions (article model)</template>
      <div class="flex flex-wrap gap-2">
        <UBadge
          v-for="action in pagePerms"
          :key="action"
          variant="subtle"
          color="primary"
        >
          {{ action }}
        </UBadge>
        <span v-if="!pagePerms.length" class="text-muted text-sm">None</span>
      </div>
    </UCard>
  </UContainer>
</template>
```

→ See also: [First admin page](./first-admin-page), [Core module — middleware API](/modules/core)
