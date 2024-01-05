const acornLoose = require("acorn-loose");

type AST = {
  body: Node[]
} & object;

type Node = {
  properties: any;
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

  findPropertyIndex (propertyPath: string[]): number {
    const index = propertyPath.reduce((acc, propertyName) => {
      if (acc > -1) {
        const foundIndex = this.nodes.slice(acc).findIndex((node) => node.type === 'Identifier' && node.name === propertyName);
        acc = foundIndex > -1 ? acc + foundIndex : -1;
      }
      return acc;
    }, 0);

    return index;
  }

  getStoreProperties (): FunctionDescriptor[] {
    const searchPath = ['metadata', 'properties', 'storeProperties', 'defaultValue'];
    const index = this.findPropertyIndex(searchPath);
    if (index < 0) {
      return null;
    }
    const { parent } = this.nodes[index];
    if (parent.type !== 'Property' && parent.value.type !== 'ArrayExpression') {
      return null;
    }

    const keyElementPath = ['metadata', 'properties', 'keyElements'];
    const hasViewContext = this.findPropertyIndex(keyElementPath) > -1;
    const fnUpperFirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

    const storeDescriptors: FunctionDescriptor[] = parent.value.elements
      .filter((element: Node) => element.type === 'ObjectExpression')
      .filter((element: Node) => Array.isArray(element.properties))
      .map((element: Node) => {
        const nameProperty = element.properties.find((property: Node) => property.key.type === 'Identifier' && property.key.name === 'name');
        if (!nameProperty) {
          return null;
        }

        return nameProperty.value.value;
      })
      .filter(Boolean)
      .map((propertyName: string) => ({
        name: `get${fnUpperFirst(propertyName)}`,
        params: hasViewContext ? ['viewContext'] : []
      }));

    return storeDescriptors;
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
    if (!Array.isArray(this.ast.body)) {
      return null;
    }

    let paths = null;
    let variables = null;

    const bodyIndex = this.ast.body.findIndex((bodyNode) => {
      const isCallee = bodyNode.type === 'ExpressionStatement' && bodyNode.expression.type === 'CallExpression' && bodyNode.expression.callee.type === 'MemberExpression';
      if (!isCallee) {
        return false;
      }

      const { expression } = bodyNode;
      const { callee } = expression;
      const functionName = callee.property?.name;
      const memberExpression = callee.object;
      const objectName = memberExpression.object?.name;
      const propertyName = memberExpression.property?.name;
      if (objectName !== 'sap' || propertyName !== 'ui' || functionName !== 'define') {
        return false;
      }

      expression.arguments.forEach((argument: Node) => {
        if (argument.type === 'FunctionExpression' && Array.isArray(argument.params)) {
          variables = argument.params.map((param) => param.name);
        }
        if (argument.type === 'ArrayExpression') {
          paths = argument.elements.map((element) => element.value);
        }
      });

      return true;
    });

    if (!variables && bodyIndex > -1) {
      const node = this.ast.body[bodyIndex + 1];
      if (node?.type === 'FunctionDeclaration') {
        variables = node.params.map((param) => param.name);
      }

      return {
        paths: paths || [],
        variables: variables || []
      };
    }

    // const defines = this.ast?.b
    //   .filter((node) => node.type === 'CallExpression')
    //   .filter((node) => {
    //     const callee = node.callee;
    //     if (callee?.type !== 'MemberExpression') {
    //       return false;
    //     }

    //     const functionName = callee.property?.name;

    //     const memberExpression = callee.object;
    //     const objectName = memberExpression.object?.name;
    //     const propertyName = memberExpression.property?.name;

    //     return objectName === 'sap' && propertyName === 'ui' && functionName === 'define';
    //   })
    //   .map((node) => {
    //     const paths: string[] = [];
    //     const variables: string[] = [];
    //     if (Array.isArray(node.arguments)) {
    //       node.arguments.forEach((argument) => {
    //         if (argument.type === 'FunctionExpression' && Array.isArray(argument.params)) {
    //           argument.params.forEach((param) => variables.push(param.name));
    //         }
    //         if (argument.type === 'ArrayExpression') {
    //           argument.elements.forEach((element) => paths.push(element.value));
    //         }
    //       });

    //       return { paths, variables };
    //     }

    //     return null;
    //   })
    //   .filter((x) => x)
    //   .shift();


    // return defines;
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
