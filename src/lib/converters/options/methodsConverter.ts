import ts from 'typescript'
import {
  ConvertedExpression,
  findDescendantArrowFunction,
  getInitializerProps,
  hasWord,
  lifecycleNameMap,
  snakeCaseToCamelCase,
} from '../../helper'

export const getMethodExpression = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  if (findDescendantArrowFunction(node))
    throw new Error('Arrow Functions not allowed as root methods.')
  if (ts.isMethodDeclaration(node)) {
    const async = node.modifiers?.some(
      (mod) => mod.kind === ts.SyntaxKind.AsyncKeyword
    )
      ? 'async'
      : ''

    const name = node.name.getText(sourceFile)
    const type = node.type ? `:${node.type.getText(sourceFile)}` : ''
    const body = node.body?.getText(sourceFile) || '{}'
    const parameters = node.parameters
      .map((param) => param.getText(sourceFile))
      .join(',')
    const fn = `${async}(${parameters})${type} =>${body}`

    const pArray = parameters.split(',')

    pArray.forEach((parameter) => {
      if (parameter === '') return
      if (hasWord(parameter, body)) {
        throw new Error(
          `Scope issue in ${name} , ` +
            parameter +
            `parameter conflicts with this.${parameter}. `
        )
      }
    })

    if (lifecycleNameMap.has(name)) {
      const newLifecycleName = lifecycleNameMap.get(name)
      const immediate = newLifecycleName == null ? '()' : ''
      return [
        {
          use: newLifecycleName,
          expression: `${newLifecycleName ?? ''}(${fn})${immediate}`,
        },
      ]
    }
    return [
      {
        returnNames: [name],
        expression: `${async} function ${name} (${parameters})${type} ${body}`,
      },
    ]
  } else if (ts.isSpreadAssignment(node)) {
    // mapActions
    if (!ts.isCallExpression(node.expression)) return []
    const { arguments: args, expression } = node.expression
    if (!ts.isIdentifier(expression)) return []
    const mapName = expression.text
    const [namespace, mapArray] = args
    // if (!ts.isStringLiteral(namespace)) return [];
    // if (!ts.isArrayLiteralExpression(mapArray)) return [];

    const namespaceText = namespace.text
    const names = mapArray.elements as ts.NodeArray<ts.StringLiteral>

    if (mapName === 'mapActions') {
      const spread = names.map((el) => el.text).join(', ')

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
          expression: `const { ${spread} } = ${storeName}`,
          returnNames: [''],
          pkg: 'pinia',
        },
      ]
    }
  }
  return []
}

export const methodsConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return getInitializerProps(node)
    .map((prop) => {
      return getMethodExpression(prop, sourceFile)
    })
    .flat()
}
