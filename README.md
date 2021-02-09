# vue-composition-converter

Convert optionsAPI into composition API

## demo

https://vue-composition-converter.vercel.app/

## convert into `setup`

- data/computed/watch/methods/lifecycle -> setup()
  - data -> ref()
  - computed
    - -> computed()
    - -> method (mapActions)
  - watch -> watch()
  - methods -> function
  - lifecycle -> lifecycle hooks
    - beforeCreate/created -> Immediate function

## convert `this`

- this.prop
  - -> prop.value (ref/computed)
  - -> prop(other)
- this.$globalProp -> ctx.root.$globalProp
