import * as ts from 'typescript'
import { parseComponent } from 'vue-template-compiler'

const storePath = `ctx.root.$store`

const lifeCyleMap: Record<string, string | undefined> = {
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

export const parse = (input: string) => {
  const parsed = parseComponent(input)
  const scriptContent = parsed.script?.content || ''
  const sourceFile = ts.createSourceFile(
    '',
    scriptContent,
    ts.ScriptTarget.Latest
  )
  return convertScript(sourceFile)
}

const convertScript = (sourceFile: ts.SourceFile) => {
  const result = ts.transform(sourceFile, [transformer])
  const printer = ts.createPrinter()
  return result.transformed.map((src) => printer.printFile(src)).join('')
}

const replaceContext = (str: string, refNames: Record<string, boolean>) => {
  return str
    .replace(/this\.\$/g, 'ctx.root.$')
    .replace(/this\.([\w-]+)/g, (_, p1) => {
      return refNames[p1] ? `${p1}.value` : p1
    })
}

const getNodeByKind = (node: ts.Node, kind: ts.SyntaxKind): ts.Node[] => {
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

type ConvertedExpression = {
  expression: string
  name?: string
  lifeCycleName?: string
}

const transformer: ts.TransformerFactory<ts.SourceFile> = (context) => {
  return (sourceFile) => {
    let inExport = false
    let inExportObject = false

    const exportDefaultVisitor = (node: ts.Node): ts.Node => {
      const identifier = ts.factory.createIdentifier('defineComponent')

      // export default Vue.extend({})
      if (ts.isCallExpression(node)) {
        node = ts.factory.updateCallExpression(
          node,
          identifier,
          node.typeArguments,
          node.arguments
        )
      }
      // export default {}
      else if (ts.isObjectLiteralExpression(node)) {
        node = ts.factory.createCallExpression(identifier, undefined, [node])
      }
      return node
    }

    const visitor = (node: ts.Node): ts.Node => {
      if (ts.isExportAssignment(node)) {
        // export default
        inExport = true
        node = ts.visitEachChild(node, exportDefaultVisitor, context)
      } else if (inExport) {
        if (!inExportObject) {
          if (ts.isObjectLiteralExpression(node)) {
            // export default Vue.extend({ })
            inExportObject = true

            const otherProps: ts.ObjectLiteralElementLike[] = []
            const dataProps: ConvertedExpression[] = []
            const computedProps: ConvertedExpression[] = []
            const methodsProps: ConvertedExpression[] = []
            const lifeCycleProps: ConvertedExpression[] = []

            node.properties.forEach((prop) => {
              const name = prop.name?.getText(sourceFile) || ''
              switch (name) {
                case 'data':
                  dataProps.push(...dataConverter(prop, sourceFile))
                  break
                case 'computed':
                  computedProps.push(...computedConverter(prop, sourceFile))
                  break
                case 'watch':
                  break
                case 'methods':
                  methodsProps.push(...methodsConverter(prop, sourceFile))
                  break

                default:
                  if (
                    ts.isMethodDeclaration(prop) &&
                    lifeCyleMap[name] != null
                  ) {
                    // lifeCycleMethod
                    lifeCycleProps.push(...lifeCycleConverter(prop, sourceFile))
                    return
                  }

                  // 該当しないものはそのままにする
                  otherProps.push(prop)
                  break
              }
            })

            const setupProps: ConvertedExpression[] = [
              ...dataProps,
              ...computedProps,
              ...methodsProps,
              ...lifeCycleProps,
            ]

            const lifeCycleList = setupProps.reduce(
              (acc: string[], { lifeCycleName }) => {
                if (lifeCycleName != null && lifeCycleName !== '')
                  acc.push(lifeCycleName)
                return acc
              },
              []
            )

            const refNames = [...dataProps, ...computedProps].reduce(
              (acc: Record<string, boolean>, { name }) => {
                if (name != null) acc[name] = true
                return acc
              },
              {}
            )

            const returnStatement = `return {${setupProps
              .map(({ name }) => name)
              .join(',')}}`

            const setupStatements = [
              ...setupProps,
              { expression: returnStatement },
            ]
              .map(
                ({ expression }) =>
                  ts.createSourceFile(
                    '',
                    replaceContext(expression, refNames),
                    ts.ScriptTarget.Latest
                  ).statements
              )
              .flat()

            const setupMethod = ts.factory.createMethodDeclaration(
              undefined,
              undefined,
              undefined,
              'setup',
              undefined,
              undefined,
              [
                ts.factory.createParameterDeclaration(
                  undefined,
                  undefined,
                  undefined,
                  '_props'
                ),
                ts.factory.createParameterDeclaration(
                  undefined,
                  undefined,
                  undefined,
                  'ctx'
                ),
              ],
              undefined,
              ts.factory.createBlock(setupStatements)
            )
            // return replaced object node
            return ts.factory.createObjectLiteralExpression([
              ...otherProps,
              setupMethod,
            ])
          }
        }
      }
      return ts.visitEachChild(node, visitor, context)
    }
    return ts.visitNode(sourceFile, visitor)
  }
}

const getMethodExpression = (
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
      lifeCycleName,
      expression: `${lifeCycleName}(${async}()${type} =>${body})${immediate}`,
    }
  }
  return {
    name,
    expression: `const ${name} = ${async}()${type} =>${body}`,
  }
}

const nonNull = <T>(item: T): item is NonNullable<T> => item != null

const lifeCycleConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return [getMethodExpression(node, sourceFile)].filter(nonNull)
}

const getInitializerProps = (node: ts.Node): ts.ObjectLiteralElementLike[] => {
  if (!ts.isPropertyAssignment(node)) return []
  if (!ts.isObjectLiteralExpression(node.initializer)) return []
  return [...node.initializer.properties]
}

const dataConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  const [objNode] = getNodeByKind(node, ts.SyntaxKind.ObjectLiteralExpression)

  if (!(objNode && ts.isObjectLiteralExpression(objNode))) return []
  return objNode.properties
    .map((prop) => {
      if (!ts.isPropertyAssignment(prop)) return
      const name = prop.name.getText(sourceFile)
      const text = prop.initializer.getText(sourceFile)
      return { expression: `const ${name} = ref(${text})`, name }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}

const computedConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
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
                expression: `const ${name} = computed(() => ${storePath}.state.${namespaceText}.${name})`,
                name,
              }
            })
          case 'mapGetters':
            return names.map(({ text: name }) => {
              return {
                expression: `const ${name} = computed(() => ${storePath}.getters['${namespaceText}/${name}'])`,
                name,
              }
            })
          case 'mapActions':
            return names.map(({ text: name }) => {
              return {
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
          expression: `const ${name} = computed(()${typeName} => ${block})`,
          name,
        }
      } else if (ts.isPropertyAssignment(prop)) {
      }
    })
    .flat()
    .filter(nonNull)
}

const methodsConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return getInitializerProps(node)
    .map((prop) => {
      return getMethodExpression(prop, sourceFile)
    })
    .filter(nonNull)
}
