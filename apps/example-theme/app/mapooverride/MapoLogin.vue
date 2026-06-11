<script setup lang="ts">
/**
 * MapoOverride — MapoLogin
 *
 * Replaces the default login page component. Demonstrates a fully custom
 * login layout while still using useMapoAuth for the actual auth logic.
 */
import { ref } from "vue";
import { useMapoAuth } from "@mapomodule/core/runtime/auth/useMapoAuth";

const { login } = useMapoAuth();

const form = ref({ username: "", password: "" });
const loading = ref(false);
const error = ref<string | null>(null);

async function submit() {
  loading.value = true;
  error.value = null;
  try {
    await login({
      username: form.value.username,
      password: form.value.password,
    });
  } catch {
    error.value = "Invalid credentials";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-default">
    <div class="w-full max-w-sm space-y-6">
      <!-- Custom branding -->
      <div class="text-center space-y-1">
        <div
          class="inline-flex items-center justify-center size-14 rounded-2xl bg-primary/10 mb-2"
        >
          <UIcon name="i-lucide-sparkles" class="size-8 text-primary" />
        </div>
        <h1 class="text-2xl font-bold text-highlighted">Example Theme</h1>
        <p class="text-sm text-muted">Sign in to your account</p>
      </div>

      <UCard class="shadow-xl">
        <form class="space-y-4" @submit.prevent="submit">
          <UFormField label="Username">
            <UInput
              v-model="form.username"
              placeholder="admin"
              autocomplete="username"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Password">
            <UInput
              v-model="form.password"
              type="password"
              placeholder="••••••••"
              autocomplete="current-password"
              class="w-full"
            />
          </UFormField>

          <UAlert
            v-if="error"
            color="error"
            variant="soft"
            :title="error"
            icon="i-lucide-circle-x"
          />

          <UButton type="submit" class="w-full" :loading="loading" block>
            Sign in
          </UButton>
        </form>
      </UCard>

      <p class="text-center text-xs text-muted">
        This is the <strong>MapoOverride</strong> custom login page.
      </p>
    </div>
  </div>
</template>
