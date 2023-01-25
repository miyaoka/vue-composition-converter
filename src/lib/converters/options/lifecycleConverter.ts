import ts from 'typescript'
import { ConvertedExpression } from '../../helper'
import { getMethodExpression } from './methodsConverter'

export const lifecycleConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return getMethodExpression(node, sourceFile)
}
