const acornLoose = require("acorn-loose");

type AST = object;

type Node = {
  type: string,
  name: string,
  expression: any,
  left: Node,
  right: Node,
  callee: Node,
  arguments: Node[],
  object: Node,
  params: Node[],
  property: Node,
  element: Node,
  elements: Node[],
  nodes: Node[],
  value: string
};

export default class ASTHelper {
  protected nodes: Array<Node> = null;
  protected ast: AST = null;

  constructor(source: string) {
    this.ast = acornLoose.parse(source, { ecmaVersion: 2020 });
    this._flatten();
  }

  // try {
	// 	const sourcePath = path.join(__dirname, '../sample_code.js');
	// 	const source = fs.readFileSync(sourcePath, 'utf8');
	// 	const helper = new ASTHelper(source);
	// 	const defineSection = helper.getDefineSection();
	// 	const functions = helper.getFunctions();

	// 	console.log(defineSection);
	// 	console.log('-----------------');
	// 	console.log(functions);
	// } catch (oError) {
	// 	console.log("Current directory:", __dirname);
	// 	console.log(oError);
	// }

  getFunctions(): FunctionDescriptor[] {
    const functions = this.nodes
      .filter((node) => node.type === 'ExpressionStatement' &&
        node.expression.type === 'AssignmentExpression' &&
        node.expression.right.type === 'FunctionExpression')
      .map((node) => {
        // exclude private
        const name = node.expression.left.property.name;
        if (!this.isValidFunctionName(name)) {
          return null;
        }

        const params = node.expression.right.params.map((param: Node) => {
          return param.type === 'AssignmentPattern' ? param.left.name : param.name;
        });

        return { name, params };
      })
      .filter(Boolean);

    return functions;
  }

  getDefineSection(): DefineDescriptor {
    const defines = this.nodes
      .filter((node) => node.type === 'CallExpression')
      .filter((node) => {
        const callee = node.callee;
        if (callee?.type !== 'MemberExpression') {
          return false;
        }

        const functionName = callee.property?.name;

        const memberExpression = callee.object;
        const objectName = memberExpression.object?.name;
        const propertyName = memberExpression.property?.name;

        return objectName === 'sap' && propertyName === 'ui' && functionName === 'define';
      })
      .map((node) => {
        const paths: string[] = [];
        const variables: string[] = [];
        if (Array.isArray(node.arguments)) {
          node.arguments.forEach((argument) => {
            if (argument.type === 'FunctionExpression' && Array.isArray(argument.params)) {
              argument.params.forEach((param) => variables.push(param.name));
            }
            if (argument.type === 'ArrayExpression') {
              argument.elements.forEach((element) => paths.push(element.value));
            }
          });

          return { paths, variables };
        }

        return null;
      })
      .filter((x) => x)
      .shift();


    return defines;
  }

  _flatten(): void {
    this.nodes = [];
    this._visit(this.ast, (node: Node) => this.nodes.push(node));
  }

  _visit(ast: any, callback: any) {
    callback(ast);

    const isNode = (node: Node) => node && typeof node === 'object';

    const values: Node[] = Object.values(ast);
    values.forEach((child) => {
      if (Array.isArray(child)) {
        child.forEach((childItem) => this._visit(childItem, callback));
      } else if (isNode(child)) {
        this._visit(child, callback);
      }
    });
  }

  static ignoredFunctionNames = ['init', 'exit', 'onInit', 'onExit'];

  isValidFunctionName(name: string) {
    if (name.startsWith('_')) {
      return false;
    }

    return !ASTHelper.ignoredFunctionNames.includes(name);

  }
}


