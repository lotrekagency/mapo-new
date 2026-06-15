<script setup lang="ts">
import { useNuiFieldAttrs } from "./useNuiFieldAttrs";
defineOptions({ inheritAttrs: false });
const attrs = useNuiFieldAttrs();
</script>
<template>
  <UTextarea v-bind="attrs" />
</template>
