import * as vscode from 'vscode';
import { TextDocument, Position } from "vscode";
import ASTHelper from "./ASTHelper";
import fs from 'node:fs';
import path from 'node:path';

type WordType = {
  id: string;
  match: string;
};

const WordTypes: { [key: string]: WordType } = {
  STORE: {
    id: 'store',
    match: 'Store'
  },
  HELPER: {
    id: 'helper',
    match: 'Helper'
  }
};


type WordInfo = {
  word: string;
  wordType: WordType;
};


class WiseHelper {

  helpers: string[];
  stores: string[];

  constructor() {
    this.fetchFiles();
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
      } else if (wordType === WordTypes.HELPER) {
        items = this.getHelperSourceFunctions(word);
      } else if (wordType === WordTypes.STORE) {
        items = this.getStoreSourceFunctions(word);
      }
    }

    return items;
  }

  getStoreSourceFunctions(storeName: string): vscode.CompletionItem[] {
    const filePath = this.getFilePath(storeName, WordTypes.STORE);
    if (!filePath) {
      return null;
    }

    const storeProperties = this.getStoreProperties(filePath);
    return storeProperties;
  }

  getStoreProperties(filePath: string): vscode.CompletionItem[] {
    try {
      const source = fs.readFileSync(filePath, 'utf8');
      const helper = new ASTHelper(source);
      const propertiesDescriptors: FunctionDescriptor[] = helper.getStoreProperties();
      if (Array.isArray(propertiesDescriptors)) {
        return this.buildCompletionItems(propertiesDescriptors);
      }

      return null;
    } catch (oError) {
      return null;
    }
  }

  getHelperSourceFunctions(helperName: string): vscode.CompletionItem[] {
    const filePath = this.getFilePath(helperName, WordTypes.HELPER);
    if (!filePath) {
      return null;
    }

    return this.getExternalSourceFunctions(filePath);
  }

  getFilePath(helperName: string, wordType: WordType): string {
    const regex = new RegExp(this.getWordTypeRegex(wordType));
    const match = helperName.match(regex);
    if (!match) {
      return null;
    }

    const fileName = match.groups.found;
    const files = wordType === WordTypes.HELPER ? this.helpers : this.stores;

    let tryName = `${fileName}${wordType.match}.js`.toLowerCase();
    let path = files.find((helperPath) => helperPath.toLowerCase().includes(tryName));
    if (!path) {
      tryName = `${fileName}.${wordType.match}.js`.toLowerCase();
      path = files.find((helperPath) => helperPath.toLowerCase().includes(tryName));
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


  getWordTypeRegex (wordType: WordType) {
    const regex = new RegExp(`(?:get)?(?<found>[A-Z]\\w+)${wordType.match}\\b`);
    return regex;
  }

  getWordType(word: string) {
    if (!word) {
      return null;
    }

    const wordType = Object.values(WordTypes).find((wordType) => {
      const regex = this.getWordTypeRegex(wordType);
      return Boolean(regex.exec(word));
    });

    return wordType;
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

  async fetchFiles() {
    const helpers = await vscode.workspace.findFiles('**/*/*[hH]elper.js', '**/node_modules/**', 1000);
    const stores = await vscode.workspace.findFiles('**/*/*[sS]tore.js', '**/node_modules/**', 1000);

    const fnFileName = (file: vscode.Uri) => file.path.startsWith('/') ? file.path.substring(1) : file.path;
    this.helpers = helpers.map(fnFileName);
    this.stores = stores.map(fnFileName);

    vscode.window.showInformationMessage('Wise Intellisense loaded.');
  }
}

export default new WiseHelper();
