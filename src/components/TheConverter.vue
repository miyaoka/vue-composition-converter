<template>
  <div class="flex flex-row h-full">
    <div class="flex-1 flex flex-col">
      <h2>Input: (Vue2 / Options API)</h2>
      <textarea
        class="border w-full text-xs leading-3 flex-1 p-2"
        v-model="input"
      ></textarea>
    </div>
    <div class="flex-1 flex flex-col">
      <h2>Output: (Vue2 / Composition API)</h2>
      <pre
        class="hljs border w-full text-xs leading-3 flex-1 p-2 whitespace-pre-wrap"
        v-html="parsed"
      />
    </div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent, watch } from 'vue'
import { convertSrc } from '../lib/converter'
import text from '../assets/sampleSFC.txt?raw'

import prettier from 'prettier'
// @ts-ignore
import parserTypeScript from 'prettier/esm/parser-typescript.mjs'

// @ts-ignore
import hljs from 'highlight.js/lib/core'
// @ts-ignore
import typescript from 'highlight.js/lib/languages/typescript'
hljs.registerLanguage('typescript', typescript)
import 'highlight.js/styles/gruvbox-dark.css'

export default defineComponent({
  setup: () => {
    const input = ref(text)
    const parsed = ref('')
    watch(
      input,
      () => {
        try {
          const outputText = convertSrc(input.value)
          const prettifiedHtml = hljs.highlightAuto(
            prettier.format(outputText, {
              parser: 'typescript',
              plugins: [parserTypeScript],
            })
          ).value
          parsed.value = prettifiedHtml
        } catch (err) {
          // ignore parse error
        }
      },
      { immediate: true }
    )
    return { input, parsed }
  },
})
</script>
