import ts from 'typescript'
import {
  ConvertedExpression,
  getInitializerProps,
  nonNull,
  storePath,
} from '../helper'

export const computedConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return getInitializerProps(node)
    .map((prop) => {
      if (ts.isSpreadAssignment(prop)) {
        // mapGetters, mapState
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
                use: 'computed',
                expression: `const ${name} = computed(() => ${storePath}.state.${namespaceText}.${name})`,
                returnNames: [name],
              }
            })
          case 'mapGetters':
            return names.map(({ text: name }) => {
              return {
                use: 'computed',
                expression: `const ${name} = computed(() => ${storePath}.getters['${namespaceText}/${name}'])`,
                returnNames: [name],
              }
            })
        }
        return null
      } else if (ts.isMethodDeclaration(prop)) {
        // computed method
        const { name: propName, body, type } = prop
        const typeName = type ? `:${type.getText(sourceFile)}` : ''
        const block = body?.getText(sourceFile) || '{}'
        const name = propName.getText(sourceFile)

        return {
          use: 'computed',
          expression: `const ${name} = computed(()${typeName} => ${block})`,
          returnNames: [name],
        }
      } else if (ts.isPropertyAssignment(prop)) {
        // computed getter/setter
        if (!ts.isObjectLiteralExpression(prop.initializer)) return

        const name = prop.name.getText(sourceFile)
        const block = prop.initializer.getText(sourceFile) || '{}'

        return {
          use: 'computed',
          expression: `const ${name} = computed(${block})`,
          returnNames: [name],
        }
      }
    })
    .flat()
    .filter(nonNull)
}
