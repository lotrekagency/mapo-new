<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "#app";
import { buildRouteTree } from "@mapomodule/utils";
import type { MenuNode } from "@mapomodule/utils";

interface Props {
  footer?: boolean;
  mini?: boolean;
}

const { footer = false, mini = false } = defineProps<Props>();

const router = useRouter();

const nodes = computed<MenuNode[]>(() => {
  const tree = buildRouteTree(router.getRoutes());
  return footer
    ? tree.filter((n) => n.sidebarFooter)
    : tree.filter((n) => !n.sidebarFooter);
});
</script>

<template>
  <nav>
    <ul class="space-y-0.5">
      <MapoSidebarListItem
        v-for="node in nodes"
        :key="node.link"
        :node="node"
        :mini="mini"
      />
    </ul>
  </nav>
</template>
