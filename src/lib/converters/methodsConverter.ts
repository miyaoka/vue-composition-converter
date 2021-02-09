import ts from 'typescript'
import {
  ConvertedExpression,
  getInitializerProps,
  getMethodExpression,
  nonNull,
} from '../helper'

export const methodsConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return getInitializerProps(node)
    .map((prop) => {
      return getMethodExpression(prop, sourceFile)
    })
    .filter(nonNull)
}
