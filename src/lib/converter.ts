import ts from 'typescript'
import { parseComponent } from 'vue-template-compiler'
import {
  ConvertedExpression,
  lifecycleNameMap,
  replaceThisContext,
  getNodeByKind,
  nonNull,
} from './helper'
import { computedConverter } from './converters/computedConverter'
import { dataConverter } from './converters/dataConverter'
import { lifecycleConverter } from './converters/lifecycleConverter'
import { methodsConverter } from './converters/methodsConverter'
import { watchConverter } from './converters/watchConverter'
import { propReader } from './readers/propsReader'

const lifecycleRegExp = new RegExp(
  `^(${[...lifecycleNameMap.keys()].join('|')})$`
)

export const convertSrc = (input: string): string => {
  const parsed = parseComponent(input)
  const scriptContent = parsed.script?.content || ''
  const sourceFile = ts.createSourceFile(
    'src.tsx',
    scriptContent,
    ts.ScriptTarget.Latest
  )

  const exportAssignNode = getNodeByKind(
    sourceFile,
    ts.SyntaxKind.ExportAssignment
  )
  if (exportAssignNode) {
    // optionsAPI
    const options = convertOptions(sourceFile)
    if (!options) {
      throw new Error('invalid options')
    }

    const { setupProps, propNames, otherProps } = options

    const newSrc = ts.factory.createSourceFile(
      [
        ...getImportStatement(setupProps),
        ...sourceFile.statements.filter(
          (state) => !ts.isExportAssignment(state)
        ),
        getExportStatement(setupProps, propNames, otherProps),
      ],
      sourceFile.endOfFileToken,
      sourceFile.flags
    )
    const printer = ts.createPrinter()
    return printer.printFile(newSrc)
  }

  const classNode = getNodeByKind(sourceFile, ts.SyntaxKind.ClassDeclaration)
  if (classNode && ts.isClassDeclaration(classNode)) {
    // classAPI
    const options = convertOptions(sourceFile)

    const { setupProps, propNames, otherProps } = options || {
      setupProps: [],
      propNames: [],
      otherProps: [],
    }

    const classProps = parseClassNode(classNode, sourceFile)

    const dataProps: ConvertedExpression[] = Array.from(
      classProps.dataMap.entries()
    ).map(([key, val]) => {
      const { type, initializer } = val
      return {
        use: 'ref',
        returnNames: [key],
        expression: `const ${key} = ref${
          type ? `<${type}>` : ''
        }(${initializer})`,
      }
    })

    const computedProps: ConvertedExpression[] = Array.from(
      classProps.getterMap.entries()
    ).map(([key, val]) => {
      const { typeName, block } = val
      if (classProps.setterMap.has(key)) {
        const setter = classProps.setterMap.get(key)

        return {
          use: 'computed',
          expression: `const ${key} = computed({
            get()${typeName} ${block},
            set(${setter.parameters}) ${setter.block}
          })`,
          returnNames: [key],
        }
      }
      return {
        use: 'computed',
        expression: `const ${key} = computed(()${typeName} => ${block})`,
        returnNames: [key],
      }
    })
    const methodsProps: ConvertedExpression[] = Array.from(
      classProps.methodsMap.entries()
    ).map(([key, val]) => {
      const { async, type, body, parameters } = val
      return {
        expression: `const ${key} = ${async}(${parameters})${type} => ${body}`,
        returnNames: [key],
      }
    })
    const watchProps: ConvertedExpression[] = Array.from(
      classProps.watchMap.entries()
    ).map(([key, val]) => {
      const { callback, options } = val
      return {
        use: 'watch',
        expression: `watch(${[key, callback, options]
          .filter((item) => item != null)
          .join(',')})`,
      }
    })
    const lifecycleProps: ConvertedExpression[] = Array.from(
      classProps.lifecycleMap.entries()
    ).map(([key, val]) => {
      const newLifecycleName = lifecycleNameMap.get(key)
      const { async, body, parameters, type } = val

      const fn = `${async}(${parameters})${type} =>${body}`
      const immediate = newLifecycleName == null ? '()' : ''

      return {
        use: newLifecycleName,
        expression: `${newLifecycleName ?? ''}(${fn})${immediate}`,
      }
    })
    propNames.push(...Array.from(classProps.propsMap.keys()))

    const propsRefProps: ConvertedExpression[] =
      propNames.length === 0
        ? []
        : [
            {
              use: 'toRefs',
              expression: `const { ${propNames.join(',')} } = toRefs(props)`,
              returnNames: propNames,
            },
          ]

    setupProps.push(
      ...propsRefProps,
      ...dataProps,
      ...computedProps,
      ...methodsProps,
      ...watchProps,
      ...lifecycleProps
    )

    const props2 = Array.from(classProps.propsMap.entries()).reduce(
      (acc, [key, value]) => {
        const { type, args } = value
        return {
          ...acc,
          [key]: args.join('') || '{}',
        }
      },
      {}
    )

    // const propsState = ts.createSourceFile(
    //   '',
    //   `props: ${JSON.stringify(props2)}`,
    //   ts.ScriptTarget.Latest
    // ).statements as any

    // console.log(props2)

    otherProps.push(...classProps.otherProps)

    const newSrc = ts.factory.createSourceFile(
      [
        ...getImportStatement(setupProps),
        ...sourceFile.statements.filter(
          (state) => !ts.isClassDeclaration(state)
        ),
        getExportStatement(setupProps, propNames, otherProps),
      ],
      sourceFile.endOfFileToken,
      sourceFile.flags
    )
    const printer = ts.createPrinter()
    return printer.printFile(newSrc)
  }

  if (!exportAssignNode) throw new Error('no export node1')
}

const parseClassNode = (
  classNode: ts.ClassDeclaration,
  sourceFile: ts.SourceFile
) => {
  const propsMap: Map<string, any> = new Map()
  const dataMap: Map<string, any> = new Map()
  const getterMap: Map<string, any> = new Map()
  const setterMap: Map<string, any> = new Map()
  const methodsMap: Map<string, any> = new Map()
  const watchMap: Map<string, any> = new Map()
  const lifecycleMap: Map<string, any> = new Map()
  const otherProps: ts.ObjectLiteralElementLike[] = []

  classNode.members.forEach((member) => {
    const { decorators } = member
    if (ts.isGetAccessor(member)) {
      // computed method
      const { name: propName, body, type } = member
      const typeName = type ? `:${type.getText(sourceFile)}` : ''
      const block = body?.getText(sourceFile) || '{}'
      const name = propName.getText(sourceFile)

      getterMap.set(name, {
        typeName,
        block,
      })
    }
    if (ts.isSetAccessor(member)) {
      const { name: propName, body, type } = member
      const typeName = type ? `:${type.getText(sourceFile)}` : ''
      const block = body?.getText(sourceFile) || '{}'
      const name = propName.getText(sourceFile)
      const parameters = member.parameters
        .map((param) => param.getText(sourceFile))
        .join(',')

      setterMap.set(name, {
        parameters,
        typeName,
        block,
      })
    }
    if (ts.isMethodDeclaration(member)) {
      const name = member.name.getText(sourceFile)

      if (/^(render|data)$/.test(name)) {
        otherProps.push(member)
        return
      }

      const async = member.modifiers?.some(
        (mod) => mod.kind === ts.SyntaxKind.AsyncKeyword
      )
        ? 'async'
        : ''

      const type = member.type ? `:${member.type.getText(sourceFile)}` : ''
      const body = member.body?.getText(sourceFile) || '{}'
      const parameters = member.parameters
        .map((param) => param.getText(sourceFile))
        .join(',')

      const obj = {
        async,
        type,
        body,
        parameters,
      }

      if (lifecycleNameMap.has(name)) {
        lifecycleMap.set(name, obj)
      } else {
        methodsMap.set(name, obj)
      }

      if (decorators) {
        // watch
        const decorator = getDecoratorParams(decorators[0], sourceFile)
        if (!(decorator && decorator.decoratorName === 'Watch')) return

        const [target, options] = decorator.args
        watchMap.set(target, { callback: name, options })
      }
    }
    if (ts.isPropertyDeclaration(member)) {
      const name = member.name.getText(sourceFile)
      const type = member.type?.getText(sourceFile)
      if (decorators) {
        // props
        const decorator = getDecoratorParams(decorators[0], sourceFile)
        if (!(decorator && decorator.decoratorName === 'Prop')) return

        propsMap.set(name, {
          type,
          args: decorator.args,
        })
        return
      }
      const initializer = member.initializer?.getText(sourceFile)
      dataMap.set(name, {
        type,
        initializer,
      })
    }
  })

  return {
    otherProps,
    propsMap,
    dataMap,
    getterMap,
    setterMap,
    methodsMap,
    watchMap,
    lifecycleMap,
  }
}

const getDecoratorParams = (
  decorator: ts.Decorator,
  sourceFile: ts.SourceFile
) => {
  // @Prop, @Watch
  if (!ts.isCallExpression(decorator.expression)) return null

  const callExpression = decorator.expression
  const decoratorName = callExpression.expression.getText(sourceFile)
  const args = callExpression.arguments.map((arg) => {
    if (ts.isStringLiteral(arg)) {
      return arg.text
    }
    return arg.getText(sourceFile)
  })

  return {
    decoratorName,
    args,
  }
}
const convertOptions = (sourceFile: ts.SourceFile) => {
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
      case lifecycleRegExp.test(name):
        lifecycleProps.push(...lifecycleConverter(prop, sourceFile))
        break

      default:
        if (name === 'props') {
          propNames.push(...propReader(prop, sourceFile))
        }

        // 該当しないものはそのままにする
        otherProps.push(prop)
        break
    }
  })

  const propsRefProps: ConvertedExpression[] =
    propNames.length === 0
      ? []
      : [
          {
            use: 'toRefs',
            expression: `const { ${propNames.join(',')} } = toRefs(props)`,
            returnNames: propNames,
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

const getImportStatement = (setupProps: ConvertedExpression[]) => {
  const usedFunctions = [
    'defineComponent',
    ...new Set(setupProps.map(({ use }) => use).filter(nonNull)),
  ]
  return ts.createSourceFile(
    '',
    `import { ${usedFunctions.join(',')} } from '@vue/composition-api'`,
    ts.ScriptTarget.Latest
  ).statements
}

const getExportStatement = (
  setupProps: ConvertedExpression[],
  propNames: string[],
  otherProps: ts.ObjectLiteralElementLike[]
) => {
  const propsArg = propNames.length === 0 ? '_props' : `props`

  const setupArgs = [propsArg, 'ctx'].map((name) =>
    ts.factory.createParameterDeclaration(undefined, undefined, undefined, name)
  )

  const setupMethod = ts.factory.createMethodDeclaration(
    undefined,
    undefined,
    undefined,
    'setup',
    undefined,
    undefined,
    setupArgs,
    undefined,
    ts.factory.createBlock(getSetupStatements(setupProps))
  )

  return ts.factory.createExportAssignment(
    undefined,
    undefined,
    undefined,
    ts.factory.createCallExpression(
      ts.factory.createIdentifier('defineComponent'),
      undefined,
      [ts.factory.createObjectLiteralExpression([...otherProps, setupMethod])]
    )
  )
}

const getSetupStatements = (setupProps: ConvertedExpression[]) => {
  // this.prop => prop.valueにする対象
  const refNameMap: Map<string, true> = new Map()
  setupProps.forEach(({ use, returnNames }) => {
    if (
      returnNames != null &&
      use != null &&
      /^(toRefs|ref|computed)$/.test(use)
    ) {
      returnNames.forEach((returnName) => {
        refNameMap.set(returnName, true)
      })
    }
  })

  const returnPropsStatement = `return {${setupProps
    .filter((prop) => prop.use !== 'toRefs') // ignore spread props
    .map(({ returnNames }) => returnNames)
    .filter(nonNull)
    .flat()
    .join(',')}}`

  return [...setupProps, { expression: returnPropsStatement }]
    .map(
      ({ expression }) =>
        ts.createSourceFile(
          '',
          replaceThisContext(expression, refNameMap),
          ts.ScriptTarget.Latest
        ).statements
    )
    .flat()
}
