const acornLoose = require('acorn-loose');

type AST = {
  body: Node[];
} & object;

type Node = {
  properties: any;
  value: any;
  key: any;
  kind: string;
  parent: any;
  type: string;
  name: string;
  expression: any;
  left: Node;
  right: Node;
  callee: Node;
  arguments: Node[];
  object: Node;
  params: Node[];
  property: Node;
  element: Node;
  elements: Node[];
  nodes: Node[];
};

export default class ASTHelper {
  protected nodes: Array<Node> = null;
  protected ast: AST = null;

  constructor(source: string) {
    this.ast = acornLoose.parse(source, { ecmaVersion: 2020 });
    this.visitNodes(this.ast, (node: Node, parentNode: Node) => {
      node.parent = parentNode;
    });
  }

  findPropertyNode(propertyPath: string[]): any {
    const foundNode: any = propertyPath.reduce((acc: any, propertyName) => {
      return this.visitNodes(acc, (node: Node) => node.type === 'Property' && node.key?.name === propertyName);
    }, this.ast);

    return foundNode;
  }

  getStoreProperties(): FunctionDescriptor[] {
    const searchPath = ['metadata', 'properties', 'storeProperties', 'defaultValue'];
    const node = this.findPropertyNode(searchPath);
    if (!node || node.value?.type !== 'ArrayExpression') {
      return null;
    }

    const keyElementPath = ['metadata', 'properties', 'keyElements'];
    const hasViewContext = Boolean(this.findPropertyNode(keyElementPath));
    const fnUpperFirst = (str: string) => str.charAt(0).toUpperCase() + str.slice(1);

    const storeDescriptors: FunctionDescriptor[] = node.value.elements
      .filter((element: Node) => element.type === 'ObjectExpression')
      .filter((element: Node) => Array.isArray(element.properties))
      .map((element: Node) => {
        const nameProperty = element.properties.find(
          (property: Node) => property.key.type === 'Identifier' && property.key.name === 'name'
        );
        if (!nameProperty) {
          return null;
        }

        return nameProperty.value.value;
      })
      .filter(Boolean)
      .map((propertyName: string) => {
        const name = fnUpperFirst(propertyName);
        return [
          {
            name: `get${name}`,
            params: hasViewContext ? ['viewContext'] : [],
          },
          {
            name: `set${name}`,
            params: hasViewContext ? ['viewContext', propertyName] : [propertyName],
          },
          {
            name: `register${name}`,
            params: hasViewContext ? ['viewContext', `this.handle${name}Changed`, 'this'] : [`this.handle${name}Changed`, 'this'],
          },
        ];
      })
      .flat();

    return storeDescriptors;
  }

  getFunctions(includeProtected: boolean = false): FunctionDescriptor[] {
    const functionNodes: Node[] = [];

    this.visitNodes(this.ast, (node: Node) => {
      if (
        node.type === 'ExpressionStatement' &&
        node.expression.type === 'AssignmentExpression' &&
        node.expression.right.type === 'FunctionExpression'
      ) {
        functionNodes.push(node);
      }
    });

    const functions = functionNodes
      .map((node) => {
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

    // const methodNodes: Node[] = [];
    // this.visitNodes(this.ast, (node: Node) => {
    //   if (node.type === 'MethodDefinition' && node.kind === 'method') {
    //     methodNodes.push(node);
    //   }
    // });

    // const classMethods = methodNodes
    //   .map((node) => {
    //     const name = node.key.name;
    //     if (!this.isValidFunctionName(name, includeProtected)) {
    //       return null;
    //     }

    //     const params = node.value.params.map((param: Node) => param.name);
    //     return { name, params };
    //   })
    //   .filter(Boolean);

    return functions;
  }

  getDefineSection(): DefineDescriptor {
    let paths = null;
    let variables = null;

    const bodyNode = this.visitNodes(this.ast, (node: Node) => {
      if (node.type !== 'ExpressionStatement') {
        return false;
      }

      const { expression } = node;
      if (expression.type !== 'CallExpression') {
        return false;
      }

      const { callee } = expression;
      if (callee.type !== 'MemberExpression') {
        return false;
      }

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

    if (!variables) {
      const functionNode = this.visitNodes(this.ast.body, (node: Node) => node.type === 'FunctionDeclaration');
      if (functionNode) {
        variables = functionNode.params.map((param: any) => param.name);
      }
    }

    return {
      paths: paths || [],
      variables: variables || [],
    };
  }

  __getDefineSection(): DefineDescriptor {
    if (!Array.isArray(this.ast.body)) {
      return null;
    }

    let paths = null;
    let variables = null;

    const bodyIndex = this.ast.body.findIndex((bodyNode) => {
      const isCallee =
        bodyNode.type === 'ExpressionStatement' &&
        bodyNode.expression.type === 'CallExpression' &&
        bodyNode.expression.callee.type === 'MemberExpression';
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
        variables: variables || [],
      };
    }
  }

  isNode(node: Node) {
    return node && typeof node === 'object';
  }

  visitNodes(currentNode: any, callback: any, parentNode?: Node) {
    if (!currentNode) {
      return null;
    }
    if (callback(currentNode, parentNode)) {
      return currentNode;
    }

    let found: Node = null;
    const nodeKeys = Object.keys(currentNode).filter((key) => key !== 'parent');
    for (const key of nodeKeys) {
      const child = currentNode[key];
      if (Array.isArray(child)) {
        for (const childNode of child) {
          found = this.visitNodes(childNode, callback, currentNode);
          if (found) {
            return found;
          }
        }
      } else if (this.isNode(child)) {
        found = this.visitNodes(child, callback, currentNode);
        if (found) {
          return found;
        }
      }
    }

    return found;
  }

  static ignoredFunctionNames = ['init', 'exit', 'destroy', 'onInit', 'onExit'];

  isValidFunctionName(name: string, includeProtected: boolean) {
    if (!includeProtected && name.startsWith('_')) {
      return false;
    }

    return !ASTHelper.ignoredFunctionNames.includes(name);
  }
}
