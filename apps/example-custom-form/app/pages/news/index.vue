<script setup lang="ts">
definePageMeta({ middleware: ["auth"] });

interface NewsItem {
  id: number;
  title: string | null;
  status: string;
  publication_date: string | null;
  ordering: number;
  identifier: string | null;
}

interface Paginated<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

const headers = [
  { title: "ID", key: "id", sortable: false, width: 80 },
  { title: "Title", key: "title" },
  { title: "Status", key: "status" },
  { title: "Published", key: "publication_date" },
  { title: "Order", key: "ordering", width: 100 },
  { title: "", key: "actions", sortable: false, width: 60 },
];

const statusOptions = [
  { title: "Published", value: "PUB" },
  { title: "Draft", value: "DRF" },
  { title: "Scheduled", value: "PLA" },
  { title: "Trash", value: "TRS" },
];

const search = ref("");
const statusFilter = ref<string[]>([]);
const page = ref(1);
const itemsPerPage = ref(10);
const sortBy = ref<{ key: string; order: "asc" | "desc" }[]>([]);

// Reset to first page when filters change
watch([search, statusFilter], () => {
  page.value = 1;
});

const query = computed(() => {
  const q: Record<string, string | number | string[]> = {
    page: page.value,
    page_size: itemsPerPage.value,
  };
  if (search.value) q.search = search.value;
  if (statusFilter.value.length) q.status = statusFilter.value;
  if (sortBy.value.length) {
    const s = sortBy.value[0]!;
    q.ordering = (s.order === "desc" ? "-" : "") + s.key;
  }
  return q;
});

const ssrHeaders = import.meta.server
  ? useRequestHeaders(["cookie"])
  : undefined;

const { data, pending, error, refresh } = await useAsyncData<
  Paginated<NewsItem>
>(
  "news-list",
  () =>
    $fetch("/api/models/news/", { query: query.value, headers: ssrHeaders }),
  { watch: [query] },
);

const items = computed<NewsItem[]>(() => data.value?.results ?? []);
const total = computed(() => data.value?.count ?? 0);
</script>

<template>
  <v-row align="center" class="mb-2">
    <v-col>
      <h1 class="text-h5">News</h1>
    </v-col>
    <v-col cols="auto">
      <v-btn variant="text" icon="mdi-refresh" @click="refresh()" />
      <v-btn color="primary" prepend-icon="mdi-plus" to="/news/new">
        New
      </v-btn>
    </v-col>
  </v-row>

  <v-alert v-if="error" type="error" variant="tonal" class="mb-3" closable>
    <div class="font-weight-medium">Fetch failed</div>
    <pre class="text-caption mb-0" style="white-space: pre-wrap">{{
      error.message || error
    }}</pre>
  </v-alert>

  <v-card class="mb-3">
    <v-card-text>
      <v-row>
        <v-col cols="12" md="6">
          <v-text-field
            v-model="search"
            label="Search"
            density="comfortable"
            variant="outlined"
            prepend-inner-icon="mdi-magnify"
            hide-details
            clearable
          />
        </v-col>
        <v-col cols="12" md="6">
          <v-select
            v-model="statusFilter"
            :items="statusOptions"
            label="Status"
            multiple
            chips
            density="comfortable"
            variant="outlined"
            hide-details
          />
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>

  <v-card>
    <v-data-table-server
      v-model:page="page"
      v-model:items-per-page="itemsPerPage"
      v-model:sort-by="sortBy"
      :headers="headers"
      :items="items"
      :items-length="total"
      :loading="pending"
      item-value="id"
    >
      <template #item.title="{ item }">
        <NuxtLink :to="`/news/${item.id}`" class="text-primary">
          {{ item.title || "(no title)" }}
        </NuxtLink>
      </template>
      <template #item.status="{ item }">
        <v-chip
          size="small"
          :color="
            item.status === 'PUB'
              ? 'success'
              : item.status === 'DRF'
                ? 'warning'
                : 'default'
          "
        >
          {{ item.status }}
        </v-chip>
      </template>
      <template #item.publication_date="{ item }">
        {{
          item.publication_date
            ? new Date(item.publication_date).toLocaleDateString()
            : "—"
        }}
      </template>
      <template #item.actions="{ item }">
        <v-btn
          icon="mdi-pencil"
          size="small"
          variant="text"
          :to="`/news/${item.id}`"
        />
      </template>
    </v-data-table-server>
  </v-card>
</template>
