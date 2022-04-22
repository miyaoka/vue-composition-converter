import ts from "typescript";
import { parseComponent } from "vue-template-compiler";
import { getNodeByKind } from "./helper";
import { convertClass } from "./converters/classApiConverter";
import { convertOptionsApi } from "./converters/optionsApiConverter";

export const convertSrc = (input: string): string => {
  const parsed = parseComponent(input);
  const { script } = parsed;
  const scriptContent = script?.content || "";

  const sourceFile = ts.createSourceFile(
    "src.tsx",
    scriptContent,
    ts.ScriptTarget.Latest
  );

  const exportAssignNode = getNodeByKind(
    sourceFile,
    ts.SyntaxKind.ExportAssignment
  );
  if (exportAssignNode) {
    // optionsAPI
    return convertOptionsApi(sourceFile);
  }

  const classNode = getNodeByKind(sourceFile, ts.SyntaxKind.ClassDeclaration);
  if (classNode && ts.isClassDeclaration(classNode)) {
    // classAPI
    return convertClass(classNode, sourceFile);
  }

  throw new Error("no convert target");
};
