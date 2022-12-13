import ts from 'typescript'
import {
  ConvertedExpression,
  getNodeByKind,
  lifecycleNameMap,
} from '../../helper'
import { computedConverter } from './computedConverter'
import { dataConverter } from './dataConverter'
import { lifecycleConverter } from './lifecycleConverter'
import { methodsConverter } from './methodsConverter'
import { watchConverter } from './watchConverter'
import { propReader } from './propsReader'

export const convertOptions = (sourceFile: ts.SourceFile) => {
  const exportAssignNode = getNodeByKind(
    sourceFile,
    ts.SyntaxKind.ExportAssignment
  )
  if (exportAssignNode) {
    const objectNode = getNodeByKind(
      exportAssignNode,
      ts.SyntaxKind.ObjectLiteralExpression
    )
    if (objectNode && ts.isObjectLiteralExpression(objectNode)) {
      return _convertOptions(objectNode, sourceFile)
    }
  }
  const classNode = getNodeByKind(sourceFile, ts.SyntaxKind.ClassDeclaration)
  if (classNode) {
    const decoratorNode = getNodeByKind(classNode, ts.SyntaxKind.Decorator)

    if (decoratorNode) {
      const objectNode = getNodeByKind(
        decoratorNode,
        ts.SyntaxKind.ObjectLiteralExpression
      )

      if (objectNode && ts.isObjectLiteralExpression(objectNode)) {
        return _convertOptions(objectNode, sourceFile)
      }
    }
  }

  return null
}

const _convertOptions = (
  exportObject: ts.ObjectLiteralExpression,
  sourceFile: ts.SourceFile
) => {
  const trueProps: ts.ObjectLiteralElementLike[] = []
  const otherProps: ts.ObjectLiteralElementLike[] = []
  const dataProps: ConvertedExpression[] = []
  const computedProps: ConvertedExpression[] = []
  const methodsProps: ConvertedExpression[] = []
  const watchProps: ConvertedExpression[] = []
  const lifecycleProps: ConvertedExpression[] = []
  const propNames: string[] = []

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
      case lifecycleNameMap.has(name):
        lifecycleProps.push(...lifecycleConverter(prop, sourceFile))
        break

      case name === 'props':
        trueProps.push(prop)
        propNames.push(...propReader(prop, sourceFile))
        break

      case name === 'name':
        break

      default:
        // 該当しないものはそのままにする
        otherProps.push(prop)
        break
    }
  })

  // there has to be a better way to do this
  const printer = ts.createPrinter()
  let p: string[] | string = printer
    .printFile(
      ts.factory.createSourceFile(
        [ts.factory.createObjectLiteralExpression(trueProps)],
        undefined,
        undefined
      )
    )
    .replace('{ props:', '')
    .split(' ')
  p.pop()

  p = p.length ? p.join(' ') : ''

  const propsRefProps: ConvertedExpression[] =
    propNames.length === 0
      ? []
      : [
          {
            use: 'props',
            expression: `const props = defineProps(${p})`,
            returnNames: propNames,
            pkg: 'ignore',
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

  return {
    setupProps,
    propNames,
    otherProps,
  }
}
