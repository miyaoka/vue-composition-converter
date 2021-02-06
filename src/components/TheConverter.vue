<template>
  <div class="flex flex-row h-full">
    <div class="flex-1 flex flex-col">
      <h2>Input: (Vue2 / Option API)</h2>
      <textarea
        class="border w-full text-sm leading-4 flex-1 p-2"
        v-model="input"
      ></textarea>
    </div>
    <div class="flex-1 flex flex-col">
      <h2>Output: (Vue2 / Composition API)</h2>
      <textarea
        class="border w-full text-sm leading-4 flex-1 text-gray-200 bg-gray-800 p-2"
        v-model="parsed"
        disabled
      ></textarea>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent, watch } from 'vue'
import { parse } from '../lib/parse'
import text from '../assets/sampleSFC.txt?raw'

export default defineComponent({
  setup: () => {
    const input = ref(text)
    const parsed = ref('aaa')

    watch(
      input,
      () => {
        parsed.value = parse(input.value)
      },
      { immediate: true }
    )
    return { input, parsed }
  },
})
</script>
