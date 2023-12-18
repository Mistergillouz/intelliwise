import * as vscode from 'vscode';
import WiseHelper from './WiseHelper';

export function activate(context: vscode.ExtensionContext) {

	console.log('Congratulations, your extension "intelliwise" is now active!');

	const wiseIntellisense = vscode.languages.registerCompletionItemProvider(
		'javascript',
		{
			provideCompletionItems(document, position) {
				const items = WiseHelper.getCompletionItems(document, position);
				return items;
			}
		},
		'.'
	);

	context.subscriptions.push(wiseIntellisense);
}

// This method is called when your extension is deactivated
export function deactivate() { }
