/* eslint-disable prefer-object-spread */
sap.ui.define('com/sap/webi/caf/publication/helpers/ObjectUtils', [
], function ( // eslint-disable-line

) {
  'use strict';

  const ObjectUtils = {
  };

  /**
   * Builds an array from the given parameter.
   * If its an array, it will be returned, otherwise a 1-element array will be created.
   *
   * @param {*} object :
   * @returns {array} the 'arrayfied' object
   */
  ObjectUtils.arrayfy = function (object) {
    let ret = [];
    if (Array.isArray(object)) {
      ret = object;
    } else if (object !== null && ObjectUtils.isDefined(object)) {
      ret = [object];
    }
    return ret;
  };

  /**
   * Returns true if the parameter is defined.
   * @param {*} value : a javascript variable
   * @returns {boolean} true if value is not undefined
   */
  ObjectUtils.isDefined = function (value) {
    return typeof value !== 'undefined';
  };

  /**
   * Returns true if the parameter is a number.
   * @param {*} value : a javascript variable
   * @returns {boolean} true if value is a number
   */
  ObjectUtils.isNumber = function (value) {
    if (typeof value === 'number') {
      return true;
    }
    if (value && typeof value === 'string' && !isNaN(value)) {
      return true;
    }
    return false;
  };

  /**
   * Parse a value into a boolean.
   *
   * @param {*} value :
   * @returns {boolean} true if the value is true or 'true'
   */
  ObjectUtils.parseBoolean = function (value) {
    return value === true || value === 'true';
  };

  /**
   * Check if a JSON Object is Empty.
   *
   * @param {object} obj ths JSON Object to test
   * @returns {boolean} true if the obj parameter is empty
   */
  ObjectUtils.isEmpty = function (obj) {
    if (!(typeof obj === 'object') || Object.keys(obj).length > 0) {
      return false;
    }

    return JSON.stringify(obj) === JSON.stringify({});
  };

  /**
   * Clone a JSON object.
   *
   * @param {*} obj :
   * @returns {object} a clone of the inital object
   */
  ObjectUtils.clone = function (obj = null) {
    if (obj) {
      return JSON.parse(JSON.stringify(obj));
    }
    return obj;
  };

  /**
   * Builds an array of name from a path string.
   * '.' or '/' are used as the separator
   *
   * @param {string} path : the path (separator can be a dot or a slash)
   * @returns {array} the splitted & cleaned path
   */
  ObjectUtils.buildPropertyPath = function (path) {
    const effectivePath = path || '';
    return effectivePath
      .split(/\.|\//g)
      .map((part) => part.trim())
      .filter((part) => Boolean(part));
  };

  /**
   * Get a property from an javascript object. The property is exprimed with a string describing the path
   *
   * @param {object} object :
   * @param {string} path : for example: "parameters.answers.lov"
   * @param {object} defaultValue : the default value
   * @returns {*} the corresponding property
   */
  ObjectUtils.getProperty = function (object, path, defaultValue) {
    const parts = ObjectUtils.buildPropertyPath(path);
    let result = parts.reduce((acc, part) => {
      if (acc) {
        return acc[part];
      }
      return void 0 // eslint-disable-line
    }, object);

    if (result === void 0) { // eslint-disable-line
      result = defaultValue;
    }

    return result;
  };

  /**
   * Set a property into an object. The property is exprimed with a path, if any of the path level do not exist
   * in the object, it will be created.
   *
   * @param {object} object :
   * @param {string} path :
   * @param {object} value :
   * @returns {undefined} nothing
   */
  ObjectUtils.setProperty = function (object, path, value) {
    ObjectUtils.assignProperty(object, path, value, false);
  };

  ObjectUtils.assignProperty = function (object, path, inValue, assign = true) {
    if (object) {
      const parts = ObjectUtils.buildPropertyPath(path);
      const last = parts.pop();
      let current = object;
      parts.forEach((part) => {
        if (typeof current[part] === 'undefined') {
          current[part] = {};
        }
        current = current[part];
      });

      let value = inValue;
      if (assign && $.isPlainObject(value)) { // eslint-disable-line
        value = Object.assign({}, current[last], value);
      }

      current[last] = value;
    }
  };

  /**
   * Checks the content of a javascript object
   *
   * @param {object} args : a javascript object
   * @param {array} members : a list of fields that should be defined in the 'args' object
   * @returns {boolean} true if the object contains all the expected members, false otherwise
   */
  ObjectUtils.checkArgs = function (args, members) {
    for (let i = 0; i < members.length; i++) {
      const member = members[i];
      if (typeof args[member] === 'undefined' || args[member] === null) {
        return false;
      }
    }
    return true;
  };

  ObjectUtils.compare = function (obj1, obj2) /* eslint-disable-line */ {
    if (obj1 === null || obj2 === null) {
      return obj2 === null && obj1 === null;
    }
    if (typeof obj1 === 'undefined' || typeof obj2 === 'undefined') {
      return typeof obj2 === 'undefined' && typeof obj1 === 'undefined';
    }
    if (typeof obj1 !== 'object' || typeof obj2 !== 'object') {
      return obj1 === obj2;
    }

    for (const att1 in obj1) {
      if (Object.prototype.hasOwnProperty.call(obj1, att1)) {
        if (typeof obj2[att1] === 'undefined') {
          return false;
        } else if (!ObjectUtils.compare(obj1[att1], obj2[att1])) {
          return false;
        }
      }
    }
    for (const att2 in obj2) {
      if (Object.prototype.hasOwnProperty.call(obj2, att2)) {
        if (!Object.prototype.hasOwnProperty.call(obj1, att2)) {
          return false;
        }
      }
    }
    return true;
  };

  ObjectUtils.countDecimals = function (value) {
    const index = String(value).indexOf('.');
    if (index === -1) {
      return 0;
    }
    return String(value).substring(index + 1).length;
  };

  ObjectUtils.capitalizeString = function (string) {
    if (typeof string !== 'string') {
      return '';
    }

    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
  };

  /* eslint-disable no-void */
  ObjectUtils.removeNulls = function (inObject) {
    if (inObject) {
      const object = ObjectUtils.clone(inObject);
      Object.keys(object).forEach((key) => {
        const value = object[key];
        if (value === null || value === void 0) {
          delete object[key];
        }
      });

      return object;
    }

    return inObject;
  };

  return ObjectUtils;
});
