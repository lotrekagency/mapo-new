<script setup lang="ts">
// Development only: signs in as another account of the app's mock backend
// in one click, to see what each one gets (its keys, models, preference
// and usage) without logging out and in. It goes through Mapo's own
// login, `useMapoAuth().login()`, since the mock's password is the
// username, then reloads the app, whose pages read the previous account.
// A real backend never lets anyone in by a name: this belongs to a demo.

/** The mock's accounts (server/utils/session.ts). */
const ACCOUNTS = ["admin", "editor", "writer", "viewer"];

const isDev = import.meta.dev;
const auth = useAuthStore();
const { login } = useMapoAuth();
const switching = ref(false);

const items = ACCOUNTS.map((name) => ({ label: name, value: name }));

async function switchTo(name: string | undefined): Promise<void> {
  if (!name || name === auth.username) return;
  switching.value = true;
  try {
    await login({ username: name, password: name });
    reloadNuxtApp();
  } finally {
    switching.value = false;
  }
}
</script>

<template>
  <USelect
    v-if="isDev && auth.username"
    :model-value="auth.username"
    :items="items"
    :loading="switching"
    size="sm"
    icon="i-lucide-user-round-cog"
    aria-label="Sign in as"
    class="w-36"
    @update:model-value="switchTo"
  />
</template>
