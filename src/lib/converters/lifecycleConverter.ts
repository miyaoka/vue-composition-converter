import ts from 'typescript'
import { ConvertedExpression, nonNull, getMethodExpression } from '../helper'

export const lifecycleConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return [getMethodExpression(node, sourceFile)].filter(nonNull)
}
