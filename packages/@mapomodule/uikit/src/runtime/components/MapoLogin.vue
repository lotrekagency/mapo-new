<script setup lang="ts">
import { reactive, ref } from "vue";
import { useMapoAuth } from "@mapomodule/core/runtime/auth/useMapoAuth";
import { useRoute, navigateTo } from "#app";

defineSlots<{
  /** Left decorative panel (shown lg+). Replace with your own branding. */
  panel(): unknown;
  /** Logo / title area above the login form. */
  brand(): unknown;
  /** Content injected between the brand slot and the login form card. */
  "before-form"(): unknown;
  /** Content injected between the login form card and the footer slot. */
  "after-form"(): unknown;
  /** Content below the login card (links, copyright…). */
  footer(): unknown;
}>();

const { login } = useMapoAuth();
const route = useRoute();

const form = reactive({ username: "", password: "" });
const error = ref<string | null>(null);
const fieldErrors = reactive<{ username?: string; password?: string }>({});
const loading = ref(false);

async function submit() {
  error.value = null;
  fieldErrors.username = undefined;
  fieldErrors.password = undefined;
  loading.value = true;
  try {
    await login(form);
    const redirect = (route.query.redirect as string) ?? "/";
    await navigateTo(redirect);
  } catch (e: unknown) {
    const data = (e as { data?: { username?: string[]; password?: string[] } })
      ?.data;
    if (data?.username || data?.password) {
      if (data.username?.length) fieldErrors.username = data.username[0];
      if (data.password?.length) fieldErrors.password = data.password[0];
    } else {
      error.value = "Invalid credentials. Please try again.";
    }
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="flex h-full min-h-screen bg-default">
    <!-- Left decorative panel (lg+) -->
    <div
      class="hidden lg:flex lg:w-1/2 relative flex-col items-center justify-center overflow-hidden bg-primary"
    >
      <div class="absolute inset-0 pointer-events-none overflow-hidden">
        <div
          class="absolute -top-40 -left-40 size-96 rounded-full bg-white/10 blur-3xl"
        />
        <div
          class="absolute -bottom-32 -right-32 size-80 rounded-full bg-black/15 blur-3xl"
        />
        <div
          class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-72 rounded-full bg-white/5 blur-2xl"
        />
      </div>

      <slot name="panel">
        <div
          class="relative z-10 flex flex-col items-center gap-6 px-12 text-center text-white"
        >
          <div
            class="size-20 rounded-3xl bg-white/20 backdrop-blur-sm ring-1 ring-white/30 flex items-center justify-center"
          >
            <UIcon name="i-lucide-layers" class="size-10 text-white" />
          </div>
          <div class="space-y-2">
            <h2 class="text-3xl font-bold tracking-tight">Welcome to Mapo</h2>
            <p class="text-white/70 text-sm leading-relaxed max-w-xs">
              A modern admin framework built on Nuxt 4, Pinia, and Nuxt UI v4.
            </p>
          </div>
          <div class="flex gap-2 flex-wrap justify-center">
            <span
              v-for="tag in [
                'Nuxt 4',
                'Pinia',
                'Nuxt UI v4',
                'Tailwind v4',
                'TypeScript',
              ]"
              :key="tag"
              class="px-3 py-1 rounded-full bg-white/10 text-xs font-medium text-white/80 ring-1 ring-white/20"
              >{{ tag }}</span
            >
          </div>
        </div>
      </slot>
    </div>

    <!-- Right: login form -->
    <div
      class="flex flex-1 flex-col items-center justify-center px-6 py-12 relative"
    >
      <div
        class="pointer-events-none absolute inset-0 overflow-hidden lg:hidden"
      >
        <div
          class="absolute -top-32 -right-32 size-96 rounded-full bg-primary/6 blur-3xl"
        />
        <div
          class="absolute -bottom-32 -left-32 size-80 rounded-full bg-primary/4 blur-3xl"
        />
      </div>

      <div class="relative z-10 w-full max-w-sm space-y-8">
        <slot name="brand">
          <div class="flex flex-col items-center gap-3 text-center">
            <div
              class="lg:hidden size-12 rounded-2xl bg-primary/10 ring-1 ring-primary/20 flex items-center justify-center"
            >
              <UIcon name="i-lucide-layers" class="size-6 text-primary" />
            </div>
            <div>
              <h1 class="text-2xl font-bold text-highlighted tracking-tight">
                Sign in
              </h1>
              <p class="text-sm text-muted mt-1">
                Enter your credentials to continue
              </p>
            </div>
          </div>
        </slot>

        <slot name="before-form" />

        <UCard class="shadow-xl ring-1 ring-default/60">
          <form class="space-y-5" @submit.prevent="submit">
            <UFormField
              label="Username"
              name="username"
              :error="fieldErrors.username"
            >
              <UInput
                v-model="form.username"
                placeholder="username"
                autocomplete="username"
                :disabled="loading"
                :color="fieldErrors.username ? 'error' : undefined"
                leading-icon="i-lucide-user"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <UFormField
              label="Password"
              name="password"
              :error="fieldErrors.password"
            >
              <UInput
                v-model="form.password"
                type="password"
                placeholder="••••••••"
                autocomplete="current-password"
                :disabled="loading"
                :color="fieldErrors.password ? 'error' : undefined"
                leading-icon="i-lucide-lock"
                size="lg"
                class="w-full"
              />
            </UFormField>

            <Transition
              enter-active-class="transition duration-200 ease-out"
              enter-from-class="opacity-0 -translate-y-1"
              leave-active-class="transition duration-150 ease-in"
              leave-to-class="opacity-0 -translate-y-1"
            >
              <UAlert
                v-if="error"
                color="error"
                variant="subtle"
                :description="error"
                icon="i-lucide-alert-circle"
              />
            </Transition>

            <UButton
              type="submit"
              size="lg"
              :loading="loading"
              :disabled="!form.username || !form.password"
              block
            >
              Sign in
            </UButton>
          </form>
        </UCard>

        <slot name="after-form" />

        <slot name="footer" />
      </div>
    </div>
  </div>
</template>
