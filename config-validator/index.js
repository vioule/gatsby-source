'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.validator = exports.ConfigValidator = exports.Validators = void 0;
exports.Validators = {};
class ConfigValidator {
  validate(config) {
    return this._validateServiceConfig(config);
  }
  _validateServiceConfig(config) {
    var _a, _b;
    const errors = [];
    errors.push(...this._validateNonEmptyString('project', config.project));
    errors.push(...this._validateNonEmptyString('url', config.url));
    if ((_a = config.sdkOptions) === null || _a === void 0 ? void 0 : _a.global) {
      errors.push(...this._validateSdkOptionSet(config.sdkOptions.global, 'sdkOptions.global.'));
    }
    if ((_b = config.sdkOptions) === null || _b === void 0 ? void 0 : _b.collectionSpecific) {
      Object.entries(config.sdkOptions.collectionSpecific).forEach(([k, v]) => {
        errors.push(...this._validateSdkOptionSet(v, `sdkOptions.collectionSpecific.${k}.`));
      });
    }
    return errors;
  }
  _validateSdkOptionSet(options, keyPrefix = '') {
    if (!options) {
      return [];
    }
    const errors = [];
    if (!this._isNullOrUndefined(options.maxResults)) {
      errors.push(...this._validateNumber(`${keyPrefix}maxResults`, options.maxResults));
    }
    if (!this._isNullOrUndefined(options.pageSize)) {
      errors.push(...this._validateNumber(`${keyPrefix}pageSize`, options.pageSize));
    }
    if (!this._isNullOrUndefined(options.requestThrottle)) {
      errors.push(...this._validateNumber(`${keyPrefix}requestThrottle`, options.requestThrottle));
    }
    if (!this._isNullOrUndefined(options.requestTimeout)) {
      errors.push(...this._validateNumber(`${keyPrefix}requestTimeout`, options.requestTimeout));
    }
    return errors;
  }
  _validateNonEmptyString(key, value) {
    if (!value) {
      return [this._formatMissingValueError(key)];
    } else if (typeof value !== 'string') {
      return [this._formatInvalidTypeError(key, 'string', value)];
    } else if (!value.trim()) {
      return [this._formatInvalidValueError(key, 'alpha-numeric string', value)];
    }
    return [];
  }
  _validateNumber(key, val) {
    if (typeof val !== 'number') {
      return [this._formatInvalidTypeError(key, 'number', val)];
    } else if (isNaN(val)) {
      return [this._formatInvalidValueError(key, 'a finite number', 'NaN')];
    } else if (!Number.isFinite(val)) {
      return [this._formatInvalidValueError(key, 'a finite number', val.toString())];
    }
    return [];
  }
  _isNullOrUndefined(value) {
    return typeof value === 'undefined' || value === null;
  }
  _formatInvalidTypeError(key, expected, received) {
    return this._formatInvalidValueError(key, `'${expected}' type`, `'${typeof received}' type`);
  }
  _formatInvalidValueError(key, expected, received) {
    return `Invalid config option: '${key}'. Expected ${expected}, received ${received}.`;
  }
  _formatMissingValueError(key) {
    return `Required config option missing: '${key}'.`;
  }
}
exports.ConfigValidator = ConfigValidator;
exports.validator = new ConfigValidator();
