import ts from 'typescript'
import { ConvertedExpression, nonNull, getMethodExpression } from '../helper'

export const lifeCycleConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return [getMethodExpression(node, sourceFile)].filter(nonNull)
}
