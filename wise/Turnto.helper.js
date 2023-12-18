/* eslint-disable capitalized-comments, spaced-comment, max-len, max-statements, max-lines-per-function, no-return-assign */
sap.ui.define([
  'sap/bi/webi/core/flux/core/WebiAbstractHelper',
  'sap/bi/smart/core/store/StoreRegistry',
  'sap/bi/webi/core/utils/ObjectUtils',
  'sap/bi/webi/lib/ConfigManager',
  'sap/bi/webi/lib/UI5Utils',
  'sap/bi/webi/jsapi/flux/constants/WebiReportBlockTypes',
  'sap/bi/webi/lib/constants/ChartIntentions',
  'sap/bi/webi/core/flux/core/HelperRegistry',
  'sap/bi/smart/core/action/ActionDispatcher',
  'sap/bi/smart/core/action/ActionRegistry'
], function ( // eslint-disable-line
  WebiAbstractHelper,
  StoreRegistry,
  ObjectUtils,
  ConfigManager,
  UI5Utils,
  WebiReportBlockTypes,
  ChartIntentions,
  HelperRegistry,
  ActionDispatcher,
  ActionRegistry
) {
  'use strict'

  const TurnToHelper = WebiAbstractHelper.extend(
    'sap.bi.webi.components.reportelement.feeding.model.TurnToHelper', {
      metadata: {
        properties: {
          name: { defaultValue: 'Report Element Feeding TurnTo helper' },
          type: { defaultValue: 'turnToHelper' }
        }
      }
    }
  )

  //
  // PUBLIC API
  //

  TurnToHelper.prototype.init = function () {
    this.CUSTOM_ELEMENT_ID = 'CUSTOM_ELEMENT_ID'
    this.SHARED_ELEMENT_ID = 'SHARED_ELEMENT_ID'
    this.WIRE_ELEMENT_ID = 'WIRE_ELEMENT_ID'
  }

  TurnToHelper.prototype.turnTo = function (viewContext, elementId, blockDescriptor) {
    const element = this._fromDescriptor(blockDescriptor)
    if (!element) {
      const args = {
        viewContext,
        reloadPage: true
      }

      return ActionDispatcher.fireAction(ActionRegistry.USER_RELOAD_DATA, args)
    }

    const args = {
      viewContext,
      elementId,
      element
    }

    return ActionDispatcher.fireAction(ActionRegistry.USER_UPDATE_REPORT_ELEMENT, args)
  }

  TurnToHelper.prototype.buildTurnToModel = function (context, block) {
    const model = {}
    if (context) {
      const currentType = ObjectUtils.getProperty(block, 'content.chart.@type') || block['@type']
      const visualizations = StoreRegistry.getConfigurationStore().getVisualizations()
      const tables = this._buildTablesVisualization(currentType)
      const customElementItem = this._buildCustomElementItem(currentType)
      const wireElementItem = this._buildWireElementItem(currentType)

      const allowTrellis = ConfigManager.getValue(ConfigManager.ConfigKeys.allowTrellisVisualizations)

      const isGeoMapAllowed = HelperRegistry.getConfigurationStoreHelper().isGeoMapAllowed()

      model.visualizations = ChartIntentions.VALUES
        .filter((intention) => intention !== ChartIntentions.SIDE_BY_SIDE || allowTrellis)
        .filter((intention) => intention !== ChartIntentions.GEOGRAPHIC || isGeoMapAllowed)
        .map((intention) => this._buildChartVisualizations(visualizations, intention, currentType))

      model.visualizations.splice(0, 0, tables)
      model.visualizations.push(customElementItem)
      model.visualizations.push(wireElementItem)
    }

    return model
  }

  //
  // INTERNALS
  //

  TurnToHelper.prototype._buildCustomElementItem = function (currentType) {
    const visualizations = StoreRegistry.getConfigurationStore().getCustomVisualizations()
    const type = WebiReportBlockTypes.byId(currentType)
    const enabled = Array.isArray(visualizations) && visualizations.length > 0
    const selected = type === WebiReportBlockTypes.CUSTOM
    const item = {
      enabled,
      selected,
      icon: 'sap-icon://customfont/customElements',
      tooltip: this._getTooltipText('feeding.turnTo.customElement', selected),
      wingTest: 'turnto.customelement',
      type: this.CUSTOM_ELEMENT_ID,
      renderType: 'button'
    }

    return item
  }

  TurnToHelper.prototype._buildWireElementItem = function (currentType) {
    const wireWidgets = StoreRegistry.getConfigurationStore().getWireWidgets()
    const type = WebiReportBlockTypes.byId(currentType)
    const enabled = Array.isArray(wireWidgets) && wireWidgets.length > 0
    const selected = type === WebiReportBlockTypes.WIRE
    const item = {
      enabled,
      selected,
      icon: 'sap-icon://opportunity',
      tooltip: this._getTooltipText('feeding.turnTo.wireElement', selected),
      wingTest: 'turnto.wireelement',
      type: this.WIRE_ELEMENT_ID,
      renderType: 'button'
    }

    return item
  }

  TurnToHelper.prototype._buildTablesVisualization = function (currentType) {
    const wobs = [
      Object.assign({ wingTest: 'turnto.vtable' }, WebiReportBlockTypes.VTABLE),
      Object.assign({ wingTest: 'turnto.htable' }, WebiReportBlockTypes.HTABLE),
      Object.assign({ wingTest: 'turnto.xtable' }, WebiReportBlockTypes.XTABLE),
      Object.assign({ wingTest: 'turnto.form' }, WebiReportBlockTypes.FORM)
    ]

    const selected = wobs.some((wob) => wob.id === currentType)

    const tableData = {
      enabled: true,
      icon: 'sap-icon://table-view',
      name: UI5Utils.getLocalizedText('turnto.tables.tooltip'),
      tooltip: this._getTooltipText('turnto.tables.tooltip', selected),
      buttonMode: sap.m.MenuButtonMode.Regular,
      wingTest: 'turnto.tables',
      variants: wobs.map((wob) => ({
        id: wob.id,
        enabled: wob.id !== currentType,
        type: wob.id,
        icon: wob.icon,
        text: UI5Utils.getLocalizedText(wob.text),
        wingTest: wob.wingTest
      })),
      selected
    }

    return tableData
  }

  TurnToHelper.prototype._buildChartVisualizations = function (visualizations, intention, currentType) {
    const chartData = {
      isChart: true,
      name: UI5Utils.getLocalizedText(intention.text),
      icon: intention.icon,
      id: intention.id,
      buttonMode: sap.m.MenuButtonMode.Regular,
      enabled: true,
      wingTest: `turnto.${intention.id}`,
      variants: []
    }

    const vizIntentions = visualizations.filter((visualization) => visualization.intention['@id'] === intention.id)

    vizIntentions.forEach((visualization) => {
      chartData.variants.push({
        isChart: true,
        enabled: visualization['@type'] !== currentType,
        text: visualization.name,
        id: visualization.id,
        sectionId: intention.id,
        technicalName: visualization['@technicalName'],
        type: visualization['@type'],
        icon: null,
        wingTest: `turnto.${visualization['@type'].toLowerCase()}`
      })
    })

    chartData.selected = vizIntentions.some((visualization) => visualization['@type'] === currentType)
    chartData.tooltip = this._getTooltipText(intention.text, chartData.selected)

    return chartData
  }

  // Used for text speech (menubutton do not support the selected property)
  TurnToHelper.prototype._getTooltipText = function (msgId, selected) {
    let text = UI5Utils.getLocalizedText(msgId)
    if (selected) {
      text += `. ${UI5Utils.getLocalizedText('turnto.selectedText')}`
    }

    return text
  }

  TurnToHelper.prototype._fromDescriptor = function (blockDescriptor) {
    const { blockType, type, technicalName, serverId, definition } = blockDescriptor
    switch (blockType) {
      case WebiReportBlockTypes.VISUALIZATION.id:
        return {
          '@type': WebiReportBlockTypes.VISUALIZATION.id,
          content: {
            chart: {
              '@type': type,
              '@technicalName': technicalName
            }
          }
        }

      case WebiReportBlockTypes.CUSTOM.id:
        return {
          '@type': WebiReportBlockTypes.CUSTOM.id,
          content: {
            custom: {
              '@type': type,
              '@serverId': serverId
            }
          }
        }

      case WebiReportBlockTypes.WIRE.id:
        return {
          '@type': WebiReportBlockTypes.WIRE.id,
          content: {
            wire: {
              definition
            }
          }
        }

      default:
        return {
          '@type': blockType
        }
    }
  }

  return TurnToHelper
})
