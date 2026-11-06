<script setup lang="ts">
// The AI keys lab: how the gateway chooses the key of a call
// (docs/modules/ai.md, "Keys").
// - Everyone the AI lets in sees, from `status`, where the key of each
//   provider comes from (the level, the last four characters, their own
//   token), saves or removes their own token where an assignment allows it,
//   and tries a call of `run` with the app's provider `example-keys`
//   (server/plugins/mapo-ai-keys.ts), which calls no model and says which
//   key it got.
// - The AI's admins (the superusers here) also see GET /_mapo/ai/keys: they
//   save and remove assignments, order the groups and remove the tokens the
//   users saved.
// Sign in as admin, editor (group "editors"), writer ("editors" and
// "reporters") or viewer (kept out of the AI). A real app gets a settings
// page instead; this one shows the routes as they are.
import type {
  MapoAiKeyAssignment,
  MapoAiKeyAssignmentInput,
  MapoAiKeyScope,
  MapoAiKeysAnswer,
  MapoAiKeyStatus,
  MapoAiRunResponse,
  MapoAiStatus,
} from "mapomodule/types";

definePageMeta({
  layout: "mapo-default",
  label: "AI keys",
  icon: "i-lucide-key-round",
  middleware: ["auth"],
});

/** The provider a call may be tried with: it costs nothing. */
const LAB_PROVIDER = "example-keys";

const { fetch } = useMapoFetch();
const status = ref<MapoAiStatus>();
const keys = ref<MapoAiKeysAnswer>();
const notice = ref<{ color: "success" | "error"; text: string }>();
const busy = ref(false);

/** A failed call as the page says it: the status and the gateway's message. */
function failure(error: unknown): string {
  const failed = error as {
    statusCode?: number;
    data?: { statusMessage?: string; message?: string; data?: unknown };
  };
  const detail = failed.data?.data
    ? ` ${JSON.stringify(failed.data.data)}`
    : "";
  const message = failed.data?.statusMessage ?? failed.data?.message ?? "";
  return `${failed.statusCode ?? "no answer"} ${message}${detail}`.trim();
}

/** Runs one change, says how it went, and reads everything again. */
async function act(done: string, change: () => Promise<unknown>) {
  busy.value = true;
  try {
    await change();
    notice.value = { color: "success", text: done };
  } catch (error) {
    notice.value = { color: "error", text: failure(error) };
  } finally {
    busy.value = false;
  }
  await load();
}

async function load() {
  try {
    status.value = await fetch<MapoAiStatus>("/_mapo/ai/status");
  } catch (error) {
    status.value = undefined;
    notice.value = { color: "error", text: `status: ${failure(error)}` };
    return;
  }
  keys.value = status.value.admin
    ? await fetch<MapoAiKeysAnswer>("/_mapo/ai/keys").catch((error) => {
        notice.value = { color: "error", text: `keys: ${failure(error)}` };
        return undefined;
      })
    : undefined;
}
onMounted(load);

// ─── The user's own keys ─────────────────────────────────────────────────────

const keyed = computed(() =>
  (status.value?.providers ?? []).filter((provider) => provider.key),
);

function levelOf(key: MapoAiKeyStatus): string {
  const ending = key.last4 ? ` …${key.last4}` : "";
  if (key.level === "none") {
    return key.required ? "none: run refuses it" : "none: called without";
  }
  const group = key.level === "group" ? ` "${key.group}"` : "";
  return `${key.level}${group}${ending}`;
}

function personalOf(key: MapoAiKeyStatus): string {
  const allowed = key.personal.allowed ? "allowed" : "not allowed";
  if (!key.personal.saved) return `${allowed}, none saved`;
  const ending = key.personal.last4 ? ` …${key.personal.last4}` : "";
  const used = key.personal.allowed ? "in use" : "saved, not used";
  return `${allowed}, ${used}${ending}`;
}

const tokens = reactive<Record<string, string>>({});

function saveToken(provider: string) {
  const token = tokens[provider] ?? "";
  tokens[provider] = "";
  return act(`Your token for ${provider} is saved.`, () =>
    fetch("/_mapo/ai/token", { method: "PUT", body: { provider, token } }),
  );
}

function removeToken(provider: string, user?: string) {
  return act(`The token for ${provider} is removed.`, () =>
    fetch("/_mapo/ai/token", {
      method: "DELETE",
      query: { provider, ...(user ? { user } : {}) },
    }),
  );
}

const tried = ref<string>();

/** A call of `run` with the lab's provider: it says which key it got. */
async function tryCall(model: string) {
  tried.value = "…";
  try {
    const answer = await fetch<MapoAiRunResponse>("/_mapo/ai/run", {
      method: "POST",
      body: {
        task: "fill",
        entity: {
          label: "Article",
          fields: {
            type: "object",
            properties: { title: { type: "string", title: "Title" } },
          },
        },
        parts: [{ kind: "text", text: "Title: The keys lab" }],
        provider: { id: LAB_PROVIDER, model },
      },
    });
    tried.value =
      answer.status === "refused"
        ? answer.refusal
        : `Answered by ${answer.provider.id} (${answer.provider.model}).`;
  } catch (error) {
    tried.value = `run answered ${failure(error)}`;
  }
}

// ─── The admins' assignments ─────────────────────────────────────────────────

const form = reactive({
  kind: "group" as MapoAiKeyScope["kind"],
  target: "editors",
  provider: LAB_PROVIDER,
  everyModel: true,
  models: [] as string[],
  key: "",
  removeKey: false,
  personalTokens: false,
});

const KINDS = [
  { label: "Everyone", value: "all" },
  { label: "A group", value: "group" },
  { label: "A user (backend id)", value: "user" },
];

const providerItems = computed(() =>
  (keys.value?.providers ?? []).map((provider) => ({
    label: provider.label ?? provider.id,
    value: provider.id,
  })),
);
const formProvider = computed(() =>
  keys.value?.providers.find((provider) => provider.id === form.provider),
);

function scopeOf(): MapoAiKeyScope {
  if (form.kind === "all") return { kind: "all" };
  const target = form.target.trim();
  return form.kind === "group"
    ? { kind: "group", group: target }
    : { kind: "user", user: target };
}

function describeScope(scope: MapoAiKeyScope): string {
  if (scope.kind === "all") return "everyone";
  return scope.kind === "group"
    ? `group "${scope.group}"`
    : `user ${scope.user}`;
}

function saveAssignment() {
  const body: MapoAiKeyAssignmentInput = {
    scope: scopeOf(),
    provider: form.provider,
    models: form.everyModel ? null : [...form.models],
    personalTokens: form.personalTokens,
    ...(form.removeKey ? { key: null } : form.key ? { key: form.key } : {}),
  };
  form.key = "";
  form.removeKey = false;
  return act(`The assignment for ${describeScope(body.scope)} is saved.`, () =>
    fetch("/_mapo/ai/keys", { method: "PUT", body }),
  );
}

/** Puts an assignment in the form, to change it: its key stays unless replaced. */
function edit(assignment: MapoAiKeyAssignment) {
  form.kind = assignment.scope.kind;
  form.target =
    assignment.scope.kind === "group"
      ? assignment.scope.group
      : assignment.scope.kind === "user"
        ? assignment.scope.user
        : "";
  form.provider = assignment.provider;
  form.everyModel = !assignment.models;
  form.models = [...(assignment.models ?? [])];
  form.key = "";
  form.removeKey = false;
  form.personalTokens = assignment.personalTokens;
}

function removeAssignment(assignment: MapoAiKeyAssignment) {
  return act(
    `The assignment for ${describeScope(assignment.scope)} is removed.`,
    () => fetch(`/_mapo/ai/keys/${assignment.id}`, { method: "DELETE" }),
  );
}

function toggleModel(model: string, on: boolean) {
  form.models = on
    ? [...form.models, model]
    : form.models.filter((one) => one !== model);
}

const groupOrder = ref("");
watch(keys, (answer) => {
  groupOrder.value = (answer?.groups ?? []).join(", ");
});

function saveGroups() {
  const groups = groupOrder.value
    .split(",")
    .map((group) => group.trim())
    .filter(Boolean);
  return act("The order of the groups is saved.", () =>
    fetch("/_mapo/ai/keys/groups", { method: "PUT", body: { groups } }),
  );
}
</script>

<template>
  <div class="p-4 max-w-5xl mx-auto space-y-4">
    <UAlert
      color="info"
      variant="subtle"
      icon="i-lucide-key-round"
      title="Which key a call uses"
      description="For each provider: the user's own token where the nearest assignment allows it, else the first key up the assignments (the user's, their groups' in the admins' order, everyone's), else the project's. The nearest assignment also says which models the user may call. Sign in as admin, editor, writer or viewer."
    />
    <UAlert
      v-if="notice"
      :color="notice.color"
      variant="subtle"
      :title="notice.text"
      :close="true"
      @update:open="notice = undefined"
    />

    <UCard v-if="status">
      <template #header>
        <h2 class="font-semibold">Your keys, as status says them</h2>
      </template>
      <p v-if="!status.allowed" class="text-sm text-muted">
        The app keeps this account out of the AI.
      </p>
      <p v-else-if="!keyed.length" class="text-sm text-muted">
        No provider you may use calls with a key.
      </p>
      <table v-else class="w-full text-sm">
        <thead class="text-left text-muted">
          <tr>
            <th class="py-1 pr-3">Provider</th>
            <th class="py-1 pr-3">Models</th>
            <th class="py-1 pr-3">Key in use</th>
            <th class="py-1 pr-3">Your own token</th>
            <th class="py-1" />
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="provider in keyed"
            :key="provider.id"
            class="border-t border-default align-top"
          >
            <td class="py-2 pr-3">{{ provider.label ?? provider.id }}</td>
            <td class="py-2 pr-3">{{ provider.models.join(", ") }}</td>
            <td class="py-2 pr-3">{{ levelOf(provider.key!) }}</td>
            <td class="py-2 pr-3 space-y-2">
              <div>{{ personalOf(provider.key!) }}</div>
              <div v-if="provider.key!.personal.allowed" class="flex gap-2">
                <UInput
                  v-model="tokens[provider.id]"
                  type="password"
                  placeholder="Your token"
                  size="sm"
                  aria-label="Your token"
                />
                <UButton
                  size="sm"
                  :disabled="busy || !tokens[provider.id]"
                  @click="saveToken(provider.id)"
                >
                  Save
                </UButton>
              </div>
              <UButton
                v-if="provider.key!.personal.saved"
                size="sm"
                color="neutral"
                variant="soft"
                :disabled="busy"
                @click="removeToken(provider.id)"
              >
                Remove my token
              </UButton>
            </td>
            <td class="py-2 space-y-1">
              <template v-if="provider.id === LAB_PROVIDER">
                <UButton
                  v-for="model in provider.models"
                  :key="model"
                  size="sm"
                  color="neutral"
                  variant="outline"
                  @click="tryCall(model)"
                >
                  Try {{ model }}
                </UButton>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
      <p v-if="tried" class="mt-3 text-sm">{{ tried }}</p>
    </UCard>

    <template v-if="keys">
      <UCard>
        <template #header>
          <h2 class="font-semibold">Assignments (AI admins)</h2>
        </template>
        <p v-if="!keys.assignments.length" class="text-sm text-muted">
          No assignment: every user gets every model the app enables, with the
          project's key, and no personal token.
        </p>
        <table v-else class="w-full text-sm">
          <thead class="text-left text-muted">
            <tr>
              <th class="py-1 pr-3">For</th>
              <th class="py-1 pr-3">Provider</th>
              <th class="py-1 pr-3">Models</th>
              <th class="py-1 pr-3">Key</th>
              <th class="py-1 pr-3">Own tokens</th>
              <th class="py-1 pr-3">Changed</th>
              <th class="py-1" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="assignment in keys.assignments"
              :key="assignment.id"
              class="border-t border-default"
            >
              <td class="py-2 pr-3">{{ describeScope(assignment.scope) }}</td>
              <td class="py-2 pr-3">{{ assignment.provider }}</td>
              <td class="py-2 pr-3">
                {{
                  assignment.models
                    ? assignment.models.join(", ") || "none: closed"
                    : "every model"
                }}
              </td>
              <td class="py-2 pr-3">
                {{
                  assignment.key
                    ? assignment.key.last4
                      ? `…${assignment.key.last4}`
                      : "a short key"
                    : "none: the next level's"
                }}
              </td>
              <td class="py-2 pr-3">
                {{ assignment.personalTokens ? "allowed" : "no" }}
              </td>
              <td class="py-2 pr-3 text-muted">
                {{ assignment.updated.by.username ?? assignment.updated.by.id }}
              </td>
              <td class="py-2 flex gap-2">
                <UButton
                  size="sm"
                  color="neutral"
                  variant="soft"
                  @click="edit(assignment)"
                >
                  Edit
                </UButton>
                <UButton
                  size="sm"
                  color="error"
                  variant="soft"
                  :disabled="busy"
                  @click="removeAssignment(assignment)"
                >
                  Remove
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">Save an assignment</h2>
        </template>
        <div class="grid gap-3 sm:grid-cols-2">
          <UFormField label="For">
            <USelect v-model="form.kind" :items="KINDS" class="w-full" />
          </UFormField>
          <UFormField
            v-if="form.kind !== 'all'"
            :label="form.kind === 'group' ? 'Group name' : 'User id'"
          >
            <UInput
              v-model="form.target"
              :placeholder="form.kind === 'group' ? 'editors' : '4'"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Provider">
            <USelect
              v-model="form.provider"
              :items="providerItems"
              class="w-full"
            />
          </UFormField>
          <UFormField label="Models">
            <div class="space-y-1">
              <UCheckbox v-model="form.everyModel" label="Every model" />
              <p class="text-xs text-muted">
                The nearest assignment decides the models alone: one for a user
                with every model opens them all to that user, though a group of
                theirs limits them.
              </p>
              <template v-if="!form.everyModel && formProvider">
                <UCheckbox
                  v-for="model in formProvider.models"
                  :key="model"
                  :model-value="form.models.includes(model)"
                  :label="model"
                  @update:model-value="toggleModel(model, $event === true)"
                />
                <p v-if="!form.models.length" class="text-xs text-muted">
                  None ticked: the provider is closed to this scope.
                </p>
              </template>
            </div>
          </UFormField>
          <UFormField
            v-if="formProvider?.key"
            label="Key"
            help="Left empty, an existing key stays."
          >
            <UInput
              v-model="form.key"
              type="password"
              :disabled="form.removeKey"
              class="w-full"
            />
            <UCheckbox
              v-model="form.removeKey"
              label="Remove the key: the next level's applies"
              class="mt-2"
            />
          </UFormField>
          <UFormField v-if="formProvider?.key" label="Own tokens">
            <UCheckbox
              v-model="form.personalTokens"
              label="The users of this scope may use their own token"
            />
          </UFormField>
        </div>
        <template #footer>
          <UButton :disabled="busy || !form.provider" @click="saveAssignment()">
            Save the assignment
          </UButton>
        </template>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">The order of the groups</h2>
        </template>
        <p class="text-sm text-muted mb-2">
          Highest priority first, separated by commas: a user in several groups
          gets the assignment of the highest. Groups left out come after, by
          name.
        </p>
        <div class="flex gap-2">
          <UInput
            v-model="groupOrder"
            placeholder="reporters, editors"
            class="flex-1"
            aria-label="The order of the groups"
          />
          <UButton :disabled="busy" @click="saveGroups()"
            >Save the order</UButton
          >
        </div>
      </UCard>

      <UCard>
        <template #header>
          <h2 class="font-semibold">The users' own tokens</h2>
        </template>
        <p v-if="!keys.tokens.length" class="text-sm text-muted">
          No user saved a token.
        </p>
        <ul v-else class="text-sm space-y-2">
          <li
            v-for="token in keys.tokens"
            :key="`${token.user.id}:${token.provider}`"
            class="flex items-center gap-3"
          >
            <span>
              {{ token.user.username ?? token.user.id }} ·
              {{ token.provider }}
              {{ token.last4 ? `…${token.last4}` : "" }}
            </span>
            <UButton
              size="sm"
              color="error"
              variant="soft"
              :disabled="busy"
              @click="removeToken(token.provider, token.user.id)"
            >
              Remove
            </UButton>
          </li>
        </ul>
      </UCard>
    </template>

    <UButton
      color="neutral"
      variant="soft"
      icon="i-lucide-refresh-cw"
      @click="load()"
    >
      Ask again
    </UButton>
  </div>
</template>
