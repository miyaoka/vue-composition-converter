import ts from 'typescript'
import { ConvertedExpression, getNodeByKind, SetupPropType } from '../helper'

export const dataConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  const objNode = getNodeByKind(node, ts.SyntaxKind.ObjectLiteralExpression)

  if (!(objNode && ts.isObjectLiteralExpression(objNode))) return []
  return objNode.properties
    .map((prop) => {
      if (!ts.isPropertyAssignment(prop)) return
      const name = prop.name.getText(sourceFile)
      const text = prop.initializer.getText(sourceFile)
      return {
        use: 'ref',
        expression: `const ${name} = ref(${text})`,
        returnNames: [name],
      }
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
}
