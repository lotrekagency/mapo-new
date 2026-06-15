<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });
</script>

<template>
  <v-row>
    <v-col cols="12">
      <h1 class="text-h4 mb-2">Headless test bench</h1>
      <p class="text-body-1 text-medium-emphasis">
        This app intentionally avoids <code>@nuxt/ui</code> and Tailwind. The
        form engine from <code>@mapomodule/form</code> is wired to Vuetify field
        wrappers via a custom <code>$mapoFormRegistry</code>.
      </p>
    </v-col>
    <v-col cols="12" md="6">
      <v-card>
        <v-card-title>News</v-card-title>
        <v-card-text>
          List + detail rebuilt with <code>v-data-table-server</code> and
          <code>useMapoForm</code> + <code>&lt;MapoFormField&gt;</code>.
        </v-card-text>
        <v-card-actions>
          <v-btn color="primary" variant="tonal" to="/news"> Open </v-btn>
        </v-card-actions>
      </v-card>
    </v-col>
  </v-row>
</template>
