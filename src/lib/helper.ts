import ts from 'typescript'

export const SetupPropType = {
  ref: 'ref',
  computed: 'computed',
  reactive: 'reactive',
  method: 'method',
  watch: 'watch',
  lifecycle: 'lifecycle',
} as const

export type ConvertedExpression = {
  type: keyof typeof SetupPropType
  expression: string
  name?: string
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

export const getMethodExpression = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression | undefined => {
  if (!ts.isMethodDeclaration(node)) return

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
    return {
      use: lifecycleName === '' ? undefined : lifecycleName,
      type: SetupPropType.lifecycle,
      name: lifecycleName,
      expression: `${lifecycleName}(${fn})${immediate}`,
    }
  }
  return {
    type: SetupPropType.method,
    name,
    expression: `const ${name} = ${fn}`,
  }
}

export const replaceThisContext = (
  str: string,
  refNameMap: Record<string, boolean>
) => {
  return str
    .replace(/this\.\$/g, 'ctx.root.$')
    .replace(/this\.([\w-]+)/g, (_, p1) => {
      return refNameMap[p1] ? `${p1}.value` : p1
    })
}
