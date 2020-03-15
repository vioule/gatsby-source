import { SdkOptions } from '../src/directus-service';
import { ConfigValidator } from '../src/config-validator';
import { PluginConfig } from '../src/gatsby-node';

describe('ConfigValidator', () => {
  let validator: ConfigValidator;
  let validBaseConfig: PluginConfig;

  beforeEach(() => {
    validator = new ConfigValidator();
    validBaseConfig = {
      project: 'TEST_PROJECT',
      url: 'TEST_URL',
    };
  });

  it('Should not return errors when a valid base config is used', () => {
    expect(validator.validate(validBaseConfig).length).toBe(0);
  });

  it('Should return an error if the `project` key is invalid', () => {
    const baseWithoutProject = {
      url: 'TEST_URL',
    };

    expect(validator.validate({ ...baseWithoutProject } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: null } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: undefined } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: '' } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: 0 } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: 1 } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: [] } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: ['str'] } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: {} } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: { project: 'test' } } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: true } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: '   ' } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: '\n' } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: '\t' } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutProject, project: new Date() } as any).length).toBe(1);
  });

  it('Should return an error if the `url` key is invalid', () => {
    const baseWithoutUrl = {
      project: 'TEST_PROJECT',
    };

    expect(validator.validate({ ...baseWithoutUrl } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: null } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: undefined } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: '' } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: 0 } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: 1 } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: [] } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: ['str'] } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: {} } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: { url: 'test' } } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: true } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: '   ' } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: '\n' } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: '\t' } as any).length).toBe(1);
    expect(validator.validate({ ...baseWithoutUrl, url: new Date() } as any).length).toBe(1);
  });

  it('Should not return errors when the SDK options are null or undefined', () => {
    expect(validator.validate({ ...validBaseConfig, sdkOptions: null as any }).length).toBe(0);
    expect(validator.validate({ ...validBaseConfig, sdkOptions: undefined }).length).toBe(0);
  });

  it('Should return errors when the SDK options are invalid types', () => {
    expect(validator.validate({ ...validBaseConfig, sdkOptions: 0 } as any).length).toBe(0);
    expect(validator.validate({ ...validBaseConfig, sdkOptions: 10 } as any).length).toBe(0);
    expect(validator.validate({ ...validBaseConfig, sdkOptions: [] } as any).length).toBe(0);
    expect(validator.validate({ ...validBaseConfig, sdkOptions: new Date() } as any).length).toBe(0);
    expect(validator.validate({ ...validBaseConfig, sdkOptions: ['not empty'] } as any).length).toBe(0);
    expect(validator.validate({ ...validBaseConfig, sdkOptions: 'yellow' } as any).length).toBe(0);
    expect(validator.validate({ ...validBaseConfig, sdkOptions: -1 } as any).length).toBe(0);
  });

  it('Should not return errors when global SDK option keys are not provided, null, or undefined', () => {
    const validConfigs: any[] = [
      {},
      { maxResults: null },
      { requestThrottle: null },
      { requestTimeout: null },
      { pageSize: null },
      { maxResults: undefined },
      { requestThrottle: undefined },
      { requestTimeout: undefined },
      { pageSize: undefined },
      { requestTimeout: null, maxResults: undefined },
      { pageSize: null, requestThrottle: undefined },
      { maxResults: undefined, requestTimeout: undefined, requestThrottle: null },
      { requestThrottle: null, pageSize: undefined, requestTimeout: null },
    ];

    for (const testCase of validConfigs) {
      const config: PluginConfig = { ...validBaseConfig, sdkOptions: { global: testCase } };
      expect(validator.validate(config).length).toBe(0);
    }
  });

  it('Should return errors when invalid SDK options provided', () => {});
});
