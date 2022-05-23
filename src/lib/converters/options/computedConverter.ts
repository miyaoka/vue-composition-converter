import ts from "typescript";
import {
  ConvertedExpression,
  getInitializerProps,
  nonNull,
  storePath,
} from "../../helper";

const mapArrayConverter = (
  mapName: string,
  namespaceText: string,
  mapArray: ts.ArrayLiteralExpression
) => {
  const names = mapArray.elements as ts.NodeArray<ts.StringLiteral>;

  switch (mapName) {
    case "mapState":
      return names.map(({ text: name }) => {
        return {
          use: "computed",
          expression: `const ${name} = computed(() => ${storePath}.state.${namespaceText}.${name})`,
          returnNames: [name],
        };
      });
    case "mapGetters":
      return names.map(({ text: name }) => {
        return {
          use: "computed",
          expression: `const ${name} = computed(() => ${storePath}.getters['${namespaceText}/${name}'])`,
          returnNames: [name],
        };
      });
  }
};

const mapObjectConverter = (
  mapName: string,
  namespaceText: string,
  mapObject: ts.ObjectLiteralExpression
) => {
  const props = mapObject.properties as ts.NodeArray<ts.PropertyAssignment>;

  return props.map((prop) => {
    const name = prop.name as ts.Identifier;
    const initializer = prop.initializer;

    // function values are not currently supported.
    if (
      ts.isFunctionExpression(initializer) ||
      ts.isArrowFunction(initializer)
    ) {
      throw new Error(
        "Function value in a map object is not currently supported."
      );
    }

    // values should be a string.
    if (!ts.isStringLiteral(initializer)) {
      throw new Error("Values of a map object should be strings");
    }

    switch (mapName) {
      case "mapState":
        return {
          use: "computed",
          expression: `const ${name.text} = computed(() => ${storePath}.state.${namespaceText}.${initializer.text})`,
          returnNames: [name.text],
        };
      case "mapGetters":
        return {
          use: "computed",
          expression: `const ${name.text} = computed(() => ${storePath}.getters['${namespaceText}/${initializer.text}'])`,
          returnNames: [name.text],
        };
    }
  });
};

export const computedConverter = (
  node: ts.Node,
  sourceFile: ts.SourceFile
): ConvertedExpression[] => {
  return getInitializerProps(node)
    .map((prop) => {
      if (ts.isSpreadAssignment(prop)) {
        // mapGetters, mapState
        if (!ts.isCallExpression(prop.expression)) return;
        const { arguments: args, expression } = prop.expression;

        if (!ts.isIdentifier(expression)) return;
        const mapName = expression.text;
        const [namespace, mapObject] = args;
        if (!ts.isStringLiteral(namespace)) return;

        const namespaceText = namespace.text;

        if (ts.isArrayLiteralExpression(mapObject)) {
          return mapArrayConverter(mapName, namespaceText, mapObject);
        }
        if (ts.isObjectLiteralExpression(mapObject)) {
          return mapObjectConverter(mapName, namespaceText, mapObject);
        }
        return null;
      } else if (ts.isMethodDeclaration(prop)) {
        // computed method
        const { name: propName, body, type } = prop;
        const typeName = type ? `:${type.getText(sourceFile)}` : "";
        const block = body?.getText(sourceFile) || "{}";
        const name = propName.getText(sourceFile);

        return {
          use: "computed",
          expression: `const ${name} = computed(()${typeName} => ${block})`,
          returnNames: [name],
        };
      } else if (ts.isPropertyAssignment(prop)) {
        // computed getter/setter
        if (!ts.isObjectLiteralExpression(prop.initializer)) return;

        const name = prop.name.getText(sourceFile);
        const block = prop.initializer.getText(sourceFile) || "{}";

        return {
          use: "computed",
          expression: `const ${name} = computed(${block})`,
          returnNames: [name],
        };
      }
    })
    .flat()
    .filter(nonNull);
};
