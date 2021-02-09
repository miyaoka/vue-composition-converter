import * as ts from 'typescript'
import { parseComponent } from 'vue-template-compiler'
import {
  ConvertedExpression,
  SetupPropType,
  lifeCyleMap,
  replaceThisContext,
  getNodeByKind,
  PropObj,
} from './helper'
import { computedConverter } from './converters/computedConverter'
import { dataConverter } from './converters/dataConverter'
import { lifeCycleConverter } from './converters/lifeCycleConverter'
import { methodsConverter } from './converters/methodsConverter'
import { watchConverter } from './converters/watchConverter'
import { propReader } from './readers/propsReader'

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
  const exportAssignNode = getNodeByKind(
    sourceFile,
    ts.SyntaxKind.ExportAssignment
  )
  if (!exportAssignNode) return

  const exportObject = getNodeByKind(
    exportAssignNode,
    ts.SyntaxKind.ObjectLiteralExpression
  )
  if (!(exportObject && ts.isObjectLiteralExpression(exportObject))) return

  const otherProps: ts.ObjectLiteralElementLike[] = []
  const dataProps: ConvertedExpression[] = []
  const computedProps: ConvertedExpression[] = []
  const methodsProps: ConvertedExpression[] = []
  const watchProps: ConvertedExpression[] = []
  const lifeCycleProps: ConvertedExpression[] = []
  const propNames: string[] = []

  const lifeCycleRegExp = new RegExp(`^${Object.keys(lifeCyleMap).join('|')}$`)

  exportObject.properties.forEach((prop) => {
    const name = prop.name?.getText(sourceFile) || ''
    switch (true) {
      case name === 'data':
        dataProps.push(...dataConverter(prop, sourceFile))
        break
      case name === 'computed':
        computedProps.push(...computedConverter(prop, sourceFile))
        break
      case name === 'watch':
        watchProps.push(...watchConverter(prop, sourceFile))
        break
      case name === 'methods':
        methodsProps.push(...methodsConverter(prop, sourceFile))
        break
      case lifeCycleRegExp.test(name):
        lifeCycleProps.push(...lifeCycleConverter(prop, sourceFile))
        break

      default:
        if (name === 'props') {
          propNames.push(
            ...propReader(prop, sourceFile).map(({ name }) => name)
          )
        }

        // 該当しないものはそのままにする
        otherProps.push(prop)
        break
    }
  })

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

            const otherProps: ts.ObjectLiteralElementLike[] = []
            const dataProps: ConvertedExpression[] = []
            const computedProps: ConvertedExpression[] = []
            const methodsProps: ConvertedExpression[] = []
            const watchProps: ConvertedExpression[] = []
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
                  watchProps.push(...watchConverter(prop, sourceFile))
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
              ...watchProps,
              ...lifeCycleProps,
            ]

            // const lifeCycleList = setupProps.reduce(
            //   (acc: string[], { lifeCycleName }) => {
            //     if (lifeCycleName != null && lifeCycleName !== '')
            //       acc.push(lifeCycleName)
            //     return acc
            //   },
            //   []
            // )

            // this.prop => prop.valueにする対象
            const refNameMap = setupProps.reduce(
              (acc: Record<string, boolean>, { type, name }) => {
                if (
                  name != null &&
                  [SetupPropType.ref, SetupPropType.computed].some(
                    (propType) => propType === type
                  )
                ) {
                  acc[name] = true
                }
                return acc
              },
              {}
            )

            const returnPropsStatement = `return {${setupProps
              .map(({ name }) => name)
              .filter((name) => name != null && name !== '')
              .join(',')}}`

            const setupStatements = [
              ...setupProps,
              { expression: returnPropsStatement },
            ]
              .map(
                ({ expression }) =>
                  ts.createSourceFile(
                    '',
                    replaceThisContext(expression, refNameMap),
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
