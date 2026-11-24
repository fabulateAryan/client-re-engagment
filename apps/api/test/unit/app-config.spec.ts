import { InvalidConfigError, loadAppConfig, readPackageVersion } from '../../src/config';

describe('loadAppConfig', () => {
  it('applies defaults when optional variables are missing', () => {
    const config = loadAppConfig({}, '1.2.3');
    expect(config).toMatchObject({
      nodeEnv: 'development',
      port: 3001,
      corsOrigin: 'http://localhost:3000',
      version: '1.2.3',
    });
  });

  it('parses provided values', () => {
    const config = loadAppConfig(
      { NODE_ENV: 'test', API_PORT: '4000', CORS_ORIGIN: 'http://localhost:5000' },
      '1.0.0',
    );
    expect(config.port).toBe(4000);
    expect(config.corsOrigin).toBe('http://localhost:5000');
  });

  it('rejects invalid values and lists every problem', () => {
    expect(() =>
      loadAppConfig({ NODE_ENV: 'staging', API_PORT: 'abc', CORS_ORIGIN: 'not a url' }, '1.0.0'),
    ).toThrow(InvalidConfigError);
    try {
      loadAppConfig({ NODE_ENV: 'staging', API_PORT: 'abc', CORS_ORIGIN: 'not a url' }, '1.0.0');
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain('NODE_ENV');
      expect(message).toContain('API_PORT');
      expect(message).toContain('CORS_ORIGIN');
    }
  });

  it('reads the version from package.json', () => {
    expect(readPackageVersion()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
