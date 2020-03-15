import { PluginConfig } from '../gatsby-node';
import { DirectusServiceConfig, SdkOptions } from '../directus-service';

export type ValidationResult = string[];

export class ConfigValidator {
  public validate(config: PluginConfig): ValidationResult {
    return this._validateServiceConfig(config);
  }

  private _validateServiceConfig(config: DirectusServiceConfig): ValidationResult {
    const errors: string[] = [];

    errors.push(...this._validateNonEmptyString('project', config.project));
    errors.push(...this._validateNonEmptyString('url', config.url));

    if (config.sdkOptions?.global) {
      errors.push(...this._validateSdkOptionSet(config.sdkOptions.global, 'sdkOptions.global.'));
    }

    if (config.sdkOptions?.collectionSpecific) {
      Object.entries(config.sdkOptions.collectionSpecific).forEach(([k, v]) => {
        errors.push(...this._validateSdkOptionSet(v, `sdkOptions.collectionSpecific.${k}.`));
      });
    }

    return errors;
  }

  private _validateNonEmptyString(key: string, value: any): ValidationResult {
    if (!value) {
      return [this._formatMissingValueError(key)];
    } else if (typeof value !== 'string') {
      return [this._formatInvalidTypeError(key, 'string', value)];
    } else if (!value.trim()) {
      return [this._formatInvalidValueError(key, 'alpha-numeric string', value)];
    }

    return [];
  }

  private _validateSdkOptionSet(options?: SdkOptions, keyPrefix = ''): ValidationResult {
    if (!options) {
      return [];
    }

    return Object.keys(options).reduce(
      (errs, key) => [...errs, ...this._validateSdkOptionValue(`${keyPrefix}${key}`, options[key as keyof SdkOptions])],
      [] as ValidationResult,
    );
  }

  private _validateSdkOptionValue(key: string, val: any): ValidationResult {
    // Allow undefined or null skd options for all keys
    if (typeof val === 'undefined' || val === null) {
      return [];
    }

    if (typeof val !== 'number') {
      return [this._formatInvalidTypeError(key, 'number', val)];
    } else if (isNaN(val)) {
      return [this._formatInvalidValueError(key, 'a finite number', 'NaN')];
    } else if (!Number.isFinite(val)) {
      return [this._formatInvalidValueError(key, 'a finite number', val.toString())];
    }

    return [];
  }

  private _formatInvalidTypeError(key: string, expected: string, received: any): string {
    return this._formatInvalidValueError(key, `'${expected}' type`, `'${typeof received}' type`);
  }

  private _formatInvalidValueError(key: string, expected: string, received: string): string {
    return `Invalid config option: '${key}'. Expected ${expected}, received ${received}.`;
  }

  private _formatMissingValueError(key: string): string {
    return `Required config option missing: '${key}'.`;
  }
}

export const validator = new ConfigValidator();
