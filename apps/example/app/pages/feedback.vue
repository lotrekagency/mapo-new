<script setup lang="ts">
import { useSnackStore, useConfirmStore } from "#imports";

definePageMeta({
  layout: "mapo-default",
  label: "Feedback",
  icon: "i-lucide-bell",
});

const snack = useSnackStore();
const confirm = useConfirmStore();

const snacks = [
  {
    type: "success",
    label: "Success",
    message: "Operation completed successfully.",
    color: "text-green-500",
    bg: "bg-green-50 dark:bg-green-950/30",
  },
  {
    type: "error",
    label: "Error",
    message: "Something went wrong. Please try again.",
    color: "text-red-500",
    bg: "bg-red-50 dark:bg-red-950/30",
  },
  {
    type: "warning",
    label: "Warning",
    message: "This action may have side effects.",
    color: "text-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/30",
  },
  {
    type: "info",
    label: "Info",
    message: "Here is some useful information.",
    color: "text-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/30",
  },
] as const;

const lastConfirmResult = ref<boolean | null>(null);

async function runConfirm(dangerous = false) {
  lastConfirmResult.value = null;
  const ok = await confirm.ask({
    title: dangerous ? "Delete item" : "Confirm action",
    message: dangerous
      ? "This item will be permanently deleted. This action cannot be undone."
      : "Are you sure you want to proceed with this action?",
    confirmText: dangerous ? "Delete" : "Confirm",
    cancelText: "Cancel",
    dangerous,
  });
  lastConfirmResult.value = ok;
  snack.show(
    ok
      ? dangerous
        ? "Item deleted."
        : "Action confirmed."
      : "Action cancelled.",
    ok ? (dangerous ? "error" : "success") : "info",
  );
}
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-8">
    <div>
      <h1 class="text-2xl font-bold text-highlighted">Feedback Components</h1>
      <p class="text-muted text-sm mt-1">
        Test MapoSnackBar notifications and MapoConfirmDialog prompts.
      </p>
    </div>

    <!-- Snackbar -->
    <UCard>
      <template #header>
        <div class="flex items-center gap-2">
          <UIcon name="i-lucide-bell" class="size-4 text-primary" />
          <span class="font-semibold text-sm text-highlighted"
            >MapoSnackBar</span
          >
        </div>
      </template>

      <div class="space-y-3">
        <p class="text-xs text-muted">
          Click a button to trigger a toast notification via
          <code class="bg-elevated px-1 rounded">useSnackStore().show()</code>.
        </p>
        <div class="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <button
            v-for="s in snacks"
            :key="s.type"
            class="flex flex-col items-center gap-2 rounded-xl border border-default p-4 hover:border-primary/40 hover:bg-elevated transition-all cursor-pointer"
            @click="snack.show(s.message, s.type)"
          >
            <div
              class="size-9 rounded-lg flex items-center justify-center"
              :class="s.bg"
            >
              <UIcon
                :name="
                  s.type === 'success'
                    ? 'i-lucide-check-circle'
                    : s.type === 'error'
                      ? 'i-lucide-x-circle'
                      : s.type === 'warning'
                        ? 'i-lucide-alert-triangle'
                        : 'i-lucide-info'
                "
                class="size-5"
                :class="s.color"
              />
            </div>
            <span class="text-xs font-medium text-highlighted">{{
              s.label
            }}</span>
          </button>
        </div>
      </div>
    </UCard>

    <!-- Confirm Dialog -->
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
          <code class="bg-elevated px-1 rounded"
            >await confirm.ask(options)</code
          >
          returns a promise that resolves when the user responds.
        </p>

        <div class="flex flex-wrap gap-3">
          <UButton
            variant="outline"
            color="neutral"
            leading-icon="i-lucide-help-circle"
            @click="runConfirm(false)"
          >
            Standard confirm
          </UButton>
          <UButton
            variant="outline"
            color="error"
            leading-icon="i-lucide-trash-2"
            @click="runConfirm(true)"
          >
            Dangerous confirm
          </UButton>
        </div>

        <Transition
          enter-active-class="transition duration-200 ease-out"
          enter-from-class="opacity-0 translate-y-1"
          leave-active-class="transition duration-150 ease-in"
          leave-to-class="opacity-0"
        >
          <div
            v-if="lastConfirmResult !== null"
            class="flex items-center gap-2 text-sm rounded-lg px-3 py-2 border"
            :class="
              lastConfirmResult
                ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400'
                : 'border-neutral-200 bg-neutral-50 text-muted dark:border-neutral-700 dark:bg-neutral-900/30'
            "
          >
            <UIcon
              :name="lastConfirmResult ? 'i-lucide-check' : 'i-lucide-x'"
              class="size-4 shrink-0"
            />
            User clicked
            <strong class="font-medium">{{
              lastConfirmResult ? "Confirm" : "Cancel"
            }}</strong>
          </div>
        </Transition>
      </div>
    </UCard>
  </div>
</template>
