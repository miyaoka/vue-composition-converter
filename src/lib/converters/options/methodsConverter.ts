import ts from 'typescript'
import {
  ConvertedExpression,
  getInitializerProps,
  getMethodExpression,
} from '../../helper'

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
