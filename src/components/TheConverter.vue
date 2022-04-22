<template>
  <div class="flex flex-row h-full">
    <div class="flex-1 flex flex-col">
      <div class="flex flex-row">
        <h2>Input: (Vue2)</h2>
        <select v-model="selectedTemplate" class="border">
          <option v-for="templateItem in templateKeys" :key="templateItem">
            {{ templateItem }}
          </option>
        </select>
      </div>
      <textarea
        class="border w-full text-xs leading-3 flex-1 p-2"
        :class="{ hasError }"
        v-model="input"
      ></textarea>
    </div>
    <div class="flex-1 flex flex-col">
      <h2>Output: (Vue2 / Composition API)</h2>
      <pre
        class="hljs border w-full text-xs leading-3 flex-1 p-2 whitespace-pre-wrap select-all"
        v-html="output"
      />
    </div>
    <div
      class="absolute right-2 top-2 w-16 h-16 bg-white rounded-full p-2 hover:bg-yellow-400"
    >
      <a
        href="https://github.com/miyaoka/vue-composition-converter"
        target="_blank"
        title="repository"
      >
        <img src="../assets/GitHub-Mark-64px.png" />
      </a>
    </div>
  </div>
</template>

<script lang="ts">
import { ref, defineComponent, watch } from "vue";
import { convertSrc } from "../lib/converter";
import classApi from "../assets/template/classAPI.txt?raw";
import optionsApi from "../assets/template/optionsAPI.txt?raw";

import prettier from "prettier";
import parserTypeScript from "prettier/parser-typescript";
import hljs from "highlight.js/lib/core";
import typescript from "highlight.js/lib/languages/typescript";
hljs.registerLanguage("typescript", typescript);
import "highlight.js/styles/atom-one-dark.css";

const templateMap = new Map([
  ["optionsAPI", optionsApi],
  ["classAPI", classApi],
]);
export default defineComponent({
  setup: () => {
    const input = ref("");
    const output = ref("");
    const hasError = ref(false);
    const templateKeys = Array.from(templateMap.keys());

    const selectedTemplate = ref(templateKeys[0]);
    watch(
      selectedTemplate,
      async () => {
        hasError.value = false;
        try {
          input.value = templateMap.get(selectedTemplate.value) || "";
          console.log(input.value);
        } catch (err) {
          hasError.value = true;
          console.error(err);
        }
      },
      { immediate: true }
    );

    watch(
      input,
      () => {
        try {
          hasError.value = false;
          const outputText = convertSrc(input.value);
          const prettifiedHtml = hljs.highlightAuto(
            prettier.format(outputText, {
              parser: "typescript",
              plugins: [parserTypeScript],
            })
          ).value;
          output.value = prettifiedHtml;
        } catch (err) {
          hasError.value = true;
          console.error(err);
        }
      },
      { immediate: true }
    );
    return { input, output, hasError, templateKeys, selectedTemplate };
  },
});
</script>
<style scoped>
.hasError {
  @apply border-4 border-red-500 outline-none;
}
</style>
