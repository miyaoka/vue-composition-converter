# vue-composition-converter

Convert optionsAPI into composition API

## demo

https://vue-composition-converter.vercel.app/

## convert into `setup`

- data/computed/watch/methods/lifecycle -> setup()
  - data -> ref()
  - computed
    - -> computed()
    - (mapActions) -> method
  - watch -> watch()
  - methods -> function
  - lifecycle -> lifecycle hooks
    - beforeCreate/created -> Immediate function

## convert `this`

- this.prop
  - (ref/computed) -> prop.value
  - (other) -> prop
- this.$globalProp -> ctx.root.$globalProp
