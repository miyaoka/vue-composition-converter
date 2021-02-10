# vue-composition-converter

Convert optionsAPI into composition API

## demo

https://vue-composition-converter.vercel.app/

## convert options into `setup`

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
