import ts from 'typescript'
import { parseComponent } from 'vue-template-compiler'
import {
  ConvertedExpression,
  lifeCyleMap,
  replaceThisContext,
  getNodeByKind,
  nonNull,
} from './helper'
import { computedConverter } from './converters/computedConverter'
import { dataConverter } from './converters/dataConverter'
import { lifecycleConverter } from './converters/lifecycleConverter'
import { methodsConverter } from './converters/methodsConverter'
import { watchConverter } from './converters/watchConverter'
import { propReader } from './readers/propsReader'

export const convertSrc = (input: string): string => {
  const parsed = parseComponent(input)
  const scriptContent = parsed.script?.content || ''
  const sourceFile = ts.createSourceFile(
    '',
    scriptContent,
    ts.ScriptTarget.Latest
  )

  const exportAssignNode = getNodeByKind(
    sourceFile,
    ts.SyntaxKind.ExportAssignment
  )
  if (!exportAssignNode) throw new Error('no export node')

  const exportObject = getNodeByKind(
    exportAssignNode,
    ts.SyntaxKind.ObjectLiteralExpression
  )
  if (!(exportObject && ts.isObjectLiteralExpression(exportObject)))
    throw new Error('no export object')

  const otherProps: ts.ObjectLiteralElementLike[] = []
  const dataProps: ConvertedExpression[] = []
  const computedProps: ConvertedExpression[] = []
  const methodsProps: ConvertedExpression[] = []
  const watchProps: ConvertedExpression[] = []
  const lifecycleProps: ConvertedExpression[] = []
  const propNames: string[] = []

  const lifecycleRegExp = new RegExp(`^${Object.keys(lifeCyleMap).join('|')}$`)

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
      case lifecycleRegExp.test(name):
        lifecycleProps.push(...lifecycleConverter(prop, sourceFile))
        break

      default:
        if (name === 'props') {
          propNames.push(...propReader(prop, sourceFile))
        }

        // 該当しないものはそのままにする
        otherProps.push(prop)
        break
    }
  })

  const propsRefProps: ConvertedExpression[] =
    propNames.length === 0
      ? []
      : [
          {
            use: 'toRefs',
            expression: `const { ${propNames.join(',')} } = toRefs(props)`,
            returnNames: propNames,
          },
        ]

  const setupProps: ConvertedExpression[] = [
    ...propsRefProps,
    ...dataProps,
    ...computedProps,
    ...methodsProps,
    ...watchProps,
    ...lifecycleProps,
  ]

  const newSrc = ts.factory.createSourceFile(
    [
      ...getImportStatement(setupProps),
      ...sourceFile.statements.filter((state) => !ts.isExportAssignment(state)),
      getExportStatement(setupProps, propNames, otherProps),
    ],
    sourceFile.endOfFileToken,
    sourceFile.flags
  )
  const printer = ts.createPrinter()
  return printer.printFile(newSrc)
}

const getImportStatement = (setupProps: ConvertedExpression[]) => {
  const usedFunctions = [
    'defineComponent',
    ...new Set(setupProps.map(({ use }) => use).filter(nonNull)),
  ]
  return ts.createSourceFile(
    '',
    `import { ${usedFunctions.join(',')} } from '@vue/composition-api'`,
    ts.ScriptTarget.Latest
  ).statements
}

const getExportStatement = (
  setupProps: ConvertedExpression[],
  propNames: string[],
  otherProps: ts.ObjectLiteralElementLike[]
) => {
  const propsArg = propNames.length === 0 ? '_props' : `props`

  const setupArgs = [propsArg, 'ctx'].map((name) =>
    ts.factory.createParameterDeclaration(undefined, undefined, undefined, name)
  )

  const setupMethod = ts.factory.createMethodDeclaration(
    undefined,
    undefined,
    undefined,
    'setup',
    undefined,
    undefined,
    setupArgs,
    undefined,
    ts.factory.createBlock(getSetupStatements(setupProps))
  )

  return ts.factory.createExportAssignment(
    undefined,
    undefined,
    undefined,
    ts.factory.createCallExpression(
      ts.factory.createIdentifier('defineComponent'),
      undefined,
      [ts.factory.createObjectLiteralExpression([...otherProps, setupMethod])]
    )
  )
}

const getSetupStatements = (setupProps: ConvertedExpression[]) => {
  // this.prop => prop.valueにする対象
  const refNameMap: Map<string, true> = new Map()
  setupProps.forEach(({ use, returnNames }) => {
    if (
      returnNames != null &&
      use != null &&
      /^(toRefs|ref|computed)$/.test(use)
    ) {
      returnNames.forEach((returnName) => {
        refNameMap.set(returnName, true)
      })
    }
  })

  const returnPropsStatement = `return {${setupProps
    .filter((prop) => prop.use !== 'toRefs') // ignore spread props
    .map(({ returnNames }) => returnNames)
    .filter(nonNull)
    .flat()
    .join(',')}}`

  return [...setupProps, { expression: returnPropsStatement }]
    .map(
      ({ expression }) =>
        ts.createSourceFile(
          '',
          replaceThisContext(expression, refNameMap),
          ts.ScriptTarget.Latest
        ).statements
    )
    .flat()
}
