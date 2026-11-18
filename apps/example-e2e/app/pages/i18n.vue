<script setup lang="ts">
/**
 * i18n — UI translations.
 *
 * Covers:
 *   ✅ `MapoLangSwitcher` (also mounted in the topbar via app.vue)
 *   ✅ switching locale imperatively with `setLocale`
 *   ✅ Mapo built-in keys re-used in app code (`t('mapo.*')`)
 *   ✅ app-level override of a Mapo key (see i18n/locales/*.json)
 *   ✅ interpolation and pluralization
 *   ✅ `useMapoT()` — the translator for non-component contexts (auto-imported)
 *   ✅ live proof that UIKit components follow the locale
 *   ✅ `mapo.uikit.contentLanguages` — the content languages editors switch between
 */
definePageMeta({
  layout: "mapo-default",
  label: "i18n",
  icon: "i-lucide-languages",
  middleware: ["auth"],
});

const { t, locale, locales, setLocale } = useI18n();
const snack = useSnackStore();
const confirm = useConfirmStore();

// Same translator, resolved the way a store or a plain helper would.
const tOutside = useMapoT();

const itemCount = ref(1);

// `mapo.uikit.contentLanguages`, as the app received it (an environment
// variable can set it: see nuxt.config.ts).
const runtimeConfig = useRuntimeConfig();
const contentLanguages = computed(
  () =>
    (
      runtimeConfig.public.mapoUikit as
        | { contentLanguages?: string[] }
        | undefined
    )?.contentLanguages ?? [],
);

// Pages whose language tabs follow the option.
const contentLanguagePages = [
  { to: "/form/article/1", label: "Articolo (MapoDetail)" },
  { to: "/menu/1", label: "Menu (MapoMenuManager)" },
  { to: "/media/gallery", label: "Media (editor)" },
];

const builtinKeys = [
  "mapo.save",
  "mapo.cancel",
  "mapo.delete",
  "mapo.search",
  "mapo.confirmDelete",
  "mapo.listTable.noItems",
  "mapo.menuTreeview.noRootNodes",
  "mapo.mediaGallery.noMediaFound",
];

function showSnack() {
  // Imperative message built outside a template — the pattern a store uses.
  snack.show(tOutside("mapo.saveSuccess"), "success");
}

async function askConfirm() {
  const ok = await confirm.ask({
    title: tOutside("mapo.delete"),
    message: tOutside("mapo.confirmDelete"),
    confirmText: tOutside("mapo.confirm"),
    dangerous: true,
  });
  snack.show(ok ? "confirmed" : "dismissed", ok ? "success" : "info");
}
</script>

<template>
  <div class="mx-auto max-w-4xl space-y-8 p-6">
    <div>
      <h1 class="text-2xl font-bold">i18n</h1>
      <p class="mt-1 text-sm text-gray-500">
        Cambia lingua e osserva: tutto quello che segue — e ogni componente Mapo
        in pagina — si aggiorna senza reload.
      </p>
    </div>

    <!-- Switcher + imperative setLocale -->
    <UCard>
      <template #header>
        <p class="font-medium">Cambio lingua</p>
      </template>

      <div class="flex flex-wrap items-center gap-4">
        <div>
          <p class="mb-1 text-xs text-dimmed">&lt;MapoLangSwitcher&gt;</p>
          <MapoLangSwitcher />
        </div>

        <div>
          <p class="mb-1 text-xs text-dimmed">senza bandiere</p>
          <MapoLangSwitcher :flags="false" size="sm" />
        </div>

        <div>
          <p class="mb-1 text-xs text-dimmed">setLocale() imperativo</p>
          <UButtonGroup size="sm">
            <UButton
              v-for="l in locales"
              :key="l.code"
              :variant="locale === l.code ? 'solid' : 'outline'"
              color="neutral"
              @click="setLocale(l.code)"
            >
              {{ l.code.toUpperCase() }}
            </UButton>
          </UButtonGroup>
        </div>

        <UBadge variant="subtle" color="primary" data-testid="active-locale">
          locale = {{ locale }}
        </UBadge>
      </div>
    </UCard>

    <!-- Built-in keys -->
    <UCard>
      <template #header>
        <p class="font-medium">Chiavi Mapo riusate nell'app</p>
      </template>

      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-default text-left text-xs text-dimmed">
            <th class="pb-2 font-medium">chiave</th>
            <th class="pb-2 font-medium">valore</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="key in builtinKeys"
            :key="key"
            class="border-b border-default/50 last:border-0"
          >
            <td class="py-1.5 font-mono text-xs text-muted">{{ key }}</td>
            <td class="py-1.5" :data-testid="`key-${key}`">{{ t(key) }}</td>
          </tr>
        </tbody>
      </table>

      <UAlert
        icon="i-lucide-pencil"
        color="info"
        variant="subtle"
        class="mt-4"
        title="Override applicato"
        :description="`'mapo.listTable.noItems' è ridefinito in i18n/locales/${locale}.json: il valore qui sopra è quello dell'app, non quello di Mapo.`"
      />
    </UCard>

    <!-- Interpolation + plurals -->
    <UCard>
      <template #header>
        <p class="font-medium">Interpolazione e plurali</p>
      </template>

      <div class="space-y-3">
        <UFormField label="count" size="sm">
          <UInput
            v-model.number="itemCount"
            type="number"
            :min="0"
            class="w-24"
          />
        </UFormField>

        <dl class="space-y-1 text-sm">
          <div class="flex gap-2">
            <dt class="w-52 shrink-0 font-mono text-xs text-dimmed">
              listTable.totalItems
            </dt>
            <dd data-testid="interp">
              {{ t("mapo.listTable.totalItems", { total: itemCount }) }}
            </dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-52 shrink-0 font-mono text-xs text-dimmed">
              repeater.nItems (plurale)
            </dt>
            <dd data-testid="plural">
              {{ t("mapo.repeater.nItems", { n: itemCount }, itemCount) }}
            </dd>
          </div>
          <div class="flex gap-2">
            <dt class="w-52 shrink-0 font-mono text-xs text-dimmed">
              wygEditor.requiresUikit
            </dt>
            <dd data-testid="escaped-at">
              {{ t("mapo.wygEditor.requiresUikit") }}
            </dd>
          </div>
        </dl>

        <p class="text-xs text-dimmed">
          L'ultima riga contiene una <code>@</code> letterale: nei cataloghi va
          scritta <code>{{ "{'@'}" }}</code
          >, altrimenti vue-i18n la interpreta come link a un altro messaggio.
        </p>
      </div>
    </UCard>

    <!-- useMapoT outside components -->
    <UCard>
      <template #header>
        <p class="font-medium">useMapoT() — fuori dai componenti</p>
      </template>

      <p class="mb-3 text-sm text-gray-500">
        <code>useI18n()</code> richiede un component instance: negli store o nei
        composable si usa <code>useMapoT()</code>. Questi due bottoni compongono
        il messaggio esattamente come farebbe uno store.
      </p>

      <div class="flex gap-2">
        <UButton size="sm" @click="showSnack">
          {{ t("mapo.save") }} → snackbar
        </UButton>
        <UButton size="sm" color="error" variant="soft" @click="askConfirm">
          {{ t("mapo.delete") }} → confirm
        </UButton>
      </div>
    </UCard>

    <!-- Live proof on a real component -->
    <UCard>
      <template #header>
        <p class="font-medium">Componenti UIKit tradotti</p>
      </template>

      <p class="mb-3 text-sm text-gray-500">
        Nessuna stringa hard-coded: la lista qui sotto (vuota di proposito) e la
        treeview prendono le loro etichette dallo stesso catalogo.
      </p>

      <div class="grid gap-4 md:grid-cols-2">
        <div class="rounded border border-default p-3">
          <MapoList
            endpoint="/api/menus?search=__none__"
            :columns="[{ key: 'key', label: 'Key' }]"
            searchable
          />
        </div>
        <div class="h-56 rounded border border-default">
          <MapoMenuTreeview :nodes="[]" title="Treeview" />
        </div>
      </div>
    </UCard>

    <!-- Content languages: not the UI language, the languages of the data -->
    <UCard>
      <template #header>
        <p class="font-medium">Lingue dei contenuti</p>
      </template>

      <p class="mb-3 text-sm text-gray-500">
        Diverse dalla lingua dell'interfaccia: sono le lingue in cui si
        traducono i dati. <code>mapo.uikit.contentLanguages</code> tiene solo
        quelle elencate, nel suo ordine, tra quelle che il backend o la pagina
        dichiarano; con una lingua sola i tab spariscono. Per provarla, avvia il
        dev server con
        <code>NUXT_PUBLIC_MAPO_UIKIT_CONTENT_LANGUAGES='["it"]'</code>.
      </p>

      <UBadge variant="subtle" color="primary" data-testid="content-languages">
        contentLanguages =
        {{
          contentLanguages.length ? contentLanguages.join(", ") : "[] (tutte)"
        }}
      </UBadge>

      <ul class="mt-3 list-disc pl-5 text-sm">
        <li v-for="page in contentLanguagePages" :key="page.to">
          <NuxtLink :to="page.to" class="text-primary hover:underline">
            {{ page.label }}
          </NuxtLink>
        </li>
      </ul>
    </UCard>
  </div>
</template>
