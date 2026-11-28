import { Injectable, signal } from '@angular/core';
import { Capacitor } from '@capacitor/core';

const BACKEND_URL_STORAGE_KEY = 'geoentrepreneur.backendUrl';
const DEFAULT_BACKEND_URL = 'https://internal.geoentrepreneur.se:3443';
const LEGACY_DEFAULT_BACKEND_URL = 'https://internal.geoentrepreneur.se';
const NATIVE_DEVELOPMENT_URL = 'http://192.168.1.164:3001';
const LEGACY_NATIVE_DEVELOPMENT_URL = 'http://172.20.10.2:3001';

@Injectable({
  providedIn: 'root'
})
export class BackendConfigService {
  readonly backendUrl = signal(this.readStoredBackendUrl());

  getBaseUrl(): string {
    return this.backendUrl();
  }

  getEventsUrl(): string {
    if (!Capacitor.isNativePlatform()) {
      return 'https://internal.geoentrepreneur.se:8443/events';
    }

    const url = new URL(this.getBaseUrl());
    url.port = '3000';
    url.pathname = '/events';
    url.search = '';
    return url.toString();
  }

  setBaseUrl(url: string): void {
    const normalizedUrl = url.trim().replace(/\/+$/, '');
    this.backendUrl.set(normalizedUrl || DEFAULT_BACKEND_URL);
    localStorage.setItem(BACKEND_URL_STORAGE_KEY, this.backendUrl());
  }

  reset(): void {
    localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
    this.backendUrl.set(this.getDefaultBackendUrl());
  }

  private readStoredBackendUrl(): string {
    const storedUrl = localStorage.getItem(BACKEND_URL_STORAGE_KEY);
    if (!storedUrl) {
      return Capacitor.isNativePlatform()
        ? NATIVE_DEVELOPMENT_URL
        : DEFAULT_BACKEND_URL;
    }

    const normalizedUrl = storedUrl.trim().replace(/\/+$/, '');
    if (!normalizedUrl) {
      return this.getDefaultBackendUrl();
    }

    if (
      normalizedUrl === DEFAULT_BACKEND_URL ||
      normalizedUrl === LEGACY_DEFAULT_BACKEND_URL ||
      (Capacitor.isNativePlatform() && normalizedUrl === LEGACY_NATIVE_DEVELOPMENT_URL)
    ) {
      return this.getDefaultBackendUrl();
    }

    return normalizedUrl;
  }

  private getDefaultBackendUrl(): string {
    return Capacitor.isNativePlatform()
      ? NATIVE_DEVELOPMENT_URL
      : DEFAULT_BACKEND_URL;
  }
}