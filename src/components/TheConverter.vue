<template>
  <div class="flex flex-row h-full">
    <div class="flex-1 flex flex-col">
      <h2>Input: (Option API)</h2>
      <textarea
        class="border w-full text-xs leading-3 flex-1"
        v-model="input"
      ></textarea>
    </div>
    <div class="flex-1 flex flex-col">
      <h2>
        Output: (<a
          href="https://v3.vuejs.org/guide/composition-api-introduction.html"
          >Composition API</a
        >)
      </h2>
      <textarea
        class="border w-full text-xs leading-3 flex-1"
        v-model="input"
        disabled
      ></textarea>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent } from 'vue'
import text from '../assets/sampleSFC.txt?raw'

export default defineComponent({
  setup: () => {
    const input = ref(text)
    return { input }
  },
})
</script>
