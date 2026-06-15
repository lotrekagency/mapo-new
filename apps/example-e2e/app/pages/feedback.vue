<script setup lang="ts">
// Tests: MapoSnackBar (success/error/warning/info), auto-dismiss, manual dismiss,
// multiple toasts in sequence. MapoConfirmDialog standard and dangerous flows,
// promise resolves true/false, custom labels, escape to cancel.
// E2E plan: e2e/uikit/feedback.md, e2e/modules/store.md §2–3
import { useSnackStore, useConfirmStore } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Feedback",
  icon: "i-lucide-bell",
  middleware: ["auth"],
});

const snack = useSnackStore();
const confirm = useConfirmStore();

const snackTypes = [
  {
    type: "success",
    label: "Success",
    icon: "i-lucide-check-circle",
    color: "text-green-500",
    bg: "bg-green-50 dark:bg-green-950/30",
  },
  {
    type: "error",
    label: "Error",
    icon: "i-lucide-x-circle",
    color: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  {
    type: "warning",
    label: "Warning",
    icon: "i-lucide-alert-triangle",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    type: "info",
    label: "Info",
    icon: "i-lucide-info",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
] as const;

// Fires all four toast types in quick succession to test queue behaviour.
function showAll() {
  for (const s of snackTypes) {
    snack.show(`This is a ${s.type} message.`, s.type);
  }
}

// Fires a persistent toast (duration 0) that only dismisses on manual click.
function showPersistent() {
  snack.show("This toast stays until you click ✕ (duration: 0).", "info", 0);
}

const lastResult = ref<boolean | null>(null);

async function runConfirm(dangerous = false) {
  lastResult.value = null;
  const ok = await confirm.ask({
    title: dangerous ? "Delete item" : "Confirm action",
    message: dangerous
      ? "This item will be permanently deleted. This cannot be undone."
      : "Are you sure you want to proceed?",
    confirmText: dangerous ? "Delete" : "Confirm",
    cancelText: "Cancel",
    dangerous,
  });
  lastResult.value = ok;
  snack.show(
    ok ? (dangerous ? "Item deleted." : "Confirmed!") : "Cancelled.",
    ok ? (dangerous ? "error" : "success") : "info",
  );
}

// Tests two sequential confirm.ask() calls — second should wait for first.
async function runSequential() {
  lastResult.value = null;
  const first = await confirm.ask({
    message: "First dialog — confirm to open second.",
  });
  snack.show(
    `First: ${first ? "confirmed" : "cancelled"}`,
    first ? "success" : "info",
  );
  const second = await confirm.ask({
    message: "Second dialog — should open after first is resolved.",
  });
  snack.show(
    `Second: ${second ? "confirmed" : "cancelled"}`,
    second ? "success" : "info",
  );
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Feedback Components</h1>
      <p class="text-muted text-sm mt-1">
        E2E plan: <code>e2e/uikit/feedback.md</code> — snack bar and confirm
        dialog.
      </p>
    </div>

    <!-- SnackBar -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bell" class="size-4 text-primary" />
          <span class="font-semibold text-sm text-highlighted"
            >MapoSnackBar</span
          >
        </div>
      </template>

      <div class="space-y-4">
        <!-- Tests 1.1–1.4: one button per toast type -->
        <div>
          <p class="text-xs text-muted mb-3">
            Trigger one toast type at a time (tests 1.1–1.4).
          </p>
          <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <button
              v-for="s in snackTypes"
              :key="s.type"
              class="flex flex-col items-center gap-2 rounded-xl border border-default p-4 hover:border-primary/40 hover:bg-elevated transition-all cursor-pointer"
              @click="snack.show(`This is a ${s.type} message.`, s.type)"
            >
              <div
                class="size-9 rounded-lg flex items-center justify-center"
                :class="s.bg"
              >
                <UIcon :name="s.icon" class="size-5" :class="s.color" />
              </div>
              <span class="text-xs font-medium text-highlighted">{{
                s.label
              }}</span>
            </button>
          </div>
        </div>

        <!-- Tests 2.3–2.4: queue and persistence -->
        <div class="flex flex-wrap gap-3">
          <UButton
            variant="outline"
            color="neutral"
            leading-icon="i-lucide-layers"
            @click="showAll"
          >
            Show all 4 at once (queue test)
          </UButton>
          <!-- Tests 2.2: duration 0 — no auto-dismiss -->
          <UButton
            variant="outline"
            color="neutral"
            leading-icon="i-lucide-pin"
            @click="showPersistent"
          >
            Persistent toast (no auto-dismiss)
          </UButton>
        </div>
      </div>
    </UCard>

    <!-- ConfirmDialog -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-shield-alert" class="size-4 text-primary" />
          <span class="font-semibold text-sm text-highlighted"
            >MapoConfirmDialog</span
          >
        </div>
      </template>

      <div class="space-y-4">
        <p class="text-xs text-muted">
          <code class="bg-elevated px-1 rounded">await confirm.ask()</code>
          returns <code class="bg-elevated px-1 rounded">true</code> (confirm)
          or
          <code class="bg-elevated px-1 rounded">false</code> (cancel/escape).
        </p>

        <div class="flex flex-wrap gap-3">
          <!-- Tests 3.1–3.3: standard confirm -->
          <UButton
            variant="outline"
            color="neutral"
            leading-icon="i-lucide-help-circle"
            @click="runConfirm(false)"
          >
            Standard confirm
          </UButton>
          <!-- Tests 4.2: dangerous = red button -->
          <UButton
            variant="outline"
            color="error"
            leading-icon="i-lucide-trash-2"
            @click="runConfirm(true)"
          >
            Dangerous confirm
          </UButton>
          <!-- Tests 3.4 (sequential) and store §3.4 -->
          <UButton
            variant="outline"
            color="neutral"
            leading-icon="i-lucide-list"
            @click="runSequential"
          >
            Sequential (2 dialogs)
          </UButton>
        </div>

        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-1"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="opacity-0"
        >
          <div
            v-if="lastResult !== null"
            class="flex items-center gap-2 text-sm rounded-lg px-3 py-2 border"
            :class="
              lastResult
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
                : 'border-neutral-200 bg-neutral-50 text-muted dark:border-neutral-700 dark:bg-neutral-900/30'
            "
          >
            <UIcon
              :name="lastResult ? 'i-lucide-check' : 'i-lucide-x'"
              class="size-4 shrink-0"
            />
            User clicked
            <strong class="font-medium">{{
              lastResult ? "Confirm" : "Cancel"
            }}</strong>
          </div>
        </Transition>
      </div>
    </UCard>
  </div>
</template>
