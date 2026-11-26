import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'se.geoentrepreneur.app',
  appName: 'geoentrepreneur-app',
  webDir: 'dist/geoentrepreneur-app/browser',
  plugins: {
    CapacitorHttp: {
      enabled: true
    }
  }
};

export default config;
