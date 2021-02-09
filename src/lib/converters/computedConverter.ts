import ts from 'typescript'
import {
  ConvertedExpression,
  getInitializerProps,
  SetupPropType,
  nonNull,
} from '../helper'

export const computedConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  const storePath = `this.$store`

  return getInitializerProps(node)
    .map((prop) => {
      if (ts.isSpreadAssignment(prop)) {
        // mapGetters, mapState, mapActions
        if (!ts.isCallExpression(prop.expression)) return
        const { arguments: args, expression } = prop.expression

        if (!ts.isIdentifier(expression)) return
        const mapName = expression.text
        const [namespace, mapArray] = args
        if (!ts.isStringLiteral(namespace)) return
        if (!ts.isArrayLiteralExpression(mapArray)) return

        const namespaceText = namespace.text
        const names = mapArray.elements as ts.NodeArray<ts.StringLiteral>

        switch (mapName) {
          case 'mapState':
            return names.map(({ text: name }) => {
              return {
                type: SetupPropType.computed,
                expression: `const ${name} = computed(() => ${storePath}.state.${namespaceText}.${name})`,
                name,
              }
            })
          case 'mapGetters':
            return names.map(({ text: name }) => {
              return {
                type: SetupPropType.computed,
                expression: `const ${name} = computed(() => ${storePath}.getters['${namespaceText}/${name}'])`,
                name,
              }
            })
          case 'mapActions':
            return names.map(({ text: name }) => {
              return {
                type: SetupPropType.method,
                expression: `const ${name} = () => ${storePath}.dispatch('${namespaceText}/${name}')`,
                name,
              }
            })
        }
        return null
      } else if (ts.isMethodDeclaration(prop)) {
        const { name: propName, body, type } = prop
        const typeName = type ? `:${type.getText(sourceFile)}` : ''
        const block = body?.getText(sourceFile) || '{}'
        const name = propName.getText(sourceFile)

        return {
          type: SetupPropType.computed,
          expression: `const ${name} = computed(()${typeName} => ${block})`,
          name,
        }
      } else if (ts.isPropertyAssignment(prop)) {
        if (!ts.isObjectLiteralExpression(prop.initializer)) return

        const name = prop.name.getText(sourceFile)
        const block = prop.initializer.getText(sourceFile) || '{}'

        return {
          type: SetupPropType.watch,
          expression: `const ${name} = computed(${block})`,
        }
      }
    })
    .flat()
    .filter(nonNull)
}
