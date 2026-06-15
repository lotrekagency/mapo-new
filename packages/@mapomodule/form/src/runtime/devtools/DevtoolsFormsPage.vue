<script setup lang="ts">
import type { FieldRegistry } from "../types/index.js";
// @ts-expect-error — #imports is a Nuxt virtual module resolved at app build time
import { definePageMeta, useNuxtApp, useRuntimeConfig } from "#imports";
import { computed } from "vue";

definePageMeta({ layout: false });

const { $mapoFormRegistry } = useNuxtApp() as unknown as {
  $mapoFormRegistry: FieldRegistry;
};
const config = useRuntimeConfig().public.mapoForm as {
  groups?: { expanded?: boolean };
  debounce?: number;
};

/** Sorted list of all registered field types currently available in the runtime registry. */
const registeredTypes = computed(() => {
  const mapping = $mapoFormRegistry?.mapping || {};
  return Object.keys(mapping).sort();
});

// Built-in types are those from defaultRegistry; custom types are added at runtime
// and detected by comparing against the standard type list.
const builtInTypes = new Set([
  "text",
  "textarea",
  "number",
  "boolean",
  "switch",
  "color",
  "file",
  "slider",
  "select",
  "date",
  "time",
  "datetime",
  "fks",
  "m2m",
  "seo",
  "editor",
  "map",
  "repeater",
]);
const userMappings = computed(() =>
  registeredTypes.value.filter((t: string) => !builtInTypes.has(t)),
);

const globalDebounce = computed(() => config?.debounce || 300);
const globalExpanded = computed(() => config?.groups?.expanded !== false);

function componentLabel(type: string): string {
  const v = $mapoFormRegistry?.mapping?.[type];
  if (!v) return "—";
  if (typeof v === "string") return v;
  if (typeof v === "function") return "(lazy)";
  if (typeof v === "object") {
    const name = (v as { __name?: string }).__name;
    if (name) return name;
  }
  return "(component)";
}

function attrsKeys(type: string): string {
  const a = $mapoFormRegistry?.attrs?.[type];
  return a ? Object.keys(a).join(", ") : "";
}

function accessorKeys(type: string): string {
  const ac = $mapoFormRegistry?.accessor?.[type];
  return ac ? Object.keys(ac).join(" / ") : "";
}

function isUserType(type: string): boolean {
  return userMappings.value.includes(type);
}
</script>

<template>
  <div class="min-h-screen bg-gray-950 text-gray-100 font-mono text-sm p-6">
    <!-- Header -->
    <div class="flex items-center gap-3 mb-8 border-b border-gray-800 pb-4">
      <span class="text-2xl">🗒️</span>
      <div>
        <h1 class="text-lg font-semibold text-white">Mapo Forms</h1>
        <p class="text-gray-400 text-xs">Devtools panel — development only</p>
      </div>
    </div>

    <div class="grid grid-cols-3 gap-6">
      <!-- Column 1: Global configuration -->
      <div class="col-span-1">
        <h2
          class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
        >
          Global config
        </h2>
        <div
          class="bg-gray-900 rounded-lg border border-gray-800 p-4 space-y-3"
        >
          <div>
            <span class="text-gray-500">debounce</span>
            <span class="ml-2 text-amber-400">{{ globalDebounce }}ms</span>
          </div>
          <div>
            <span class="text-gray-500">groups.expanded</span>
            <span
              class="ml-2"
              :class="globalExpanded ? 'text-green-400' : 'text-red-400'"
            >
              {{ globalExpanded }}
            </span>
          </div>
          <div>
            <span class="text-gray-500">custom types</span>
            <span class="ml-2 text-blue-400">{{ userMappings.length }}</span>
          </div>
        </div>

        <!-- User-defined custom types -->
        <h2
          class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-6"
        >
          Registered custom fields
        </h2>
        <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <div
            v-if="userMappings.length === 0"
            class="text-gray-500 text-xs italic"
          >
            No custom types (nuxt.config → mapoForm.fields.mapping)
          </div>
          <div
            v-for="type in userMappings"
            :key="type"
            class="flex items-center gap-2 py-1"
          >
            <span class="w-2 h-2 rounded-full bg-blue-500 shrink-0" />
            <span class="text-blue-300">{{ type }}</span>
          </div>
        </div>
      </div>

      <!-- Columns 2-3: Full registry -->
      <div class="col-span-2">
        <h2
          class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3"
        >
          Field registry
          <span class="ml-2 text-gray-600 normal-case font-normal"
            >({{ registeredTypes.length }} types)</span
          >
        </h2>
        <div
          class="bg-gray-900 rounded-lg border border-gray-800 overflow-hidden"
        >
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-gray-800 bg-gray-900/80">
                <th class="text-left px-4 py-2 text-gray-500 font-medium w-8">
                  #
                </th>
                <th class="text-left px-4 py-2 text-gray-500 font-medium">
                  type
                </th>
                <th class="text-left px-4 py-2 text-gray-500 font-medium">
                  component
                </th>
                <th class="text-left px-4 py-2 text-gray-500 font-medium">
                  default attrs
                </th>
                <th class="text-left px-4 py-2 text-gray-500 font-medium">
                  accessor
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(type, i) in registeredTypes"
                :key="type"
                class="border-b border-gray-800/50 hover:bg-gray-800/40 transition-colors"
              >
                <td class="px-4 py-2 text-gray-600">
                  {{ i + 1 }}
                </td>
                <td class="px-4 py-2">
                  <span
                    class="px-1.5 py-0.5 rounded text-xs"
                    :class="
                      isUserType(type)
                        ? 'bg-blue-900/50 text-blue-300'
                        : 'bg-gray-800 text-gray-200'
                    "
                    >{{ type }}</span
                  >
                </td>
                <td class="px-4 py-2 text-green-300">
                  {{ componentLabel(type) }}
                </td>
                <td class="px-4 py-2 text-gray-400">
                  <span v-if="attrsKeys(type)" class="text-amber-300/80">{{
                    attrsKeys(type)
                  }}</span>
                  <span v-else class="text-gray-700">—</span>
                </td>
                <td class="px-4 py-2">
                  <span v-if="accessorKeys(type)" class="text-purple-400">{{
                    accessorKeys(type)
                  }}</span>
                  <span v-else class="text-gray-700">—</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Quick reference -->
        <h2
          class="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 mt-6"
        >
          Quick reference — add a custom type
        </h2>
        <div class="bg-gray-900 rounded-lg border border-gray-800 p-4">
          <pre
            class="text-xs text-gray-300 overflow-x-auto leading-relaxed"
          ><span class="text-gray-500">// nuxt.config.ts</span>
<span class="text-blue-300">mapoForm</span>: {
  fields: {
    mapping: {
      <span class="text-amber-300">'my-type'</span>: () => import(<span class="text-green-300">'~/components/MyField.vue'</span>),
    },
    attrs: {
      <span class="text-amber-300">'my-type'</span>: { <span class="text-purple-300">someProp</span>: <span class="text-green-300">true</span> },
    },
  },
}

<span class="text-gray-500">// descriptor</span>
{ key: <span class="text-green-300">'fieldKey'</span>, type: <span class="text-amber-300">'my-type'</span> }</pre>
        </div>

        <!-- If MapoUnknownField is rendered -->
        <div
          class="mt-4 p-3 bg-amber-900/20 border border-amber-700/40 rounded-lg text-xs text-amber-300"
        >
          <strong>⚠ MapoUnknownField</strong> — if a yellow placeholder appears
          in a form, the type is missing from the registry. Check
          <code class="bg-amber-900/30 px-1 rounded">descriptor.type</code> and
          add the mapping shown above. In development, a
          <code class="bg-amber-900/30 px-1 rounded">console.warn</code> is
          emitted with the full path.
        </div>
      </div>
    </div>
  </div>
</template>
