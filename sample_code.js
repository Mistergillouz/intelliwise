sap.ui.define([
  'sap/bi/webi/core/flux/core/WebiAbstractHelper',
  'sap/bi/webi/core/utils/ObjectUtils',
  'sap/bi/webi/ui/ROHTML/ROItem',
  'sap/bi/webi/lib/constants/WorkbenchInteractionMode',
  'sap/bi/webi/ui/reportView/feedback/SelectionFeedbackEditing',
  'sap/bi/webi/jsapi/flux/constants/WebiReportBlockTypes',
  'sap/bi/webi/lib/constants/WebiMeasurementUnits'

], function ( // eslint-disable-line
  WebiAbstractHelper,
  ObjectUtils,
  ROItem,
  WorkbenchInteractionMode,
  SelectionFeedbackEditing,
  WebiReportBlockTypes,
  WebiMeasurementUnits
) {
  'use strict';

  const ResizeHelper = WebiAbstractHelper.extend(
    'sap.bi.webi.ui.reportView.feedback.ResizeHelper',
    {
      metadata: {
        properties: {
          name: {
            type: 'string',
            defaultValue: 'Resize Helper'
          },
          type: {
            defaultValue: 'resizeHelper'
          }
        }
      }
    }
  );

  ResizeHelper.MIN_SIZE = WebiMeasurementUnits.unit2metric(0.2, WebiMeasurementUnits.INCH); // eslint-disable-line no-magic-numbers

  ResizeHelper.prototype.getAutoFitResizeData = function (elementInfos, resizerType) {
    const resizeData = {};

    resizeData.size = ObjectUtils.clone(elementInfos.size);
    const elementType = elementInfos['@type'];

    if (elementType === WebiReportBlockTypes.CELL.id) {
      if (resizerType === SelectionFeedbackEditing.ResizerType.BottomCenter) {
        resizeData.size['@autofitHeight'] = 'true';
        resizeData.size['@minimalHeight'] = 100;
      } else if (resizerType === SelectionFeedbackEditing.ResizerType.CenterRight) {
        resizeData.size['@autofitWidth'] = 'true';
        resizeData.size['@minimalWidth'] = 100;
      }
    }

    ObjectUtils.
    HelperReistry.getTotoHelper().
    return resizeData;
  };

  ResizeHelper.prototype.getResizeData = function (elementInfos, feedbackResizeData, roItemType, resizerType) { // eslint-disable-line max-statements, max-lines-per-function, complexity
    const leftShift = feedbackResizeData.leftShift;
    const rightShift = feedbackResizeData.rightShift;
    const topShift = feedbackResizeData.topShift;
    const heightShift = feedbackResizeData.heightShift;
    const height = feedbackResizeData.height;
    const width = feedbackResizeData.width;

    const resizeData = {};

    switch (roItemType) {
      case ROItem.Type.FreeCell:
      case ROItem.Type.Visualization:
      case ROItem.Type.CustomElement:
      case ROItem.Type.WireElement:
      case ROItem.Type.Table:
        if ((typeof leftShift !== 'undefined' && leftShift !== 0) ||
          (typeof topShift !== 'undefined' && topShift !== 0) ||
          (typeof width !== 'undefined' && width !== elementInfos.size['@minimalWidth']) ||
          (typeof height !== 'undefined' && height !== elementInfos.size['@minimalHeight'])
        ) {
          resizeData.position = ObjectUtils.clone(elementInfos.position);
          if (typeof width !== 'undefined') {
            if (typeof leftShift !== 'undefined') {
              resizeData.position['@x'] = Math.max(elementInfos.position['@x'] + leftShift, 0);
            }
            if (typeof rightShift !== 'undefined') {
              resizeData.position['@x'] = Math.max(elementInfos.position['@x'] + rightShift, 0);
            }
          }
          if (typeof topShift !== 'undefined') {
            resizeData.position['@y'] = Math.max(elementInfos.position['@y'] + topShift, 0);
          }

          resizeData.size = ObjectUtils.clone(elementInfos.size);
          if (typeof width !== 'undefined') {
            resizeData.size['@minimalWidth'] = Math.max(width, ResizeHelper.MIN_SIZE);
            if (resizeData.size['@minimalWidth'] !== elementInfos.size['@minimalWidth']) {
              resizeData.size['@autofitWidth'] = 'false';
            }
          }
          if (typeof height !== 'undefined') {
            resizeData.size['@minimalHeight'] = Math.max(height, ResizeHelper.MIN_SIZE);
            if (resizeData.size['@minimalHeight'] !== elementInfos.size['@minimalHeight']) {
              resizeData.size['@autofitHeight'] = 'false';
            }
          }
        }
        break;

      case ROItem.Type.TableCell:
        if (
          (typeof width !== 'undefined' && width !== elementInfos.size['@minimalWidth']) ||
          (typeof height !== 'undefined' && height !== elementInfos.size['@minimalHeight'])
        ) {
          resizeData.size = ObjectUtils.clone(elementInfos.size);
          if (typeof width !== 'undefined') {
            resizeData.size['@minimalWidth'] = Math.max(width, ResizeHelper.MIN_SIZE);
            if (resizeData.size['@minimalWidth'] !== elementInfos.size['@minimalWidth']) {
              resizeData.size['@autofitWidth'] = 'false';
            }
          }
          if (typeof height !== 'undefined') {
            resizeData.size['@minimalHeight'] = Math.max(height, ResizeHelper.MIN_SIZE);
            if (resizeData.size['@minimalHeight'] !== elementInfos.size['@minimalHeight']) {
              resizeData.size['@autofitHeight'] = 'false';
            }
          }
        }
        break;

      case ROItem.Type.PageHeader:
      case ROItem.Type.PageFooter:
        if (typeof height !== 'undefined' && height !== elementInfos.size['@minimalHeight']) {
          resizeData.size = ObjectUtils.clone(elementInfos.size);
          resizeData.size['@minimalHeight'] = Math.max(height, ResizeHelper.MIN_SIZE);
          if (resizeData.size['@minimalHeight'] !== elementInfos.size['@minimalHeight']) {
            resizeData.size['@autofitHeight'] = 'false';
          }
        }
        break;

      case ROItem.Type.Section:
        if (resizerType === SelectionFeedbackEditing.ResizerType.TopCenter) {
          if (typeof topShift !== 'undefined' && topShift !== 0) {
            resizeData.position = ObjectUtils.clone(elementInfos.position);
            resizeData.position['@topMargin'] = Math.max(elementInfos.position['@topMargin'] + topShift, 0);
          }
        } else if (resizerType === SelectionFeedbackEditing.ResizerType.BottomCenter) {
          if (typeof heightShift !== 'undefined' && heightShift !== 0) {
            resizeData.padding = ObjectUtils.clone(elementInfos.padding);
            resizeData.padding['@bottom'] = Math.max(resizeData.padding['@bottom'] + heightShift, 0);
          }
        }
        break;

      default:
        break;
    }

    return resizeData;
  };

  return ResizeHelper;
});
