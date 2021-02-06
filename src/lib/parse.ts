import * as ts from 'typescript'
import { parseComponent } from 'vue-template-compiler'

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

            // console.log(ast.statements)

            const lifeCycles: { name: string; block: ts.Block }[] = []
            const otherProps: ts.ObjectLiteralElementLike[] = []

            const setupProps = []
            for (const prop of node.properties) {
              const name = prop.name?.getText(sourceFile)
              switch (name) {
                case 'data':
                  break
                case 'computed':
                  setupProps.push(...computedConverter(prop, sourceFile))

                  break
                case 'methods':
                  if (!ts.isPropertyAssignment(prop)) continue
                  // console.log(prop.initializer)
                  break
                case 'watch':
                  break
                case 'beforeCreate':
                case 'created':
                case 'beforeMount':
                case 'mounted':
                case 'beforeUpdate':
                case 'updated':
                case 'beforeDetroy':
                case 'activated':
                case 'deactivated':
                  if (ts.isMethodDeclaration(prop)) {
                    prop.body?.getText(sourceFile)
                    lifeCycles.push({ name, block: prop.body })
                  }
                  break
                default:
                  otherProps.push(prop)
                  break
              }
              // console.log(prop)
              // return name !== 'data'
            }
            // return setup

            const setupStatements = setupProps
              .map(
                (item) =>
                  ts.createSourceFile('', item, ts.ScriptTarget.Latest)
                    .statements
              )
              .flat()

            // console.log(setupProps, setupStatements)

            const setup = ts.factory.createMethodDeclaration(
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
            // return node
            const ex = ts.factory.createObjectLiteralExpression([
              ...otherProps,
              setup,
            ])

            return ex
          }
        }
      }

      return ts.visitEachChild(node, visitor, context)
    }

    return ts.visitNode(sourceFile, visitor)
  }
}

const storePath = `ctx.root.$store`

export const computedConverter = (node: ts.Node, sourceFile: ts.SourceFile) => {
  if (!ts.isPropertyAssignment(node)) return []
  if (!ts.isObjectLiteralExpression(node.initializer)) return []

  const props = node.initializer.properties
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
              return `const ${name} = computed(() => ${storePath}.state.${namespaceText}.${name})`
            })
          case 'mapGetters':
            return names.map(({ text: name }) => {
              return `const ${name} = computed(() => ${storePath}.getters['${namespaceText}/${name}'])`
            })
          case 'mapActions':
            return names.map(({ text: name }) => {
              return `const ${name} = () => ${storePath}.dispatch('${namespaceText}/${name}')`
            })
        }
        return null
      } else if (ts.isMethodDeclaration(prop)) {
        const { name, body, type } = prop
        const typeName = type ? `:${type.getText(sourceFile)}` : ''
        const block = body?.getText(sourceFile) || '{}'

        return `const ${name.getText(sourceFile)} = ()${typeName} => ${block}`
      } else if (ts.isPropertyAssignment(prop)) {
      }
    })
    .flat()
    .filter((item): item is NonNullable<typeof item> => item != null)

  return props
}
