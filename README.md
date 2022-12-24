# vue-composition-converter

Convert optionsAPI into composition API (script setup w/pinia)

Thanks to https://github.com/miyaoka for the original src code

## demo

https://converter.myspace.page

## convert options into `script setup`

- data, computed, watch, methods, lifecycle, props -> setup()
  - data -> ref()
  - computed -> computed()
  - watch -> watch()
  - methods -> function
  - lifecycle -> lifecycle hooks
    - beforeCreate, created -> Immediate function
  - props -> toRefs()

## convert `this`

- this.prop
  - (toRefs, ref, computed) -> prop.value
  - (other) -> prop
- this.$globalProp -> ctx.root.$globalProp
