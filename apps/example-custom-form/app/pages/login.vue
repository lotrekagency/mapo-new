<script setup lang="ts">
definePageMeta({ layout: false });

const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const auth = useMapoAuth();

async function submit() {
  error.value = null;
  loading.value = true;
  try {
    await auth.login({ username: username.value, password: password.value });
    await navigateTo("/");
  } catch (e: unknown) {
    const err = e as { data?: { detail?: string }; message?: string };
    error.value = err?.data?.detail ?? err?.message ?? "Login failed";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <v-container class="fill-height" fluid>
    <v-row justify="center" align="center">
      <v-col cols="12" sm="8" md="4">
        <v-card>
          <v-card-title>Sign in</v-card-title>
          <v-card-text>
            <v-form @submit.prevent="submit">
              <v-text-field
                v-model="username"
                label="Username"
                variant="outlined"
                density="comfortable"
                autocomplete="username"
              />
              <v-text-field
                v-model="password"
                label="Password"
                type="password"
                variant="outlined"
                density="comfortable"
                autocomplete="current-password"
              />
              <v-alert
                v-if="error"
                type="error"
                variant="tonal"
                density="compact"
                class="mb-3"
              >
                {{ error }}
              </v-alert>
              <v-btn type="submit" color="primary" block :loading="loading">
                Login
              </v-btn>
            </v-form>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>
