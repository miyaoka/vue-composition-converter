<template>
  <div class="p-4 w-screen h-screen">
    <TheConverter />
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import TheConverter from './components/TheConverter.vue'
import './index.css'

export default defineComponent({
  name: 'App',
  components: {
    TheConverter,
  },
})
</script>
