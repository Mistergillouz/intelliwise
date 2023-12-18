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

class WiseHelper {

  helpers: string[];

  constructor() {
    this.fetchHelpers();
  }


  getCompletionItems(document: TextDocument, position: Position): vscode.CompletionItem[] {
    let items = undefined;

    const source = document.getText();
    const helper = new ASTHelper(source);

    const infos = this.getInfoUnderCursor(document, position);
    const previousWord = infos.previous.word;
    if (previousWord === 'this') {
      const functions = helper.getFunctions();
      items = this.buildCompletionItems(functions);
    } else {
      const defineSection = helper.getDefineSection();
      const index = defineSection.variables.findIndex((variable) => variable === previousWord);
      if (index > -1) {
        items = this.getImportSourceFunctions(defineSection.paths[index]);
      }

      if (infos.previous.type === WordTypes.HELPER.id) {
        items = this.getHelperSourceFunctions(previousWord);
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

  getImportSourceFunctions(sourcePath: string) {
      //TODO: remap to wise environment folder structure
      const index = sourcePath.lastIndexOf('/');
      const filePath = path.join(__dirname, '../wise', `${sourcePath.substring(index)}.js`);
      return this.getExternalSourceFunctions(filePath);
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

  buildCompletionItems(functions: FunctionDescriptor[]) {
    return functions.map((funct) => {
      const item = new vscode.CompletionItem(funct.name, vscode.CompletionItemKind.Function);
      const snipperString = this.getSnipperString(funct.name, funct.params);
      const snippet = new vscode.SnippetString(snipperString);
      item.insertText = snippet;

      return item;
    });
  }


  getSnipperString(functionName: string, params: string[]) {
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

  getInfoUnderCursor(document: vscode.TextDocument, cursorPosition: vscode.Position) {
    let currentWord = this.getWord(document, cursorPosition);

    let currentLine = cursorPosition.line;
    let column = cursorPosition.character;
    let previousWord = null;

    while (true) {
      column -= 1;

      if (column < 0) {
        currentLine -= 1;
        if (currentLine < 0 || cursorPosition.line - currentLine > 1) {
          break;
        }
        const line = document.lineAt(currentLine);
        column = line.text.length - 1;
        if (column < 0) {
          break;
        }
      }

      const position = new Position(currentLine, column);
      const word = this.getWord(document, position);
      if (word && word !== currentWord) {
        previousWord = word;
        break;
      }
    }

    return {
      current: {
        word: currentWord,
        type: this.getWordType(currentWord)
      },
      previous: {
        word: previousWord,
        type: this.getWordType(previousWord)
      }
    };
  }

  async fetchHelpers() {
    const glob = `**/*/*helper.js`;
    const files = await vscode.workspace.findFiles(glob, '**/node_modules/**', 100);

    this.helpers = files.map((file) => {
      return file.path.startsWith('/') ? file.path.substring(1) : file.path;
    });
  }
}


export default new WiseHelper();