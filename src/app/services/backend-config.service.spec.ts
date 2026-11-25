import { BackendConfigService } from './backend-config.service';

describe('BackendConfigService', () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      get length() {
        return values.size;
      },
      clear: () => values.clear(),
      getItem: (key: string) => values.get(key) ?? null,
      key: (index: number) => [...values.keys()][index] ?? null,
      removeItem: (key: string) => values.delete(key),
      setItem: (key: string, value: string) => values.set(key, value)
    } satisfies Storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses the web API port by default', () => {
    const service = new BackendConfigService();

    expect(service.getBaseUrl()).toBe('https://internal.geoentrepreneur.se:3443');
  });

  it('migrates the previous default URL to the web API port', () => {
    localStorage.setItem(
      'geoentrepreneur.backendUrl',
      'https://internal.geoentrepreneur.se'
    );

    const service = new BackendConfigService();

    expect(service.getBaseUrl()).toBe('https://internal.geoentrepreneur.se:3443');
  });
});
