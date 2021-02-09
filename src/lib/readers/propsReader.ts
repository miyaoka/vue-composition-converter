import ts from 'typescript'
import { nonNull } from '../helper'

export const propReader = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): string[] => {
  if (!ts.isPropertyAssignment(node)) return []

  if (ts.isObjectLiteralExpression(node.initializer)) {
    return node.initializer.properties
      .map((prop) => {
        if (!ts.isPropertyAssignment(prop)) return null
        return prop.name.getText(sourceFile)
      })
      .filter(nonNull)
  } else if (ts.isArrayLiteralExpression(node.initializer)) {
    return node.initializer.elements.map((el) => {
      return el.getText(sourceFile)
    })
  }
  return []
}
