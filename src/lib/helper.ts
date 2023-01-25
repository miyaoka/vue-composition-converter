import ts from 'typescript'

// export const SetupPropType = {
//   ref: 'ref',
//   computed: 'computed',
//   reactive: 'reactive',
//   method: 'method',
//   watch: 'watch',
//   lifecycle: 'lifecycle',
// } as const

export type ConvertedExpression = {
  expression: string
  returnNames?: string[]
  use?: string
  isBreak?: boolean
  pkg?: string
  sort?: number | undefined
}

export const snakeCaseToCamelCase = (str: string) =>
  str
    .toLowerCase()
    .replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace('-', '').replace('_', '')
    )

export const lifecycleNameMap: Map<string, string | undefined> = new Map([
  ['beforeCreate', undefined],
  ['created', undefined],
  ['beforeMount', 'onBeforeMount'],
  ['mounted', 'onMounted'],
  ['beforeUpdate', 'onBeforeUpdate'],
  ['updated', 'onUpdated'],
  ['beforeUnmount', 'onBeforeUnmount'],
  ['beforeDestroy', 'onBeforeUnmount'],
  ['destroyed', 'onUnmounted'],
  ['errorCaptured', 'onErrorCaptured'],
  ['renderTracked', 'onRenderTracked'],
  ['renderTriggered', 'onRenderTriggered'],
])

export const nonNull = <T>(item: T): item is NonNullable<T> => item != null

export const getNodeByKind = (
  node: ts.Node,
  kind: ts.SyntaxKind
): ts.Node | undefined => {
  const find = (node: ts.Node): ts.Node | undefined => {
    return ts.forEachChild(node, (child) => {
      if (child.kind === kind) {
        return child
      }
      return find(child)
    })
  }
  return find(node)
}

export function hasWord(word: string, str: string) {
  const regex = new RegExp('this.' + word)
  return regex.test(str)
}

export const getInitializerProps = (
  node: ts.Node
): ts.ObjectLiteralElementLike[] => {
  if (!ts.isPropertyAssignment(node)) return []
  if (!ts.isObjectLiteralExpression(node.initializer)) return []
  return [...node.initializer.properties]
}

export const storePath = `this.$store`

export function findDescendantArrowFunction(node: ts.Node): boolean {
  if (ts.isArrowFunction(node)) {
    return !!node
  } else {
    return !!ts.forEachChild(node, (v) => ts.isArrowFunction(v))
  }
}

export const contextProps = [
  'attrs',
  'slots',
  'parent',
  'root',
  'listeners',
  'refs',
  'emit',
]

const findEmitStrings = (str: string) => {
  const emitRegex = /this\.\$emit\(['"](.*)['"]/g
  let match
  const emitStrings = []
  while ((match = emitRegex.exec(str)) !== null) {
    emitStrings.push(match[1])
  }
  return emitStrings
}
export function getStringFromExpression(str: string): string[] {
  return findEmitStrings(str)
}

export const replaceThisContext = (
  str: string,
  refNameMap: Map<string, true>,
  propNameMap: Map<string, true>
) => {
  return str
    .replace(/this\.\$(\w+)/g, (_, p1) => {
      if (p1 === 'refs') return 'NEW_REF'
      if (p1 === 'emit') return 'emit'
      if (p1 === 'nextTick') return 'nextTick'
      if (contextProps.includes(p1)) return `ctx.${p1}`
      return `ctx.root.$${p1}`
    })
    .replace(/this\.([\w-]+)/g, (_, p1) => {
      if (propNameMap.has(p1)) return `props.${p1}`

      return refNameMap.has(p1) ? `${p1}.value` : p1
    })
}

export const getImportStatement = (setupProps: ConvertedExpression[]) => {
  const usedFunctions = [
    ...new Set(
      setupProps
        .filter((el) => {
          if (!el.pkg) return true
        })
        .map(({ use }) => use)
        .filter(nonNull)
    ),
  ]

  const results = [
    ...ts.createSourceFile(
      '',
      `import { ${usedFunctions.join(',')} } from 'vue'`,
      ts.ScriptTarget.Latest
    ).statements,
  ]

  const extraImports = [
    ...new Set(
      setupProps
        .filter((el) => el.pkg && el.pkg !== 'ignore')
        .map(({ use }) => use)
        .filter(nonNull)
    ),
  ]
  if (extraImports.length)
    results.push(
      ...ts.createSourceFile(
        '',
        `import { ${extraImports.join(',')} } from 'pinia'`,
        ts.ScriptTarget.Latest
      ).statements
    )

  return results
}

export const getExportStatement = (
  setupProps: ConvertedExpression[],
  propNames: string[],
  otherProps: ts.ObjectLiteralElementLike[]
) => {
  const body = ts.factory.createBlock(getSetupStatements(setupProps))

  if (otherProps.length)
    body.statements.push(
      ts.factory.createIdentifier('\n//TODO! extra root methods:\n')
    )
  body.statements = body.statements.concat(otherProps)

  return body.statements
}

export const findEmiters = (str: string, emitterSet: Set<string>) => {
  return str.replace(/this\.\$(\w+)/g, (_, p1) => {
    if (p1 === 'emit') {
      const emitNames: string[] = getStringFromExpression(str)
      if (emitNames.length) {
        emitNames.forEach((emitName) => emitterSet.add(emitName))
      }
    }
    return ''
  })
}

export const sortMap = [
  'emitter',
  'props',
  'ref',
  'store',
  'storeToRefs',
  'computed',
]

export const getSetupStatements = (setupProps: ConvertedExpression[]) => {
  // this.prop => prop.valueにする対象
  const refNameMap: Map<string, true> = new Map()
  const propNameMap: Map<string, true> = new Map()
  const emitterNameSet: Set<string> = new Set()

  setupProps.forEach(({ expression }) =>
    findEmiters(expression, emitterNameSet)
  )

  if (emitterNameSet.size !== 0)
    setupProps.unshift({
      use: 'emitter',
      expression: `const emit = defineEmits(${JSON.stringify(
        Array.from(emitterNameSet)
      )})`,
    })

  setupProps.forEach((val) => {
    const { use, returnNames } = val

    const sortIndex = sortMap.findIndex((val) => val === use)
    val.sort = sortIndex > -1 ? sortIndex : 99
    if (
      returnNames != null &&
      use != null &&
      /^(toRefs|ref|computed|storeToRefs)$/.test(use)
    ) {
      returnNames.forEach((returnName) => {
        refNameMap.set(returnName, true)
      })
    } else if (returnNames != null && use != null && /^(props)$/.test(use)) {
      returnNames.forEach((returnName) => {
        propNameMap.set(returnName, true)
      })
    }
  })

  const returnPropsStatement = ``

  return [...setupProps, { expression: returnPropsStatement }]
    .sort((a, b): number => {
      if (typeof b.sort === 'number' && typeof a.sort === 'number')
        return a.sort - b.sort
      return 0
    })

    .filter(
      (value, index, self) =>
        index === self.findIndex((t) => t.expression === value.expression)
    )
    .reduce((pv: ConvertedExpression[], cv: ConvertedExpression) => {
      const previous = pv[pv.length - 1]
      if (
        (previous && cv.sort !== previous.sort) ||
        cv.use === 'computed' ||
        !cv.use
      )
        pv.push({ isBreak: true, expression: '' })
      pv.push(cv)
      return pv
    }, [])
    .map(({ expression, isBreak }) => {
      if (isBreak) return ts.factory.createIdentifier('\n')
      else
        return ts.createSourceFile(
          '',
          replaceThisContext(expression, refNameMap, propNameMap),
          ts.ScriptTarget.Latest
        ).statements
    })
    .flat()
}
