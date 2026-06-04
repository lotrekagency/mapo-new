<script setup lang="ts">
const drawer = ref(true);
const route = useRoute();
const auth = useMapoAuth();
const authStore = useAuthStore();
const user = computed(() => authStore.info);

const nav = [
  { title: "Dashboard", icon: "mdi-view-dashboard", to: "/" },
  { title: "News", icon: "mdi-newspaper", to: "/news" },
];

async function logout() {
  await auth.logout();
  await navigateTo("/login");
}
</script>

<template>
  <v-navigation-drawer v-model="drawer" width="240">
    <v-list-item
      title="example-custom-form"
      subtitle="Vuetify + Mapo Form"
      class="pa-4"
    />
    <v-divider />
    <v-list density="compact" nav>
      <v-list-item
        v-for="item in nav"
        :key="item.to"
        :prepend-icon="item.icon"
        :title="item.title"
        :to="item.to"
        :active="route.path === item.to || route.path.startsWith(item.to + '/')"
      />
    </v-list>
    <template #append>
      <div class="pa-3">
        <template v-if="user">
          <div class="text-caption text-medium-emphasis">Logged in as</div>
          <div class="text-body-2 mb-2">
            {{ user.username || user.email }}
          </div>
          <v-btn
            block
            size="small"
            variant="tonal"
            prepend-icon="mdi-logout"
            @click="logout"
          >
            Logout
          </v-btn>
        </template>
        <template v-else>
          <v-btn
            block
            size="small"
            color="primary"
            prepend-icon="mdi-login"
            to="/login"
          >
            Login
          </v-btn>
        </template>
      </div>
    </template>
  </v-navigation-drawer>

  <v-app-bar density="compact" elevation="1">
    <v-app-bar-nav-icon @click="drawer = !drawer" />
    <v-app-bar-title>Mapo headless · Vuetify edition</v-app-bar-title>
  </v-app-bar>

  <v-main>
    <v-container fluid class="pa-6">
      <slot />
    </v-container>
  </v-main>
</template>
