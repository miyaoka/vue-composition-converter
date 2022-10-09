import ts from "typescript";
import {
  getExportStatement,
  getImportStatement,
  containUnicodeChar,
} from "../helper";
import { convertOptions } from "./options/optionsConverter";

export const convertOptionsApi = (sourceFile: ts.SourceFile) => {
  const options = convertOptions(sourceFile);
  if (!options) {
    throw new Error("invalid options");
  }

  const { setupProps, propNames, otherProps } = options;

  const newSrc = ts.factory.createSourceFile(
    [
      ...getImportStatement(setupProps),
      ...sourceFile.statements.filter((state) => !ts.isExportAssignment(state)),
      getExportStatement(setupProps, propNames, otherProps),
    ],
    sourceFile.endOfFileToken,
    sourceFile.flags
  );
  const printer = ts.createPrinter();
  const content = printer.printFile(newSrc);

  return containUnicodeChar(content)
    ? unescape(content.replace(/\\u/g, "%u"))
    : content;
};
