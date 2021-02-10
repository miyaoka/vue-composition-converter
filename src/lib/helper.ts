import ts from 'typescript'

// export const SetupPropType = {
//   ref: 'ref',
//   computed: 'computed',
//   reactive: 'reactive',
//   method: 'method',
//   watch: 'watch',
//   lifecycle: 'lifecycle',
// } as const

export type ConvertedExpression = {
  expression: string
  returnNames?: string[]
  use?: string
}

export const lifeCyleMap: Record<string, string | undefined> = {
  beforeCreate: '',
  created: '',
  beforeMount: 'onBeforeMount',
  mounted: 'onMounted',
  beforeUpdate: 'onBeforeUpdate',
  updated: 'onUpdated',
  beforeDestroy: 'onBeforeUnmount',
  destroyed: 'onUnmounted',
  errorCaptured: 'onErrorCaptured',
  renderTracked: 'onRenderTracked',
  renderTriggered: 'onRenderTriggered',
}

export const nonNull = <T>(item: T): item is NonNullable<T> => item != null

export const getNodeByKind = (
  node: ts.Node,
  kind: ts.SyntaxKind
): ts.Node | undefined => {
  const find = (node: ts.Node): ts.Node | undefined => {
    return ts.forEachChild(node, (child) => {
      if (child.kind === kind) {
        return child
      }
      return find(child)
    })
  }
  return find(node)
}

export const getInitializerProps = (
  node: ts.Node
): ts.ObjectLiteralElementLike[] => {
  if (!ts.isPropertyAssignment(node)) return []
  if (!ts.isObjectLiteralExpression(node.initializer)) return []
  return [...node.initializer.properties]
}

export const storePath = `this.$store`

export const getMethodExpression = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
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

    const lifecycleName = lifeCyleMap[name]
    if (lifecycleName != null) {
      const immediate = lifecycleName === '' ? '()' : ''
      return [
        {
          use: lifecycleName === '' ? undefined : lifecycleName,
          expression: `${lifecycleName}(${fn})${immediate}`,
        },
      ]
    }
    return [
      {
        returnNames: [name],
        expression: `const ${name} = ${fn}`,
      },
    ]
  } else if (ts.isSpreadAssignment(node)) {
    // mapActions
    if (!ts.isCallExpression(node.expression)) return []
    const { arguments: args, expression } = node.expression
    if (!ts.isIdentifier(expression)) return []
    const mapName = expression.text
    const [namespace, mapArray] = args
    if (!ts.isStringLiteral(namespace)) return []
    if (!ts.isArrayLiteralExpression(mapArray)) return []

    const namespaceText = namespace.text
    const names = mapArray.elements as ts.NodeArray<ts.StringLiteral>

    if (mapName === 'mapActions') {
      return names.map(({ text: name }) => {
        return {
          expression: `const ${name} = () => ${storePath}.dispatch('${namespaceText}/${name}')`,
          returnNames: [name],
        }
      })
    }
  }
  return []
}

export const replaceThisContext = (
  str: string,
  refNameMap: Map<string, true>
) => {
  return str
    .replace(/this\.\$/g, 'ctx.root.$')
    .replace(/this\.([\w-]+)/g, (_, p1) => {
      return refNameMap.has(p1) ? `${p1}.value` : p1
    })
}
