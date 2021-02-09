import ts from 'typescript'
import { nonNull, PropObj } from '../helper'

export const propReader = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): PropObj[] => {
  if (!ts.isPropertyAssignment(node)) return []

  if (ts.isObjectLiteralExpression(node.initializer)) {
    return node.initializer.properties
      .map((prop) => {
        if (!ts.isPropertyAssignment(prop)) return null

        return {
          name: prop.name.getText(sourceFile),
          type: prop.initializer.getText(sourceFile),
        }
      })
      .filter(nonNull)
  } else if (ts.isArrayLiteralExpression(node.initializer)) {
    return node.initializer.elements.map((el) => {
      return {
        name: el.getText(sourceFile),
      }
    })
  }
  return []
}
