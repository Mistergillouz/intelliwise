/* eslint-disable max-lines-per-function, max-statements, array-element-newline, max-lines, max-len, complexity, dot-notation */
sap.ui.define([
  'sap/bi/webi/core/flux/core/WebiAbstractHelper',
  'sap/bi/webi/jsapi/flux/constants/WebiObjectQualification',
  'sap/bi/webi/jsapi/flux/constants/WebiGeoQualification',
  'sap/bi/webi/jsapi/flux/constants/WebiCustomSortModes',
  'sap/bi/webi/core/flux/core/HelperRegistry',
  'sap/bi/smart/core/store/StoreRegistry',
  'sap/bi/webi/core/utils/ObjectUtils',
  'sap/bi/webi/jsapi/flux/utils/ContextUtils',
  'sap/bi/webi/lib/UI5Utils',
  'sap/bi/webi/lib/constants/AOT',
  'sap/bi/webi/lib/constants/AvailableObjectsViewMode',
  'sap/bi/webi/components/document/dictionary/model/ExpressionNode',
  'sap/bi/webi/lib/constants/WebiAggregationFunctions',
  'sap/bi/webi/lib/constants/WebiDataSourceTypes',
  'sap/bi/webi/jsapi/flux/constants/WebiDataTypes',
  'sap/bi/webi/jsapi/flux/constants/WebiSessionSettings',
  'sap/bi/smart/core/action/ActionRegistry',
  'sap/bi/smart/core/action/ActionDispatcher',
  'sap/bi/webi/jsapi/flux/constants/PredefinedFormats',
  'sap/bi/webi/components/document/datamodel/constants/CubeSpec',
  'sap/bi/webi/lib/constants/Sources',
  'sap/bi/webi/components/document/datamodel/model/CubeClasses',
  'sap/bi/webi/lib/constants/DocumentMode'
], function ( // eslint-disable-line
  WebiAbstractHelper,
  WebiObjectQualification,
  WebiGeoQualification,
  WebiCustomSortModes,
  HelperRegistry,
  StoreRegistry,
  ObjectUtils,
  ContextUtils,
  UI5Utils,
  AOT,
  AvailableObjectsViewMode,
  ExpressionNode,
  WebiAggregationFunctions,
  WebiDataSourceTypes,
  WebiDataTypes,
  WebiSessionSettings,
  ActionRegistry,
  ActionDispatcher,
  PredefinedFormats,
  CubeSpec,
  Sources,
  CubeClasses,
  DocumentMode
) {
  'use strict';

  const { UserCube } = CubeClasses;
  const DictionaryHelper = WebiAbstractHelper.extend(
    'sap.bi.webi.components.document.dictionary.model.DictionaryHelper', {
      metadata: {
        properties: {
          name: {
            type: 'string',
            defaultValue: 'Dictionary helper'
          },
          type: { defaultValue: 'dictionaryHelper' }
        }
      }
    }
  );

  const MND_FORMULA_TAG = '="MeasureNamesAsDimension"';

  const NodeType = AOT.NodeType;
  const NodeState = AOT.NodeState;
  const NatureId = AOT.NatureId;
  const MergeActions = AOT.MergeActions;

  const { ExposeModes } = CubeSpec;

  //
  // PUBLIC API
  //

  DictionaryHelper.prototype.getFormatInfos = function (viewContext, objectId) {
    const object = this.getDictionaryObject(viewContext, objectId);
    const formatId = object?.format?.formatId || null;

    const formatDico = StoreRegistry.getDocumentStore().getFormatDictionary(viewContext);
    const foundFormat = formatDico?.find((entry) => entry.id === formatId);

    const token = foundFormat?.token || object?.format?.token || null;

    return {
      token,
      id: formatId
    };
  };

  DictionaryHelper.prototype.getFormat = function (viewContext, objectId, defaultValue = PredefinedFormats.SHORT.id) {
    const infos = this.getFormatInfos(viewContext, objectId);
    if (typeof infos.token === 'string' && infos.token.length > 0) {
      return infos.token;
    }

    const formatDict = StoreRegistry.getDocumentStore().getFormatDictionary(viewContext);
    if (typeof infos.id !== 'undefined' && Array.isArray(formatDict)) {
      const formatEntry = formatDict.find((fe) => String(fe.id) === String(infos.id));
      if (formatEntry) {
        return formatEntry.token;
      }
    }

    return defaultValue || null;
  };

  DictionaryHelper.prototype.getDataProviderIcon = function (type) {
    if (type) {
      const dataSourceType = WebiDataSourceTypes.byId(type);
      return dataSourceType && dataSourceType.icon;
    }

    return null;
  };

  DictionaryHelper.prototype.getDataProviderLocation = function (dataSourceLocation) {
    if (dataSourceLocation) {
      const dataSources = HelperRegistry.getDataSourcePickerHelper().Sources;
      switch (dataSourceLocation) {
        case Sources.LOCAL.rayId:
          return dataSources.LOCAL;
        case Sources.BI_PLATFORM.rayId:
          return dataSources.BI_PLATFORM;
        case Sources.GOOGLE_DRIVE.rayId:
          return dataSources.GOOGLE_DRIVE;
        case Sources.MSFT_DRIVE.rayId:
          return dataSources.MSFT_DRIVE;
        case Sources.WEB_SERVICES.rayId:
          return dataSources.WEB_SERVICES;
        default:
          break;
      }
    }
    return null;
  };

  DictionaryHelper.prototype.getMergeAction = function (viewContext, dataObjectIds) {
    let result = MergeActions.NONE;

    const docModeId = StoreRegistry.getWorkbenchStore().getDocumentMode(viewContext);
    if (docModeId !== DocumentMode.DATA_MODEL.id) {
      if (Array.isArray(dataObjectIds)) {
        const onlyLinks = dataObjectIds.every((id) => this.isLink(viewContext, id));
        if (onlyLinks) {
          result = MergeActions.UNMERGE;
        } else if (dataObjectIds.length > 1) {
          if (this._canMerge(viewContext, dataObjectIds)) {
            result = MergeActions.MERGE;
          } else if (this._canAddToMerge(viewContext, dataObjectIds)) {
            result = MergeActions.ADD_TO_MERGE;
          }
        } else if (dataObjectIds.length === 1) {
          if (this._canRemoveFromMerge(viewContext, dataObjectIds[0])) {
            result = MergeActions.REMOVE_FROM_MERGE;
          }
        }
      }
    }

    return result;
  };

  DictionaryHelper.prototype.buildDataModelNodes = function (viewContext, modeId, buildModelArgs) {
    const nodes = [];
    const dictionary = { expression: [] };

    let cubeUIDs = [];
    const DataModelStoreHelper = HelperRegistry.getDataModelStoreHelper();
    const reportingCube = DataModelStoreHelper.getReportingCube(viewContext);
    const reportingCubeInputs = (reportingCube && reportingCube.getInputs()) || [];

    switch (modeId) {
      case AvailableObjectsViewMode.DATA_MODEL_REPORTING.id: {
        cubeUIDs = reportingCubeInputs;
        break;
      }

      case AvailableObjectsViewMode.DATA_MODEL_ALL.id: {
        const cubes = DataModelStoreHelper.getCubes(viewContext);
        cubeUIDs = cubes.map((cube) => cube.getCubeUID());
        break;
      }

      default:
    }

    const aotCubes = cubeUIDs
      .filter((cubeUID) => {
        const cube = DataModelStoreHelper.getCube(viewContext, cubeUID);
        return cube && cube.isValidCube();
      })
      .map((cubeUID) => {
        const cube = DataModelStoreHelper.getCube(viewContext, cubeUID);
        // Build a fake dictionary with cube dictionary
        const cubeDictionary = cube
          .getDictionary()
          .map((cubeObject) => this.fromCubeObject(viewContext, cubeUID, cubeObject.key));

        const aotNodes = this.buildModel(viewContext, { expression: cubeDictionary }, AvailableObjectsViewMode.ALPHA.id, buildModelArgs);

        // Remove "Dimensions" and "Measures" folders
        const cubeNodes = aotNodes
          .map((aotNode) => aotNode.nodes)
          .flat();

        let cubeHasOverloads = false;
        this.visitNodes(cubeNodes, (node) => {
          node.hasMoreMenu = true;
          this._updateNodeVisibilityIcon(node, cube.isObjectHidden(node.id));
          if (node.id) {
            const transforms = cube.getObjectTransforms(node.id);
            const hasOverloads = transforms.length > 0;
            node.hasOverloads = hasOverloads;
            if (hasOverloads) {
              cubeHasOverloads = true;
            }
          }
        });

        return {
          cube,
          cubeDictionary,
          cubeNodes,
          cubeHasOverloads
        };
      });

    aotCubes.forEach((aotCube) => {
      const { cube, cubeDictionary, cubeNodes, cubeHasOverloads } = aotCube;
      dictionary.expression = dictionary.expression.concat(cubeDictionary);

      const cubeDatas = this._fromCube(viewContext, cube);
      const extras = {
        hasMoreMenu: true
      };

      const cubeNode = this.toCube(cubeNodes, Object.assign(cubeDatas, extras));
      cubeNode.hasOverloads = cubeHasOverloads;
      nodes.push(cubeNode);
    });

    return nodes;
  };

  /**
   * Create the available objects tree
   * @param {Object} viewContext View context
   * @param {Object} dictionary document dictionary
   * @param {Object} viewModeId (AOT.ViewMode enum)
   * @param {Object} options (optional)
   * @param {Number} options.hanaOnline (optional) true if the document is in hanaonline mode
   * @returns {Object} A JSON object
   */
  DictionaryHelper.prototype.buildModel = function (viewContext, dictionary, viewModeId, options = {}) {
    if (typeof options.hideEmptyFolder === 'undefined') {
      options.hideEmptyFolder = true;
    }

    let nodes = null;
    if (dictionary) {
      switch (viewModeId) {
        case AvailableObjectsViewMode.QUERY.id:
        case AvailableObjectsViewMode.FLOW.id: {
          const queryOptions = Object.assign({}, options, {
            showQueryFlows: viewModeId === AvailableObjectsViewMode.FLOW.id
          });

          nodes = this._buildQueryModel(viewContext, dictionary, queryOptions);
          break;
        }

        case AvailableObjectsViewMode.FOLDER.id:
          nodes = this._buildFolderModel(viewContext, dictionary, options);
          break;

        case AvailableObjectsViewMode.DATA_MODEL_ALL.id:
        case AvailableObjectsViewMode.DATA_MODEL_REPORTING.id:
          nodes = this.buildDataModelNodes(viewContext, viewModeId, options);
          break;

        default:
          nodes = this._buildMasterModel(dictionary, options);
      }
    }

    return nodes;
  };

  DictionaryHelper.prototype.isCompactDisplayEnabled = function () {
    return false;
  };

  DictionaryHelper.prototype.setCompactDisplayEnabled = function (compact) {
    return ActionDispatcher.fireAction(ActionRegistry.SET_UI_USER_SETTINGS, {
      settingKey: WebiSessionSettings.UI_USER_SETTING.WISE_APP_Compact,
      settingValue: compact
    });
  };

  DictionaryHelper.prototype._buildFolderModel = function (context, dictionary, options) {  // eslint-disable-line
    const nodes = [];

    const expressions = this._getExpressions(dictionary);
    const variables = this._buildVariables(dictionary, expressions);
    const references = this._buildReferences(dictionary);
    this._filterQualification(options.filters, variables, references);

    const cubeIds = this
      ._getCubes(context)
      .map((c3) => c3.getCubeUID());

    const dataProviders = StoreRegistry.getDocumentStore().getDataProviders(context);
    const dataProviderIds = dataProviders.map((dp) => dp.id);

    const entityIds = cubeIds.concat(dataProviderIds);
    entityIds
      .forEach((entityId) => {
        const queryNodes = this._getDataProviderNodes(dictionary, entityId, expressions, options);
        if (queryNodes.length) {
          let hasMoreMenu = false;
          let name = null;
          let icon = null;
          let cubeUID = null;
          let dpId = null;

          if (cubeIds.includes(entityId)) {
            const cube = HelperRegistry.getDataModelStoreHelper().getCube(context, entityId);
            icon = cube?.getIcon();
            name = cube?.getLongName();
            cubeUID = entityId;
          } else {
            const dataProvider = dataProviders.find((dp) => dp.id === entityId);
            name = queryNodes[0].dataSourceName;
            if (dataProvider?.dataSourceType === WebiDataSourceTypes.UNX.id) {
              name += ' [unx]';
            }

            name += ` (${this.getOwnerName(queryNodes[0])})`;
            icon = this.getDataProviderIcon(dataProvider?.dataSourceType);
            hasMoreMenu = true;
            dpId = entityId;
          }

          const dataSourceNodes = this._reorderByFolders(context, queryNodes);
          const dsNode = this.newFolderNode(NodeType.DATASOURCE_FOLDER.id, name, dataSourceNodes, {
            icon,
            dpId,
            cubeUID,
            hasMoreMenu
          });

          nodes.push(dsNode);
        }
      });

    // Links
    this._appendMergedDimensionsFolder(dictionary, nodes);

    if (variables.length) {
      nodes.push(this._newVariableFolderNode(variables));
    }

    if (references.length) {
      nodes.push(
        this.newFolderNode(NodeType.REFERENCE_FOLDER.id,
          UI5Utils.getLocalizedText('aot.references'),
          references)
      );
    }

    return nodes;
  };

  DictionaryHelper.prototype._buildQueryModel = function (viewContext, dictionary, options) {  // eslint-disable-line
    const nodes = [];

    const cubes = this._getCubes(viewContext);
    const expressions = this._getExpressions(dictionary);
    const variables = this._buildVariables(dictionary, expressions);

    cubes.forEach((cube) => {
      const cubeUID = cube.getCubeUID();
      const childNodes = this._getDataProviderNodes(dictionary, cubeUID, expressions, options);
      const cubeNode = this.newFolderNode(NodeType.CUBE.id, cube.getLongName(), childNodes, {
        icon: 'sap-icon://database',
        cubeUID,
        id: cubeUID,
        flowId: -1,
        hasMoreMenu: false
      });

      nodes.push(cubeNode);
    });

    const dataProviders = StoreRegistry.getDocumentStore().getDataProviders(viewContext);
    dataProviders.forEach((dataProvider) => {
      let childNodes = this._getDataProviderNodes(dictionary, dataProvider.id, expressions, options);
      if (options.showQueryFlows && dataProvider.flowCount > 1) {
        childNodes = this._addFlowFolders(childNodes, dataProvider);
      }

      if (childNodes.length > 0) {
        const dataProviderNode = this.newFolderNode(NodeType.DATAPROVIDER_FOLDER.id, dataProvider.name, childNodes, {
          icon: this.getDataProviderIcon(dataProvider.dataSourceType),
          dpId: dataProvider.id,
          id: dataProvider.id,
          flowId: -1,
          hasMoreMenu: true
        });

        nodes.push(dataProviderNode);
      }
    });

    // Links
    this._appendMergedDimensionsFolder(dictionary, nodes);

    // Handle variables
    const variablesNode = this._newVariableFolderNode([]);

    // Variables without an associated dataprovider first
    const orphanVariables = variables
      .filter((variable) => !variable.dataProviderId)
      .map((variable) => this._toVariable(dictionary, variable));

    if (orphanVariables.length) {
      this._filterQualification(options.filters, orphanVariables);
      variablesNode.nodes = orphanVariables;
    }

    dataProviders.forEach((dataProvider) => {
      const dataProviderVariables = variables
        .filter((variable) => variable.dataProviderId === dataProvider.id)
        .map((variable) => this._toVariable(dictionary, variable));

      if (dataProviderVariables.length) {
        this._filterQualification(options.filters, dataProviderVariables);
        const queryVariableNode = this._newSubFolderNode(
          NodeType.DATAPROVIDER_FOLDER.id,
          dataProvider.name,
          dataProviderVariables, {
            icon: this.getDataProviderIcon(dataProvider.dataSourceType),
            dpId: dataProvider.id
          }
        );
        variablesNode.nodes.push(queryVariableNode);
      }
    });

    if (variablesNode.nodes.length) {
      nodes.push(variablesNode);
    }

    const references = this._buildReferences(dictionary);
    this._filterQualification(options.filters, references);

    if (references.length) {
      nodes.push(
        this.newFolderNode(NodeType.REFERENCE_FOLDER.id,
          UI5Utils.getLocalizedText('aot.references'),
          references)
      );
    }

    return nodes;
  };

  DictionaryHelper.prototype._buildMasterModel = function (dictionary, options) { // eslint-disable-line
    const expressions = this._getExpressions(dictionary);
    const variables = this._buildVariables(dictionary, expressions);
    const references = this._buildReferences(dictionary);
    const [dimensions, measures] = this._buildExpressions(dictionary, expressions,
      Object.assign({ includeLinks: true }, options));

    this._filterQualification(options.filters, dimensions, measures, variables, references);

    const nodes = [];
    if (!options.hideDimensions) {
      if (!options.hideEmptyFolder || dimensions.length > 0) {
        nodes.push(this.newFolderNode(
          NodeType.DIMENSION_FOLDER.id,
          UI5Utils.getLocalizedText('aot.dimensions'),
          dimensions
        ));
      }
    }
    if (!options.hideMeasures) {
      if (!options.hideEmptyFolder || measures.length > 0) {
        nodes.push(this.newFolderNode(
          NodeType.MEASURE_FOLDER.id,
          UI5Utils.getLocalizedText('aot.measures'),
          measures
        ));
      }
    }
    if (!options.hideVariables) {
      let actualVariables = variables;
      if (options.hideConstants) {
        actualVariables = variables.filter(
          (variable) => !(variable['@constant'] === 'true')
        );
      }
      if (!options.hideEmptyFolder || actualVariables.length > 0) {
        nodes.push(this._newVariableFolderNode(actualVariables));
      }
    }
    if (!options.hideReferences) {
      if (!options.hideEmptyFolder || references.length > 0) {
        nodes.push(this.newFolderNode(
          NodeType.REFERENCE_FOLDER.id,
          UI5Utils.getLocalizedText('aot.references'),
          references
        ));
      }
    }

    return nodes;
  };

  DictionaryHelper.prototype._buildExpressions = function (dictionary, dictExpressions, args) { // eslint-disable-line
    let dpExpressions = dictExpressions.map((expression) => this.toDpObject(expression));

    const { ownerId } = args;
    if (ownerId) {
      dpExpressions = dpExpressions.filter((expression) => {
        // Time dimension nodes do not have its dataProviderId set
        let currentExpression = expression;
        while (currentExpression.associatedDimensionId) {
          const parentExpression = this._findExpressionId(dictExpressions, currentExpression.associatedDimensionId);
          if (parentExpression) {
            expression.dataProviderId = parentExpression.dataProviderId;
            expression.cubeId = parentExpression.cubeId;
            currentExpression = parentExpression;
          } else {
            break;
          }
        }

        const visible = this.getOwnerId(expression) === ownerId;
        return visible;
      });
    }

    // Remove hidden expressions
    dpExpressions = dpExpressions.filter((expression) => this.isObjectVisible(expression));

    // Handle hierarchies
    dpExpressions.forEach((expression) => {
      if (expression['@qualification'] === WebiObjectQualification.HIERARCHY.id) {
        this._appendAssociatedDimensions(expression, dpExpressions);
        expression.nodes.forEach((level) => {
          if (level.natureId) {
            this._applyNatureId(dictionary, dpExpressions, level);
          }
        });
      }
    });

    this._handleDetails(dpExpressions);

    // Handle links
    if (args.includeLinks) {
      dpExpressions.forEach((expression) => {
        const link = this.getDictLinkOwner(dictionary, expression.id);
        if (link) {
          this._applyLink(dictionary, link, dpExpressions, expression);
        }
      });

      // Also add merge between variables only
      const variables = this._getVariables(dictionary);
      const links = this._getLinks(dictionary);
      const variableLinks = links.filter((link) => {
        const isVariablesOnlyLink = this
          .getLinkExpressions(link)
          .every((linkExpression) => {
            const id = linkExpression['@id'];
            return variables.some((variable) => variable.id === id);
          });

        return isVariablesOnlyLink;
      });

      // Create variables only links
      variableLinks.forEach((variableLink) => {
        const linkNode = this._createLinkNode(dictionary, variableLink, [], false);
        dpExpressions.push(linkNode);
      });
    }

    // Handle natures
    dpExpressions.forEach((expression) => {
      if (expression.natureId) {
        this._applyNatureId(dictionary, dpExpressions, expression);
      }
    });

    // Take care of objects with same name coming from differents dataproviders
    this.fixDuplicate(dpExpressions);

    // Finally sort the list!
    dpExpressions = this.sortExpressions(dpExpressions);

    // Add Measure Names as Dimensions (must be displayed at the bottom of expressions list)
    if (args.mnd) {
      dpExpressions.push(this._getMeasureNamesAsDimensionExpression());
    }

    const dimensions = [];
    const measures = [];
    dpExpressions.forEach((expression) => {
      if (expression['@qualification'] === 'Measure') {
        measures.push(expression);
      } else {
        dimensions.push(expression);
      }
    });

    // Handle hana online document: disable popup menu on everything except measure/variables/references
    if (args.hanaOnline) {
      this.visitNodes(dimensions, (expression) => {
        expression.hasMoreMenu = false;
      });
    }

    return [dimensions, measures];
  };

  // BuildVariables needs the dictionary expressions list because if a variable have a geo,
  // Its levels are located into the dictionary expressions and not into the variables list.
  // So these levels needs to be removed from the expressions list.
  DictionaryHelper.prototype._buildVariables = function (dictionary, expressions) {
    const variables = this._getVariables(dictionary);
    const varExpressions = variables.map((variable) => {
      const varExpression = this._toVariable(dictionary, variable);
      if (varExpression.natureId) {
        this._applyNatureId(dictionary, expressions, varExpression);
      }

      return varExpression;
    });

    this._handleDetails(varExpressions);

    const sortedVariables = this.sortExpressions(varExpressions);
    return sortedVariables;
  };

  DictionaryHelper.prototype._buildReferences = function (dictionary) {
    return this._getReferences(dictionary).map((reference) => this._toReference(reference));
  };

  DictionaryHelper.prototype._applyLink = function (dictionary, link, expressions, expression) {
    const expressionIndex = expressions.indexOf(expression);
    const linkNode = this._createLinkNode(dictionary, link, expressions, true);
    expressions.splice(expressionIndex, 0, linkNode);
  };

  DictionaryHelper.prototype._getLinksNodes = function (dictionary, expressions) {
    const links = this._getLinks(dictionary);
    const linkNodes = links.map((link) => {
      const linkNode = this._createLinkNode(dictionary, link, expressions, false);
      if (linkNode.natureId) {
        this._applyNatureId(dictionary, expressions, linkNode);
      }
      return linkNode;
    });

    return linkNodes;
  };

  DictionaryHelper.prototype._createLinkNode = function (dictionary, link, expressions, removeExpression) {
    const linkNode = this._toLink(link);

    if (link.geoQualification) {
      this._appendAssociatedDimensions(linkNode, expressions);
      this._setExpressionNodeType(linkNode, NatureId.Geography);
    }

    const linkExpressions = this.getLinkExpressions(link);
    const variables = this._getVariables(dictionary);
    linkExpressions.forEach((linkExpression) => {
      let expression = null;
      const index = expressions.findIndex((expr) => expr.id === linkExpression['@id']);
      if (index === -1) {
        const variable = variables.find((aVariable) => aVariable.id === linkExpression['@id']);
        if (variable) {
          expression = this.toDpObject(variable);
        }
      } else {
        expression = expressions[index];
        if (removeExpression) {
          expressions.splice(index, 1);
        }
      }

      if (expression) {
        const cloned = expression.clone();
        cloned.displayName = expression.name;
        if (expression.dataProviderName) {
          cloned.displayName += ` (${expression.dataProviderName})`;
        }
        if (cloned.natureId) {
          this._applyNatureId(dictionary, expressions, cloned);
        }

        linkNode.nodes.push(cloned);
      }
    });

    return linkNode;
  };

  DictionaryHelper.prototype._appendAssociatedDimensions = function (expression, expressions) {
    const associatedExpressions = [];
    for (let i = expressions.length - 1; i >= 0; i--) {
      let expr = expressions[i];
      if (expr.associatedDimensionId === expression.id) {
        if (!(expr instanceof ExpressionNode)) {
          expr = this.toDpObject(expr);
        }

        associatedExpressions.push(expr);
        // Remove it
        expressions.splice(i, 1);
        // Drill into
        this._appendAssociatedDimensions(expr, expressions);
      }
    }

    if (associatedExpressions.length) {
      expression.nodes = expression.nodes.concat(associatedExpressions.reverse());
    }
  };

  DictionaryHelper.prototype._handleDetails = function (expressions) {
    expressions
      .filter((expr) => expr['@qualification'] === WebiObjectQualification.ATTRIBUTE.id && expr.associatedDimensionId)
      .forEach((expr) => {
        const expression = this._findExpressionId(expressions, expr.associatedDimensionId);
        if (expression) {
          this._appendAssociatedDimensions(expression, expressions);
        }
      });
  };

  DictionaryHelper.prototype._getDataProviderNodes = function (dictionary, ownerId, expressions, options) {
    const [dimensions, measures] = this._buildExpressions(dictionary, expressions, Object.assign({
      includeLinks: false,
      ownerId
    }, options));

    this._filterQualification(options.filters, dimensions, measures);

    const queryNodes = dimensions.concat(measures);
    return queryNodes;
  };

  DictionaryHelper.prototype._reorderByFolders = function (viewContext, nodes) {
    const fnNewFolder = () => ({
      nodes: [],
      children: {}
    });

    const paths = StoreRegistry.getDocumentStore().getPaths(viewContext) || [];
    const folders = fnNewFolder();

    // reorder the folder using the original universe outline folders
    const orderedNodes = nodes
      .slice()
      .sort((n0, n1) => {
        const i0 = paths.findIndex((pathEntry) => pathEntry.id === n0.id);
        const i1 = paths.findIndex((pathEntry) => pathEntry.id === n1.id);
        return i0 - i1;
      });

    orderedNodes.forEach((node) => {
      const currentPath = paths.find((pathEntry) => pathEntry.id === node.id);
      if (currentPath && currentPath.path.length) {
        const folder = currentPath.path.reduce((currentFolder, pathPart) => {
          if (!currentFolder.children[pathPart]) {
            currentFolder.children[pathPart] = fnNewFolder();
          }
          return currentFolder.children[pathPart];
        }, folders);

        folder.nodes.push(node);
      } else {
        // Orphan node
        folders.nodes.push(node);
      }
    });

    const folderNodes = [];
    this._visitFolder(folders.children, folderNodes);

    // Add orphans nodes
    return folderNodes.concat(folders.nodes);
  };

  DictionaryHelper.prototype._visitFolder = function (folders, nodes) {
    Object.keys(folders)
      .forEach((key) => {
        const folder = folders[key];
        const universeFolder = this.newFolderNode(NodeType.UNIVERSE_FOLDER.id, key, folder.nodes, {
          icon: 'sap-icon://folder-blank',
          style: 'Normal'
        });
        nodes.push(universeFolder);
        this._visitFolder(folder.children, universeFolder.nodes);
      });
  };

  DictionaryHelper.prototype._appendMergedDimensionsFolder = function (dictionary, nodes) {
    const dictExpressions = this._getExpressions(dictionary).concat(this._getVariables(dictionary));
    const expressions = dictExpressions.map((expression) => this.toDpObject(expression));
    const linkNodes = this._getLinksNodes(dictionary, expressions);
    if (linkNodes.length) {
      const linkNode = this.newFolderNode(NodeType.MERGE_DIMENSION_FOLDER.id,
        UI5Utils.getLocalizedText('aot.mergedDimensions'),
        linkNodes);

      nodes.push(linkNode);
    }
  };

  DictionaryHelper.prototype.getDictionaryObjectModel = function (elementContext, aotModel, dictionaryObject) {
    if (!dictionaryObject) {
      return null;
    }

    const qualification = dictionaryObject['@qualification'];
    const icon = HelperRegistry.getDictionaryHelper().getAOTObjectIcon(aotModel, dictionaryObject);
    const color = WebiObjectQualification.getIconColor(qualification);
    const text = HelperRegistry.getDataProviderStoreHelper().getObjectName(elementContext, dictionaryObject);
    const dataProviderName = dictionaryObject['dataProviderName'];
    const aggregationFunctionText = dictionaryObject['aggregationFunction'];
    const description = dictionaryObject['description'];

    // Data Type
    let dataTypeText = null;
    if (dictionaryObject.natureId === 'Geography') {
      dataTypeText = UI5Utils.getLocalizedText('aot.geography');
    } else {
      dataTypeText = this._getObjectDataType(dictionaryObject);
    }

    // Custom Order
    let customSortText = null;
    const mode = WebiCustomSortModes.byId(dictionaryObject['@customSort']);
    if (mode === WebiCustomSortModes.DEFINED) {
      customSortText = UI5Utils.getLocalizedText('aot.customSortApplied');
    } else {
      customSortText = '';
    }

    // Additional description
    let additionalDescription = '';
    let geoPartial = false;
    const stripped = ObjectUtils.parseBoolean(dictionaryObject['@stripped']);
    if (stripped) {
      additionalDescription = UI5Utils.getLocalizedText('aot.stripped');
    } else if (dictionaryObject.geoMappingResolution === 'Partial') {
      additionalDescription = UI5Utils.getLocalizedText('aot.geoPartial');
      geoPartial = true;
    }

    return {
      text,
      icon,
      color,
      dataType: dictionaryObject['@dataType'],
      dataTypeText,
      dataProviderName,
      aggregationFunctionText,
      description,
      customSortText,
      additionalDescription,
      geoPartial
    };
  };

  DictionaryHelper.prototype.getDictionaryObjectGeoPartial = function (dictionaryObject) {
    let geoPartial = false;
    if (dictionaryObject?.geoMappingResolution === 'Partial') {
      geoPartial = true;
    }
    return geoPartial;
  };

  DictionaryHelper.prototype.getAOTNode = function (aotModel, dictionnaryObject) {
    // eslint-disable-next-line no-confusing-arrow
    const aotNode = this.visitNodes(aotModel, (node) => node.id === dictionnaryObject.id ? node : null);
    return aotNode;
  };

  DictionaryHelper.prototype.getAOTObjectIcon = function (aotModel, dictionnaryObject) {
    if (!dictionnaryObject) {
      return 'sap-icon://error';
    }

    let { icon } = dictionnaryObject;
    if (!icon) {
      const aotNode = this.getAOTNode(aotModel, dictionnaryObject);
      if (aotNode) {
        icon = aotNode.icon;
      }
    }

    return icon || null;
  };

  DictionaryHelper.prototype.visitNodes = function (nodes, fnCallback) {
    return this._visitNodes(nodes, fnCallback, []);
  };

  DictionaryHelper.prototype._visitNodes = function (nodes, fnCallback, indices) {
    let result = null;
    for (let i = 0; i < nodes.length; i++) {
      indices.push(i);
      const node = nodes[i];
      result = fnCallback(node, indices);
      if (result) {
        break;
      }

      if (Array.isArray(node.nodes)) {
        result = this._visitNodes(node.nodes, fnCallback, indices);
        if (result) {
          break;
        }
      }

      indices.pop();
    }

    return result;
  };

  DictionaryHelper.prototype.getExpressionDisplayName = function (viewContext, dictObject) {
    let name = null;
    if (dictObject) {
      name = dictObject.name;
      if (dictObject.dataProviderName) {
        const dps = StoreRegistry.getDocumentStore().getDataProviders(viewContext);
        if (dps.length > 1) {
          const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext);
          const doublons = dictionary.expression.reduce((acc, expression) => {
            const count = expression.name === name ? acc + 1 : acc;
            return count;
          }, 0);
          if (doublons > 1) {
            name += ` (${dictObject.dataProviderName})`;
          }
        }
      }
    }

    return name;
  };

  DictionaryHelper.prototype.getQualificationIcon = function (dictObject) {
    if (this.isMNDExpression(dictObject)) {
      return 'sap-icon://grid';
    }

    if (dictObject.natureId === 'Geography') {
      return 'sap-icon://world';
    }

    return WebiObjectQualification.getIcon(dictObject['@qualification']);
  };

  DictionaryHelper.prototype.getQualificationIconColor = function (dictObject) {
    return WebiObjectQualification.getIconColor(dictObject['@qualification']);
  };

  DictionaryHelper.prototype.createMNDExpression = function () {
    return {
      $: MND_FORMULA_TAG,
      '@qualification': 'Dimension',
      '@dataType': 'String',
      name: UI5Utils.getLocalizedText('feeding.mnd')
    };
  };

  // Check for Measure Name as Dimension expression
  DictionaryHelper.prototype.isMNDExpression = function (expression) {
    return expression && expression.$ === MND_FORMULA_TAG;
  };

  DictionaryHelper.prototype._newSubFolderNode = function (nodeType, displayName, nodes, args) {
    const options = Object.assign({ style: 'subFolder' }, args);
    const node = this.newFolderNode(nodeType, displayName, nodes, options);
    return node;
  };

  DictionaryHelper.prototype._newVariableFolderNode = function (nodes, args) {
    const node = this.newFolderNode(NodeType.VARIABLE_FOLDER.id, UI5Utils.getLocalizedText('aot.variables'), nodes, args);
    node.hasMoreMenu = true;
    return node;
  };

  DictionaryHelper.prototype.newFolderNode = function (nodeType, displayName, nodes, args) {
    const node = this.newNode(nodeType, {
      displayName,
      nodes,
      selectable: false,
      hasMoreMenu: false,
      style: 'folder'
    }, args);

    return node;
  };

  DictionaryHelper.prototype.newNode = function (nodeType, object, args) {
    const node = new ExpressionNode(nodeType, Object.assign({
      nodeState: NodeState.Normal,
      selectable: true,
      hover: false,
      style: '',
      nodes: [],
      stripped: ObjectUtils.parseBoolean(object['@stripped']),
      dataTypeText: this._getObjectDataType(object),
      aggregationFunctionText: this._getLocalizedAggregationFunction(object.aggregationFunction),
      customSortText: this._getCustomSortTooltipText(object)
    }, object, args));

    let additionalDescription = '';
    if (node.isStripped()) {
      additionalDescription = UI5Utils.getLocalizedText('aot.stripped');
    } else if (object.geoMappingResolution === 'Partial') {
      additionalDescription = UI5Utils.getLocalizedText('aot.geoPartial');
      node.geoPartial = true;
    }

    // Feed the informations icon
    const infos = [];
    if (node.isStripped()) {
      infos.push({
        text: UI5Utils.getLocalizedText('aot.stripped'),
        icon: 'sap-icon://message-warning'
      });
    }

    if (object.geoMappingResolution === 'Partial') {
      infos.push({
        text: UI5Utils.getLocalizedText('aot.geoPartial'),
        icon: 'sap-icon://message-warning'
      });
    }

    if (node.hasCustomSort()) {
      infos.push({
        text: this._getCustomSortTooltipText(object),
        icon: 'sap-icon://decrease-line-height'
      });
    }

    const overloadInfos = [];

    // Overloads
    const overloads = this.getOverloads(object);
    if (overloads.nameOverload !== null) {
      overloadInfos.push({
        text: UI5Utils.getLocalizedText('aot.nameOverload'),
        from: overloads.nameOverload,
        to: node.name
      });
    }

    if (overloads.descriptionOverload !== null) {
      overloadInfos.push({
        text: UI5Utils.getLocalizedText('aot.descriptionOverload'),
        from: overloads.descriptionOverload,
        to: node.description
      });
    }

    if (ObjectUtils.parseBoolean(node['@highPrecision'])) {
      overloadInfos.push({
        text: UI5Utils.getLocalizedText('aot.dataTypeOverload'),
        from: UI5Utils.getLocalizedText(WebiDataTypes.NUMERIC.name),
        to: UI5Utils.getLocalizedText(WebiDataTypes.BIG_NUMBER.name)
      });
    } else if (overloads.dataTypeOverload !== null) {
      overloadInfos.push({
        text: UI5Utils.getLocalizedText('aot.dataTypeOverload'),
        from: UI5Utils.getLocalizedText(WebiDataTypes.byId(overloads.dataTypeOverload).name),
        to: node.dataTypeText
      });
    }

    if (overloads.qualificationOverload !== null) {
      overloadInfos.push({
        text: UI5Utils.getLocalizedText('aot.qualificationOverload'),
        from: UI5Utils.getLocalizedText(WebiObjectQualification.byId(overloads.qualificationOverload).name),
        to: UI5Utils.getLocalizedText(WebiObjectQualification.byId(node['@qualification']).name)
      });
    }

    if (overloads.aggregationFunctionOverload !== null) {
      overloadInfos.push({
        text: UI5Utils.getLocalizedText('aot.aggregationFunctionOverload'),
        from: UI5Utils.getLocalizedText(WebiAggregationFunctions.byId(overloads.aggregationFunctionOverload).name),
        to: UI5Utils.getLocalizedText(node.aggregationFunctionText)
      });
    }

    node.infos = infos;
    node.overloadInfos = overloadInfos;
    node.hasOverloads = overloadInfos.length > 0;

    node.additionalDescription = additionalDescription;
    return node;
  };

  DictionaryHelper.prototype.getCustomSortMode = function (expression) {
    if (WebiObjectQualification.byId(expression['@qualification']) === WebiObjectQualification.MEASURE) {
      return null;
    }
    return WebiCustomSortModes.byId(expression['@customSort']);
  };

  //
  // PRIVATE METHODS
  //

  /* eslint-disable arrow-body-style */
  DictionaryHelper.prototype._filterQualification = function (filters, ...expressionsArrays) {
    const fnRecurseFilterQualifications = (qualifications, expressions) => {
      for (let i = expressions.length - 1; i >= 0; i--) {
        const expression = expressions[i];
        const qualification = expression['@qualification'];
        if (qualification && !qualifications.includes(qualification)) {
          expressions.splice(i, 1);
        } else if (Array.isArray(expression.nodes) && expression.nodes.length > 0) {
          fnRecurseFilterQualifications(qualifications, expression.nodes);
        }
      }
    };

    if (filters && Array.isArray(filters.qualifications)) {
      expressionsArrays.forEach((expressions) => fnRecurseFilterQualifications(filters.qualifications, expressions));
    }

    if (filters && Array.isArray(filters.dataTypes)) {
      expressionsArrays.forEach((expressions) => {
        for (let i = expressions.length - 1; i >= 0; i--) {
          const expression = expressions[i];
          if (filters.dataTypes.indexOf(expression['@dataType']) === -1) {
            expressions.splice(i, 1);
          }
        }
      });
    }

    if (filters && Array.isArray(filters.hideObjects)) {
      expressionsArrays.forEach((expressions) => {
        for (let i = expressions.length - 1; i >= 0; i--) {
          const expression = expressions[i];
          if (filters.hideObjects.indexOf(expression.id) !== -1) {
            expressions.splice(i, 1);
          }
        }
      });
    }

    if (filters && filters.dataProviderId) {
      expressionsArrays.forEach((expressions) => {
        for (let i = expressions.length - 1; i >= 0; i--) {
          const expression = expressions[i];
          if (expression.dataProviderId !== filters.dataProviderId) {
            expressions.splice(i, 1);
          }
        }
      });
    }
    if (filters && filters.filteredId) {
      expressionsArrays.forEach((expressions) => {
        for (let i = expressions.length - 1; i >= 0; i--) {
          const expression = expressions[i];
          if (expression.id === filters.filteredId) {
            expressions.splice(i, 1);
          }
        }
      });
    }
  };

  DictionaryHelper.prototype._setExpressionNodeType = function (expression, natureId) {
    switch (natureId) {
      case NatureId.Time:
        expression.icon = expression.hasNodeType(NodeType.LINK.id) ? 'sap-icon://customfont/merged-time' : 'sap-icon://history';
        expression.addNodeType(NodeType.TIME_DIMENSION.id);
        break;

      case NatureId.Geography:
        expression.icon = expression.hasNodeType(NodeType.LINK.id) ? 'sap-icon://customfont/merged-geography' : 'sap-icon://world';
        expression.color = WebiObjectQualification.DIMENSION.color;
        expression.dataTypeText = UI5Utils.getLocalizedText('aot.geography');
        expression.addNodeType(NodeType.GEO.id);
        break;

      default:
    }
  };

  DictionaryHelper.prototype._applyNatureId = function (dictionary, expressions, expression) {
    const natureId = expression.natureId;
    this._setExpressionNodeType(expression, natureId);

    let nodeLevelType = null;
    let hasMoreMenu = false;
    switch (natureId) {
      case NatureId.Time:
        hasMoreMenu = true;
        nodeLevelType = NodeType.TIME_LEVEL.id;
        break;

      case NatureId.Geography:
        nodeLevelType = NodeType.GEO_LEVEL.id;
        break;

      default:
        return;
    }

    this._appendAssociatedDimensions(expression, expressions);

    expression.hasMoreMenu = true;
    expression.nodes.forEach((childNode) => {
      childNode.selectable = true;
      childNode.hasMoreMenu = hasMoreMenu;
      childNode.addNodeType(nodeLevelType);
    });

    // For each time level, place it in its own folder
    if (natureId === NatureId.Time) {
      const notFound = [];
      const timeModelNodes = {};
      const timeModels = this._getTimeModels(dictionary);
      expression.nodes.forEach((childNode) => {
        const timeModelId = childNode.timeModelId;
        const timeModel = timeModels.find((model) => model.id === timeModelId);
        if (timeModel) {
          if (!timeModelNodes[timeModelId]) {
            timeModel.dataObjectId = expression.id;
            timeModel.dataObjectName = expression.displayName;
            timeModelNodes[timeModelId] = this._toTimeModel(timeModel);
          }
          timeModelNodes[timeModelId].nodes.push(childNode);
        } else {
          notFound.push(childNode);
        }
      });

      expression.nodes = Object.values(timeModelNodes).concat(notFound);
    }
  };

  DictionaryHelper.prototype._findExpressionId = function (expressions, id) {
    const result = this.visitNodes(expressions, (expression) => {  // eslint-disable-line
      return expression.id === id ? expression : null;
    });
    return result;
  };

  DictionaryHelper.prototype._getCubes = function (viewContext) {
    const DataModelStoreHelper = HelperRegistry.getDataModelStoreHelper();
    let cubes = DataModelStoreHelper.getCubes(viewContext);
    if (Array.isArray(cubes)) {
      cubes = cubes
        .filter((c3) => c3 instanceof UserCube)
        .filter((c3) => c3.isValidCube());

      const docModeId = StoreRegistry.getWorkbenchStore().getDocumentMode(viewContext);
      if (docModeId !== DocumentMode.DATA_MODEL.id) {
        cubes = cubes.filter((c3) => !c3.isHidden());
      }
    } else {
      cubes = [];
    }

    return cubes;
  };

  DictionaryHelper.prototype._getExpressions = function (dictionary) {
    return (dictionary.expression || []).slice();
  };

  DictionaryHelper.prototype._getLinks = function (dictionary) {
    return dictionary.link || [];
  };

  DictionaryHelper.prototype._getTimeModels = function (dictionary) {
    return dictionary.timeModel || [];
  };

  DictionaryHelper.prototype._getVariables = function (dictionary) {
    return (dictionary.variable || []).slice();
  };

  DictionaryHelper.prototype._getReferences = function (dictionary) {
    return dictionary.refcell || [];
  };

  DictionaryHelper.prototype.fixDuplicate = function (expressions) {
    const map = {};
    expressions.forEach((object) => {
      const key = object.displayName;
      if (!map[key]) {
        map[key] = 0;
      }

      map[key] += 1;
    });

    expressions.forEach((object) => {
      if (object.dataProviderName && map[object.displayName] > 1) {
        object.displayName += ` (${object.dataProviderName})`;
      }
    });
  };

  DictionaryHelper.prototype.toCube = function (nodes, params) {
    const args = Object.assign({}, params, {
      displayName: params.name,
      nodes
    });

    const node = this.newNode(NodeType.CUBE.id, args);
    return node;
  };

  DictionaryHelper.prototype.toCubeObject = function (viewContext, cubeUID, objectId) {
    const dictObject = this.fromCubeObject(viewContext, cubeUID, objectId);
    return dictObject && this.toDpObject(dictObject);
  };

  DictionaryHelper.prototype._fromCube = function (viewContext, cube) {
    const cubeDatas = {
      name: cube.getLongName(),
      description: cube.getDescription(),
      id: cube.getDpId(),
      icon: cube.getIcon(),
      cubeUID: cube.getCubeUID()
    };

    this._updateNodeVisibilityIcon(cubeDatas, cube.getExposeMode());
    return cubeDatas;
  };

  DictionaryHelper.prototype.fromCubeObject = function (viewContext, cubeUID, objectId) {
    const cube = HelperRegistry.getDataModelStoreHelper().getCube(viewContext, cubeUID);
    if (!cube) {
      return null;
    }

    const cubeObject = cube.getObject(objectId);
    if (!cubeObject) {
      return null;
    }

    let dataProviderName = null;
    const dataProviderId = cube.getDpId();

    if (dataProviderId) {
      const dataProvider = StoreRegistry
        .getDataModelStore()
        .getDataProviders(viewContext)
        .find((dp) => dp.dpkey === dataProviderId);

      dataProviderName = dataProvider && dataProvider.name;
    }

    const cubeDatas = this._fromCube(viewContext, cube);

    const dictObject = Object.assign({}, cubeDatas, {
      name: cubeObject.name,
      '@dataType': cubeObject.datatype,
      '@highPrecision': String(Boolean(cubeObject.highPrecision)),
      '@qualification': cubeObject.qualification,
      icon: WebiObjectQualification.getIcon(cubeObject.qualification),
      color: WebiObjectQualification.getIconColor(cubeObject.qualification),
      description: cubeObject.description,
      id: cubeObject.key,
      cubeUID,
      dataProviderName,
      dataProviderId
    });

    return dictObject;
  };

  DictionaryHelper.prototype.toDpObject = function (dictObject) {
    const node = this.newNode(NodeType.OBJECT.id, dictObject, {
      icon: this.getQualificationIcon(dictObject),
      color: this.getQualificationIconColor(dictObject),
      customSort: dictObject['@customSort'] === 'Defined',
      displayName: dictObject.name || ''
    });

    let hasMoreMenu = true;
    const qualification = dictObject['@qualification'];
    switch (qualification) {
      // No contextual menu for hierarchy
      case WebiObjectQualification.HIERARCHY.id:
        hasMoreMenu = false;
        break;

      default:
        hasMoreMenu = true;
    }

    node.hasMoreMenu = hasMoreMenu;
    return node;
  };

  DictionaryHelper.prototype._toLink = function (link) {
    return this.newNode(NodeType.LINK.id, link, {
      icon: 'sap-icon://customfont/merged-dimension',
      color: WebiObjectQualification.DIMENSION.color,
      displayName: link.name,
      hasMoreMenu: true
    });
  };

  DictionaryHelper.prototype._toVariable = function (dictionary, variable) {
    const node = this.toDpObject(variable);
    node.setNodeType(NodeType.VARIABLE.id);
    node.hasMoreMenu = true;
    node.displayDefinition = variable.definition;

    let basedOnInfos = null;
    const { dimensionId } = variable;
    if (dimensionId) {
      const basedObject = this._getDictionaryObject(dictionary, dimensionId);
      if (basedObject) {
        basedOnInfos = {
          basedOn: basedObject.name,
          basedOnIcon: this.getQualificationIcon(basedObject),
          basedOnIconColor: this.getQualificationIconColor(basedObject)
        };
      }
    }

    Object.assign(node, basedOnInfos);
    return node;
  };

  DictionaryHelper.prototype._toReference = function (ref) {
    return this.newNode(NodeType.REFERENCE.id, ref, {
      icon: 'sap-icon://fpaIcons/reference',
      displayName: ref.name,
      hasMoreMenu: true
    });
  };

  DictionaryHelper.prototype._toDataSourceFolder = function (unvFolder) {
    return this.newNode(NodeType.UNIVERSE_FOLDER.id, unvFolder, {
      displayName: unvFolder.name,
      icon: 'sap-icon://folder-blank'
    });
  };

  DictionaryHelper.prototype._toTimeModel = function (timeModel) {
    return this.newNode(NodeType.TIME_MODEL.id, {
      displayName: timeModel.name,
      description: timeModel.description,
      id: timeModel.id,
      timeModelId: timeModel.id,
      dataObjectId: timeModel.dataObjectId,
      dataObjectName: timeModel.dataObjectName,
      '@dataSourceEnriched': timeModel['@dataSourceEnriched'],
      dataTypeText: this._getLocalizedDataType('DateTime'),
      icon: 'sap-icon://date-time',
      color: 'Neutral',
      selectable: false,
      hasMoreMenu: true,
      nodes: []
    });
  };

  const DataTypes = {
    String: 'aot.dataType.string',
    Numeric: 'aot.dataType.numeric',
    Date: 'aot.dataType.date',
    DateTime: 'aot.dataType.dateTime',
    Decimal: 'aot.dataType.decimal'
  };

  DictionaryHelper.prototype._getObjectDataType = function (dictObject) {
    let dataType = dictObject['@dataType'];
    if (ObjectUtils.parseBoolean(dictObject['@highPrecision'])) {
      dataType = 'Decimal';
    }

    return this._getLocalizedDataType(dataType);
  };

  DictionaryHelper.prototype._getLocalizedDataType = function (dataType) {
    const id = DataTypes[dataType];
    return id ? UI5Utils.getLocalizedText(id) : '';
  };

  DictionaryHelper.prototype._getCustomSortTooltipText = function (object) {
    const mode = WebiCustomSortModes.byId(object['@customSort']);
    if (mode === WebiCustomSortModes.DEFINED) {
      return UI5Utils.getLocalizedText('aot.customSortApplied');
    }

    return '';
  };

  DictionaryHelper.prototype._getLocalizedAggregationFunction = function (aggregationFunction) {
    const aggregation = WebiAggregationFunctions.byId(aggregationFunction);
    return aggregation ? UI5Utils.getLocalizedText(aggregation.name) : '';
  };

  DictionaryHelper.prototype._getMeasureNamesAsDimensionExpression = function () {
    const expression = this.toDpObject(this.createMNDExpression());
    return Object.assign(expression, {
      hasMoreMenu: false
    });
  };

  DictionaryHelper.prototype.createRaylightAxisExpression = function (dictObject) {
    return {
      '@hide': 'false',
      '@dataType': dictObject['@dataType'],
      '@qualification': dictObject['@qualification'],
      '@dataObjectId': dictObject.id || dictObject['@dataObjectId']
    };
  };

  DictionaryHelper.prototype._canRemoveFromMerge = function (viewContext, dataObjectId) {
    const link = this.getLinkOwner(viewContext, dataObjectId);
    if (link) {
      const MIN_OBJECT_MERGED = 3;
      const linkExpressions = this.getLinkExpressions(link);
      return linkExpressions.length >= MIN_OBJECT_MERGED;
    }

    return false;
  };

  DictionaryHelper.prototype._canAddToMerge = function (viewContext, dataObjectIds) {
    // At least 2 objects (a link + another expression)
    if (dataObjectIds.length < 2) { // eslint-disable-line
      return false;
    }

    // 1st find target link (and only one link)
    const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext);
    const links = this._getLinks(dictionary);
    let targetLink = null;

    const checked = dataObjectIds.every((dataObjectId) => {
      const link = links.find((aLink) => aLink.id === dataObjectId);
      if (link) {
        if (targetLink) {
          return false;
        }
        targetLink = link;
      }

      return true;
    });

    if (!checked || !targetLink) {
      return false;
    }

    // Append link expressions to dataobjects ids excluding target link id
    const linkExpressions = this.getLinkExpressions(targetLink);
    const mergeIds = linkExpressions
      .map((linkExpression) => linkExpression['@id'])
      .concat(dataObjectIds.filter((dataObjectId) => dataObjectId !== targetLink.id));

    const canMerge = this._canMerge(viewContext, mergeIds, targetLink.id);
    return canMerge;
  };

  DictionaryHelper.prototype._canMerge = function (viewContext, dataObjectIds, excludeLinkId = null) { // eslint-disable-line
    const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext);
    const links = this._getLinks(dictionary);

    // Exclude links and links expressions
    const excludedIds = {};
    if (Array.isArray(links)) {
      links
        .filter((link) => link.id !== excludeLinkId)
        .forEach((link) => {
          excludedIds[link.id] = true;
          this.getLinkExpressions(link).forEach((linkExpression) => {
            excludedIds[linkExpression['@id']] = true;
          });
        });
    }

    const dpStoreHelper = HelperRegistry.getDataProviderStoreHelper();
    const dpMap = {};
    let dataType = null;
    let hasHierarchy = false;
    let hasVariable = false;
    let geoQualificationId = null;

    let result = dataObjectIds.every((dataObjectId) => {
      if (excludedIds[dataObjectId]) {
        return false;
      }
      const dictObject = dpStoreHelper.getObject(ContextUtils.assign(viewContext, { dataObjectId }));
      if (!dictObject) {
        return false;
      }

      // Avoid timedims to be merged
      if (dictObject.natureId === 'Time') {
        return false;
      }

      let isGeoLevel = false;
      if (dictObject.associatedDimensionId) {
        const associated = dpStoreHelper.getObject(ContextUtils.assign(viewContext, {
          dataObjectId: dictObject.associatedDimensionId
        }));

        isGeoLevel = Boolean(associated && associated.natureId === 'Geography');
      }

      if (isGeoLevel) {
        return false;
      }

      const qualification = WebiObjectQualification.byId(dictObject['@qualification']);
      switch (qualification) {
        case WebiObjectQualification.HIERARCHY:
          hasHierarchy = true;
          break;

        case WebiObjectQualification.DIMENSION:
        case WebiObjectQualification.ATTRIBUTE:
          break;

        default:
          return false;
      }

      const variables = this._getVariables(dictionary);
      if (Array.isArray(variables) && variables.find((variable) => variable.id === dataObjectId)) {
        hasVariable = true;
      }

      if (dictObject.stripped) {
        return false;
      }

      if (dataType && dataType !== dictObject['@dataType']) {
        return false;
      }
      const dpId = dictObject.dataProviderId || dictObject.cubeId;
      if (!dpId || dpMap[dpId]) {
        return false;
      }

      const currentGeoQualification = WebiGeoQualification.byId(dictObject.geoQualification);
      if (currentGeoQualification) {
        if (geoQualificationId === WebiGeoQualification.LONGLAT.id) {
          return false;
        }

        geoQualificationId = currentGeoQualification.id;
      }

      dataType = dictObject['@dataType'];
      dpMap[dpId] = true;
      return true;
    });

    if (hasHierarchy && hasVariable) {
      result = false;
    }

    return result;
  };

  DictionaryHelper.prototype._getDictionaryObject = function (dictionary, id) {
    let dictObject = this._getExpressions(dictionary).find((object) => object.id === id);
    if (!dictObject) {
      dictObject = this._getVariables(dictionary).find((object) => object.id === id);
    }
    if (!dictObject) {
      dictObject = this._getLinks(dictionary).find((object) => object.id === id);
    }

    return dictObject;
  };

  DictionaryHelper.prototype.getLinkOwner = function (viewContext, dataObjectId) {
    const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext);
    return this.getDictLinkOwner(dictionary, dataObjectId);
  };

  DictionaryHelper.prototype.getDictLinkOwner = function (dictionary, dataObjectId) {
    const links = this._getLinks(dictionary);
    const elementLink = links.find((link) => {
      const linkExpressions = this.getLinkExpressions(link);
      return linkExpressions.some((linkExpression) => linkExpression['@id'] === dataObjectId);
    });

    return elementLink;
  };

  DictionaryHelper.prototype.getLinkExpressions = function (link) {
    const linkExpressions = ObjectUtils.getProperty(link, 'linkedExpressions.linkedExpression', []);
    return linkExpressions;
  };

  DictionaryHelper.prototype.isLink = function (viewContext, id) {
    const dictionary = StoreRegistry.getDocumentStore().getDictionary(viewContext);
    const links = this._getLinks(dictionary);
    return links.some((link) => link.id === id);
  };

  DictionaryHelper.prototype.sortExpressions = function (varExpressions) {
    const map = {};
    varExpressions.forEach((expression) => {
      const qualification = expression['@qualification'];
      if (!map[qualification]) {
        map[qualification] = [];
      }

      map[qualification].push(expression);
    });

    const order = [
      WebiObjectQualification.HIERARCHY.id,
      WebiObjectQualification.DIMENSION.id,
      WebiObjectQualification.ATTRIBUTE.id,
      WebiObjectQualification.MEASURE.id
    ];

    let result = [];
    order.forEach((id) => {
      if (map[id]) {
        map[id].sort((a0, b0) => a0.displayName.localeCompare(b0.displayName));
        result = result.concat(map[id]);
        delete map[id];
      }
    });

    Object.values(map).forEach((expressions) => {
      expressions.sort((a0, b0) => a0.displayName.localeCompare(b0.displayName));
      result = result.concat(expressions);
    });

    return result;
  };

  DictionaryHelper.prototype.canEnrichObject = function (dictObject) {
    return !ObjectUtils.parseBoolean(dictObject['@dataSourceEnriched']);
  };

  const Overloads = {
    nameOverload: { attribute: false },
    descriptionOverload: { attribute: false },
    // eslint-disable-next-line object-property-newline
    dataTypeOverload: { attribute: true, checkHighPrecision: true },
    qualificationOverload: { attribute: true },
    aggregationFunctionOverload: { attribute: false }
  };

  DictionaryHelper.prototype.getOverloads = function (dictObject) {
    const overloads = {};
    Object.keys(Overloads).forEach((key) => {
      const overload = Overloads[key];
      overloads[key] = ObjectUtils.getProperty(dictObject, overload.attribute ? `@${key}` : key, null);
      // Adjust datatype overload with fake high precision
      if (overload.checkHighPrecision && ObjectUtils.parseBoolean(dictObject['@highPrecision'])) {
        overloads[key] = WebiDataTypes.NUMERIC.id;
      }
    });

    return overloads;
  };

  DictionaryHelper.prototype._addFlowFolders = function (_nodes, dataProvider) {
    let nodes = _nodes.slice();

    const flowNodes = [];
    for (let flowId = 0; flowId < dataProvider.flowCount; flowId++) {
      const filteredNodes = nodes.filter((node) => {
        const flowIds = ObjectUtils.getProperty(node, 'dataProviderFlows.id', []);
        return flowIds.includes(flowId);
      });

      const flowText = UI5Utils.getLocalizedText('aot.flowName', [
        dataProvider.name,
        flowId
      ]);

      flowNodes.push(this.newFolderNode(NodeType.FLOW.id, flowText, filteredNodes, {
        icon: 'sap-icon://database',
        dpId: dataProvider.id,
        flowId,
        hasMoreMenu: true
      }));
    }

    // Remove flow used nodes
    nodes = nodes.filter((node) => {
      const flowIds = ObjectUtils.getProperty(node, 'dataProviderFlows.id', []);
      return flowIds.length === 0;
    });

    flowNodes
      .reverse()
      .forEach((flowNode) => nodes.unshift(flowNode));

    return nodes;
  };

  DictionaryHelper.prototype.getOwnerId = function (dictObject) {
    return dictObject.cubeId || dictObject.dataProviderId || null;
  };

  DictionaryHelper.prototype.getOwnerName = function (dictObject) {
    return dictObject.cubeName || dictObject.dataProviderName || null;
  };

  DictionaryHelper.prototype.isObjectVisible = function (dictObject) {
    let visible = true;

    const visibleProperty = dictObject['@visible'];
    if (typeof visibleProperty !== 'undefined') {
      visible = ObjectUtils.parseBoolean(visibleProperty);
    }

    return visible;
  };

  DictionaryHelper.prototype.getDictionaryObject = function (viewContext, dataObjectId) {
    let dictObject = null;

    const objectContext = ContextUtils.assign(viewContext, { dataObjectId });
    const object = HelperRegistry.getDataProviderStoreHelper().getObject(objectContext);
    if (object) {
      dictObject = this.toDpObject(object);
    }

    return dictObject;
  };

  DictionaryHelper.prototype.copyDataProviderODataLink = function (viewContext, cubeUID) {
    const document = StoreRegistry.getDocumentStore().getDocument(viewContext);
    const args = {
      viewContext,
      cubeUID,
      cuid: document.cuid
    };

    return ActionDispatcher
      .fireAction(ActionRegistry.COPY_DATA_PROVIDER_O_DATA_LINK, args)
      .then(() => {
        const message = UI5Utils.getLocalizedText('workbench.actions.copyDataProviderODataLink.done');
        sap.m.MessageToast.show(message);
      });
  };

  DictionaryHelper.prototype.isCopyODataLinkEnabled = function (viewContext) {
    const enabled =
      !HelperRegistry.getWiseViewStoreHelper().isNewDocument(viewContext.wiseViewId) &&
      !HelperRegistry.getWiseViewStoreHelper().isRichClient(viewContext.wiseViewId);

    return Boolean(enabled);
  };

  DictionaryHelper.prototype._updateNodeVisibilityIcon = function (node, exposeModeId) {
    let icon = null;
    let tooltip = null;

    switch (exposeModeId) {
      // Used for object but not cubes
      case true:
        icon = 'sap-icon://hide';
        tooltip = UI5Utils.getLocalizedText('datamodel.object.hidden.tooltip');
        break;

      case ExposeModes.SHOW.id:
        // icon = ExposeModes.SHOW.icon
        // tooltip = UI5Utils.getLocalizedText(ExposeModes.SHOW.tooltip)
        break;

      case ExposeModes.HIDE.id:
        icon = ExposeModes.HIDE.icon;
        tooltip = UI5Utils.getLocalizedText(ExposeModes.HIDE.tooltip);
        break;

      default:
        break;
    }

    node.hideIcon = icon;
    node.hideIconTooltip = tooltip;
  };

  return DictionaryHelper;
});
