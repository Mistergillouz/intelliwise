import * as vscode from 'vscode';
import { TextDocument, Position } from "vscode";
import ASTHelper from "./ASTHelper";
import fs from 'node:fs';
import path from 'node:path';

type WordType = {
  id: string;
  matches: string[];
};

const WordTypes: { [key: string]: WordType } = {
  STORE: {
    id: 'store',
    matches: ['Store', 'Store()']
  },
  HELPER: {
    id: 'helper',
    matches: ['Helper()', 'Helper']
  }
};


type WordInfo = {
  word: string;
  wordType: string;
};


class WiseHelper {

  helpers: string[];

  constructor() {
    this.fetchHelpers();
  }


  getCompletionItems(document: TextDocument, position: Position): vscode.CompletionItem[] {
    let items = undefined;

    const source = document.getText();
    const helper = new ASTHelper(source);

    const { word, wordType } = this.getPreviousWord(document, position);
    if (word === 'this') {
      const functions = helper.getFunctions(true);
      items = this.buildCompletionItems(functions);
    } else {
      const defineSection = helper.getDefineSection();
      const index = defineSection?.variables.findIndex((variable) => variable === word);
      if (index > -1) {
        items = this.getImportSourceFunctions(defineSection.paths[index]);
      } else if (wordType === WordTypes.HELPER.id) {
        items = this.getHelperSourceFunctions(word);
      }
    }

    return items;
  }

  getHelperSourceFunctions(helperName: string): vscode.CompletionItem[] {
    const helperPath = this.getHelperFilePath(helperName);
    if (!helperPath) {
      return null;
    }

    return this.getExternalSourceFunctions(helperPath);
  }

  getHelperFilePath(helperName: string): string {
    let fileName = helperName;
    if (fileName.endsWith('()')) {
      fileName = fileName.substring(0, fileName.length - 2);
    }

    if (fileName.endsWith('Helper') || fileName.endsWith('helper')) {
      fileName = fileName.substring(0, fileName.length - 6);
    }

    if (fileName.startsWith('get')) {
      fileName = fileName.substring(3);
    }

    let tryName = `${fileName}helper.js`.toLowerCase();
    let path = this.helpers.find((helperPath) => helperPath.toLowerCase().includes(tryName));
    if (!path) {
      tryName = `${fileName}.helper.js`.toLowerCase();
      path = this.helpers.find((helperPath) => helperPath.toLowerCase().includes(tryName));
    }

    return path;
  }

  static resourceRoot: { [key: string]: string } = {
    'sap/bi/webi/core/flux': './wise-core-flux/src/sap/bi/webi/core/flux',
    'sap/bi/webi/core/utils': './wise-core-utils/src/sap/bi/webi/core/utils',
    'sap/bi/dev-platform': './wise-dev-platform/src',
    'sap/bi/webi/jsapi/flux': './wise-jsapi-flux/src/sap/bi/webi/jsapi/flux',
    'sap/bi/webi/caf': './wise-container/src',
    'sap/bi/webi': './wise-wing/src',
    'sap/bi/wrc': './wise-wrc/src'
  };

  static USE_DEBUG_ENV = false;

  getImportSourceFunctions(sourcePath: string): vscode.CompletionItem[] {
    //TODO: remap to wise environment folder structure

    if (WiseHelper.USE_DEBUG_ENV) {
      const index = sourcePath.lastIndexOf('/');
      const filePath = path.join(vscode.workspace.rootPath, 'wise', `${sourcePath.substring(index)}.js`);
      return this.getExternalSourceFunctions(filePath);
    }

    const sourceParts = sourcePath.split('/');
    const fileName = `${sourceParts.pop()}.js`;

    const parts = sourceParts.slice();
    while (parts.length > 0) {
      const sapPath = parts.join('/');
      const outputFolder = WiseHelper.resourceRoot[sapPath];
      if (outputFolder) {
        const outputParts = outputFolder.split('/').concat(sourceParts.slice(parts.length));
        outputParts.push(fileName);
        const filePath = path.join(vscode.workspace.rootPath, ...outputParts);
        return this.getExternalSourceFunctions(filePath);
      } else {
        parts.pop();
      }
    }

    return undefined;
  }

  getExternalSourceFunctions(filePath: string) {
    try {
      const source = fs.readFileSync(filePath, 'utf8');
      const helper = new ASTHelper(source);
      const functions = helper.getFunctions();
      return this.buildCompletionItems(functions);
    } catch (oError) {
      return undefined;
    }
  }

  buildCompletionItems(inputFunctions: FunctionDescriptor[]) {
    const functions = inputFunctions.sort((s0, s1) => s0.name.localeCompare(s1.name));
    return functions
      .map((funct) => {
        const item = new vscode.CompletionItem(`★ ${funct.name}`, vscode.CompletionItemKind.Snippet);
        item.detail = '(Wise) Prototype';

        let paramString = '';
        if (funct.params.length > 0) {
          paramString = `_${funct.params.join('_, _')}_`;
        }

        const markup = new vscode.MarkdownString(`**${funct.name}** (${paramString})`);
        item.documentation = markup;

        const snippetString = this.getSnippetString(funct.name, funct.params);
        item.insertText = new vscode.SnippetString(snippetString);

        return item;
      });
  }


  getSnippetString(functionName: string, params: string[]) {
    const parameters = params
      .map((parameterName, index: number) => `\${${index + 1}:${parameterName}}`)
      .join(', ');

    return `${functionName}(${parameters})`;
  }



  getWordType(word: string) {
    if (!word) {
      return null;
    }

    const wordType = Object.values(WordTypes).find(({ matches }) => {
      return matches.some((match) => word.endsWith(match));
    });

    return wordType && wordType.id;
  }

  getWord(document: vscode.TextDocument, position: vscode.Position) {
    const wordRange = document.getWordRangeAtPosition(position);
    if (!wordRange) {
      return null;
    }

    const word = document.getText(wordRange);
    return word;
  }

  getPreviousWord(document: vscode.TextDocument, cursorPosition: vscode.Position): WordInfo {
    let currentWord = this.getWord(document, cursorPosition);
    let previousWord = null;

    let line = cursorPosition.line;
    let column = cursorPosition.character;

    while (true) {
      column -= 1;

      if (column < 0) {
        line -= 1;
        if (line < 0 || cursorPosition.line - line > 1) {
          break;
        }
        const prevLine = document.lineAt(line);
        column = prevLine.text.length - 1;
        if (column < 0) {
          break;
        }
      }

      const position = new Position(line, column);
      const word = this.getWord(document, position);
      if (word && word !== currentWord) {
        previousWord = word;
        break;
      }
    }

    return {
      word: previousWord,
      wordType: this.getWordType(previousWord)
    };
  }

  async fetchHelpers() {
    const glob = `**/*/*[hH]elper.js`;
    const files = await vscode.workspace.findFiles(glob, '**/node_modules/**', 1000);

    this.helpers = files.map((file) => {
      return file.path.startsWith('/') ? file.path.substring(1) : file.path;
    });

    vscode.window.showInformationMessage('Wise Intellisense loaded.');
  }
}

export default new WiseHelper();
