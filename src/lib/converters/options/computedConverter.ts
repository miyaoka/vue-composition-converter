import ts from 'typescript'
import {
  ConvertedExpression,
  getInitializerProps,
  nonNull,
  storePath,
} from '../../helper'

const snakeCaseToCamelCase = (str: string) =>
  str
    .toLowerCase()
    .replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace('-', '').replace('_', '')
    )

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

        const namespaceText = namespace.text as any
        const names = mapArray.elements as any

        switch (mapName) {
          case 'mapState': {
            const spread = names.map((el) => el.text)

            const storeName = snakeCaseToCamelCase(
              namespaceText
                .replace(/([A-Z])/g, '_$1')
                .toUpperCase()
                .replace('USE_', '')
            )

            return [
              {
                use: 'store',
                expression: `const ${storeName} = ${namespaceText}()`,
                returnNames: [storeName],
                pkg: 'ignore',
              },
              {
                use: 'storeToRefs',
                expression: `const { ${spread.join(
                  ', '
                )} } = storeToRefs(${storeName})`,
                returnNames: spread,
                pkg: 'pinia',
              },
            ]
          }
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
