import ts from "typescript";

// export const SetupPropType = {
//   ref: 'ref',
//   computed: 'computed',
//   reactive: 'reactive',
//   method: 'method',
//   watch: 'watch',
//   lifecycle: 'lifecycle',
// } as const

export type ConvertedExpression = {
  expression: string;
  returnNames?: string[];
  use?: string;
  isBreak?: boolean;
  pkg?: string;
  sort?: number | undefined;
};

const snakeCaseToCamelCase = (str: string) =>
  str
    .toLowerCase()
    .replace(/([-_][a-z])/g, (group) =>
      group.toUpperCase().replace("-", "").replace("_", "")
    );

export const lifecycleNameMap: Map<string, string | undefined> = new Map([
  ["beforeCreate", undefined],
  ["created", undefined],
  ["beforeMount", "onBeforeMount"],
  ["mounted", "onMounted"],
  ["beforeUpdate", "onBeforeUpdate"],
  ["updated", "onUpdated"],
  ["beforeUnmount", "onBeforeUnmount"],
  ["beforeDestroy", "onBeforeUnmount"],
  ["destroyed", "onUnmounted"],
  ["errorCaptured", "onErrorCaptured"],
  ["renderTracked", "onRenderTracked"],
  ["renderTriggered", "onRenderTriggered"],
]);

export const nonNull = <T>(item: T): item is NonNullable<T> => item != null;

export const getNodeByKind = (
  node: ts.Node,
  kind: ts.SyntaxKind
): ts.Node | undefined => {
  const find = (node: ts.Node): ts.Node | undefined => {
    return ts.forEachChild(node, (child) => {
      if (child.kind === kind) {
        return child;
      }
      return find(child);
    });
  };
  return find(node);
};

export const getInitializerProps = (
  node: ts.Node
): ts.ObjectLiteralElementLike[] => {
  if (!ts.isPropertyAssignment(node)) return [];
  if (!ts.isObjectLiteralExpression(node.initializer)) return [];
  return [...node.initializer.properties];
};

export const storePath = `this.$store`;

export const getMethodExpression = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  if (ts.isMethodDeclaration(node)) {
    const async = node.modifiers?.some(
      (mod) => mod.kind === ts.SyntaxKind.AsyncKeyword
    )
      ? "async"
      : "";

    const name = node.name.getText(sourceFile);
    const type = node.type ? `:${node.type.getText(sourceFile)}` : "";
    const body = node.body?.getText(sourceFile) || "{}";
    const parameters = node.parameters
      .map((param) => param.getText(sourceFile))
      .join(",");
    const fn = `${async}(${parameters})${type} =>${body}`;

    if (lifecycleNameMap.has(name)) {
      const newLifecycleName = lifecycleNameMap.get(name);
      const immediate = newLifecycleName == null ? "()" : "";
      return [
        {
          use: newLifecycleName,
          expression: `${newLifecycleName ?? ""}(${fn})${immediate}`,
        },
      ];
    }
    return [
      {
        returnNames: [name],
        expression: `${async} function ${name} (${parameters})${type} ${body}`,
      },
    ];
  } else if (ts.isSpreadAssignment(node)) {
    // mapActions
    if (!ts.isCallExpression(node.expression)) return [];
    const { arguments: args, expression } = node.expression;
    if (!ts.isIdentifier(expression)) return [];
    const mapName = expression.text;
    const [namespace, mapArray] = args;
    // if (!ts.isStringLiteral(namespace)) return [];
    // if (!ts.isArrayLiteralExpression(mapArray)) return [];

    const namespaceText = namespace.text;
    const names = mapArray.elements as ts.NodeArray<ts.StringLiteral>;

    if (mapName === "mapActions") {
      const spread = names.map((el) => el.text).join(", ");

      const storeName = snakeCaseToCamelCase(
        namespaceText
          .replace(/([A-Z])/g, "_$1")
          .toUpperCase()
          .replace("USE_", "")
      );
      return [
        {
          use: "store",
          expression: `const ${storeName} = ${namespaceText}()`,
          returnNames: [storeName],
          pkg: "",
        },
        {
          use: "storeToRefs",
          expression: `const { ${spread} } = ${storeName}`,
          returnNames: [""],
          pkg: "pinia",
        },
      ];
    }
  }
  return [];
};

const contextProps = [
  "attrs",
  "slots",
  "parent",
  "root",
  "listeners",
  "refs",
  "emit",
];

function getStringFromExpression(str: string) {
  const reg = /this\.\$emit\((.+)\)/g;
  const result = reg.exec(str);
  if (result) {
    let [, p1] = result;
    if (p1.includes(",")) {
      p1 = p1.split(",")[0];
    }
    return p1.replace(/'/g, "").replace(/"/g, "").replace(/`/g, "");
  }
  return "";
}

export const replaceThisContext = (
  str: string,
  refNameMap: Map<string, true>,
  propNameMap: Map<string, true>
) => {
  str;

  return str
    .replace(/this\.\$(\w+)/g, (_, p1) => {
      if (p1 === "refs") return "NEW_REF";
      if (p1 === "emit") return "emit";
      if (contextProps.includes(p1)) return `ctx.${p1}`;
      return `ctx.root.$${p1}`;
    })
    .replace(/this\.([\w-]+)/g, (_, p1) => {
      if (propNameMap.has(p1)) return `props.${p1}`;

      return refNameMap.has(p1) ? `${p1}.value` : p1;
    });
};

export const getImportStatement = (setupProps: ConvertedExpression[]) => {
  const usedFunctions = [
    ...new Set(
      setupProps
        .filter((el) => !el.pkg)
        .map(({ use }) => use)
        .filter(nonNull)
    ),
  ];

  const results = [
    ...ts.createSourceFile(
      "",
      `import { ${usedFunctions.join(",")} } from 'vue'`,
      ts.ScriptTarget.Latest
    ).statements,
  ];

  const extraImports = [
    ...new Set(
      setupProps
        .filter((el) => el.pkg)
        .map(({ use }) => use)
        .filter(nonNull)
    ),
  ];
  if (extraImports.length)
    results.push(
      ...ts.createSourceFile(
        "",
        `import { ${extraImports.join(",")} } from 'pinia'`,
        ts.ScriptTarget.Latest
      ).statements
    );

  return results;
};

export const getExportStatement = (
  setupProps: ConvertedExpression[],
  propNames: string[],
  otherProps: ts.ObjectLiteralElementLike[]
) => {
  const body = ts.factory.createBlock(getSetupStatements(setupProps));

  return body;

  const setupMethod = ts.factory.createMethodDeclaration(
    undefined,
    undefined,
    undefined,
    "setup",
    undefined,
    undefined,
    [],
    undefined,
    body
  );

  return ts.factory.createExportAssignment(
    undefined,
    undefined,
    undefined,
    ts.factory.createCallExpression(
      ts.factory.createIdentifier(""),
      undefined,
      [ts.factory.createObjectLiteralExpression([...otherProps, setupMethod])]
    )
  );
};

const findEmiters = (str: string, emitterSet: Set<string>) => {
  str;
  return str.replace(/this\.\$(\w+)/g, (_, p1) => {
    if (p1 === "emit") {
      const emitName = getStringFromExpression(str);
      if (emitName) emitterSet.add(emitName);
    }
    return "";
  });
};

const sortMap = ["emitter", "props", "store", "ref", "storeToRefs", "computed"];

export const getSetupStatements = (setupProps: ConvertedExpression[]) => {
  // this.prop => prop.valueにする対象
  const refNameMap: Map<string, true> = new Map();
  const propNameMap: Map<string, true> = new Map();
  const emitterNameSet: Set<string> = new Set();

  setupProps.forEach(({ expression }) =>
    findEmiters(expression, emitterNameSet)
  );

  setupProps.unshift({
    use: "emitter",
    expression: `const emit = defineEmits(${JSON.stringify(
      Array.from(emitterNameSet)
    )})`,
  });

  setupProps.forEach((val) => {
    const { use, returnNames } = val;

    const sortIndex = sortMap.findIndex((val) => val === use);
    val.sort = sortIndex > -1 ? sortIndex : 99;
    if (
      returnNames != null &&
      use != null &&
      /^(toRefs|ref|computed|storeToRefs)$/.test(use)
    ) {
      returnNames.forEach((returnName) => {
        refNameMap.set(returnName, true);
      });
    } else if (returnNames != null && use != null && /^(props)$/.test(use)) {
      returnNames.forEach((returnName) => {
        propNameMap.set(returnName, true);
      });
    }
  });

  const returnPropsStatement = ``;

  return [...setupProps, { expression: returnPropsStatement }]
    .sort((a, b): number => {
      if (typeof b.sort === "number" && typeof a.sort === "number")
        return a.sort - b.sort;
      return 0;
    })

    .filter(
      (value, index, self) =>
        index === self.findIndex((t) => t.expression === value.expression)
    )
    .reduce((pv: ConvertedExpression[], cv: ConvertedExpression) => {
      const previous = pv[pv.length - 1];
      if (
        (previous && cv.sort !== previous.sort) ||
        cv.use === "computed" ||
        !cv.use
      )
        pv.push({ isBreak: true, expression: "" });
      pv.push(cv);
      return pv;
    }, [])
    .map(({ expression, isBreak }) => {
      if (isBreak) return ts.factory.createIdentifier("\n");
      else
        return ts.createSourceFile(
          "",
          replaceThisContext(expression, refNameMap, propNameMap),
          ts.ScriptTarget.Latest
        ).statements;
    })
    .flat();
};
