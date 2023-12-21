const acornLoose = require("acorn-loose");

type AST = object;

type Node = {
  value: any;
  key: any;
  kind: string;
  parent: any;
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
  nodes: Node[]
};

export default class ASTHelper {
  protected nodes: Array<Node> = null;
  protected ast: AST = null;

  constructor(source: string) {
    this.ast = acornLoose.parse(source, { ecmaVersion: 2020 });
    this.flattenModel();
  }

  getFunctions(includeProtected: boolean = false): FunctionDescriptor[] {
    const functions = this.nodes
      .filter((node) => node.type === 'ExpressionStatement' &&
        node.expression.type === 'AssignmentExpression' &&
        node.expression.right.type === 'FunctionExpression')
      .map((node) => {
        // exclude private
        const name = node.expression.left.property.name;
        if (!this.isValidFunctionName(name, includeProtected)) {
          return null;
        }

        const params = node.expression.right.params.map((param: Node) => {
          return param.type === 'AssignmentPattern' ? param.left.name : param.name;
        });

        return { name, params };
      })
      .filter(Boolean);

    const classMethods = this.nodes
      .filter((node) => node.type === 'MethodDefinition' && node.kind === 'method')
      .map((node) => {
        const name = node.key.name;
        if (!this.isValidFunctionName(name, includeProtected)) {
          return null;
        }

        const params = node.value.params.map((param: Node) => param.name);
        return { name, params };
      })
      .filter(Boolean);

    return functions.concat(classMethods);
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

  flattenModel(): void {
    this.nodes = [];
    this._visit(this.ast, (node: Node) => this.nodes.push(node));
  }

  _visit(parentNode: any, callback: any) {
    callback(parentNode);

    const isNode = (node: Node) => node && typeof node === 'object';

    Object
      .keys(parentNode)
      .filter((key) => key !== 'parent')
      .forEach((key) => {
        const child = parentNode[key];
        if (Array.isArray(child)) {
          child.forEach((childItem) => {
            this._visit(childItem, callback);
            childItem.parent = parentNode;
          });
        } else if (isNode(child)) {
          this._visit(child, callback);
          child.parent = parentNode;
        }
      });
  }

  static ignoredFunctionNames = ['init', 'exit', 'destroy', 'onInit', 'onExit'];

  isValidFunctionName(name: string, includeProtected: boolean) {
    if (!includeProtected && name.startsWith('_')) {
      return false;
    }

    return !ASTHelper.ignoredFunctionNames.includes(name);
  }
}
