import ts from 'typescript'
import {
  ConvertedExpression,
  getInitializerProps,
  SetupPropType,
  nonNull,
} from '../helper'

export const watchConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return getInitializerProps(node)
    .map((prop) => {
      if (ts.isMethodDeclaration(prop)) {
        const name = prop.name.getText(sourceFile)
        const parameters = prop.parameters
          .map((param) => param.getText(sourceFile))
          .join(',')
        const block = prop.body?.getText(sourceFile) || '{}'

        return {
          use: 'watch',
          type: SetupPropType.watch,
          expression: `watch(${name}, (${parameters}) => ${block})`,
        }
      } else if (ts.isPropertyAssignment(prop)) {
        if (!ts.isObjectLiteralExpression(prop.initializer)) return

        const props = prop.initializer.properties.reduce(
          (acc: Record<string, ts.ObjectLiteralElementLike>, prop) => {
            const name = prop.name?.getText(sourceFile)
            if (name) acc[name] = prop
            return acc
          },
          {}
        )

        const { handler, immediate, deep } = props
        if (!(handler && ts.isMethodDeclaration(handler))) return

        const options = [immediate, deep].reduce(
          (acc: Record<string, any>, prop) => {
            if (prop && ts.isPropertyAssignment(prop)) {
              const name = prop.name?.getText(sourceFile)
              if (name) {
                acc[name] = prop.initializer.kind === ts.SyntaxKind.TrueKeyword
              }
            }
            return acc
          },
          {}
        )

        const name = prop.name.getText(sourceFile)
        const parameters = handler.parameters
          .map((param) => param.getText(sourceFile))
          .join(',')
        const block = handler.body?.getText(sourceFile) || '{}'

        return {
          use: 'watch',
          type: SetupPropType.watch,
          expression: `watch(${name}, (${parameters}) => ${block}, ${JSON.stringify(
            options
          )} )`,
        }
      }
    })
    .filter(nonNull)
}
