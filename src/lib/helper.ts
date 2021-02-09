import ts from 'typescript'

export const SetupPropType = {
  ref: 'ref',
  computed: 'computed',
  reactive: 'reactive',
  method: 'method',
  watch: 'watch',
} as const

export type ConvertedExpression = {
  type: keyof typeof SetupPropType
  expression: string
  name?: string
  lifeCycleName?: string
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
): ts.Node[] => {
  const list: ts.Node[] = []
  const search = (node: ts.Node) => {
    if (node.kind === kind) {
      list.push(node)
    }
    ts.forEachChild(node, (child) => {
      search(child)
    })
  }
  search(node)
  return list
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

  const lifeCycleName = lifeCyleMap[name]

  if (lifeCycleName != null) {
    const immediate = lifeCycleName === '' ? '()' : ''
    return {
      type: SetupPropType.method,
      lifeCycleName,
      expression: `${lifeCycleName}(${async}()${type} =>${body})${immediate}`,
    }
  }
  return {
    type: SetupPropType.method,
    name,
    expression: `const ${name} = ${async}()${type} =>${body}`,
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
