import { Injectable, signal } from '@angular/core';

const BACKEND_URL_STORAGE_KEY = 'geoentrepreneur.backendUrl';
const DEFAULT_BACKEND_URL = 'https://internal.geoentrepreneur.se:3443';
const LEGACY_DEFAULT_BACKEND_URL = 'https://internal.geoentrepreneur.se';

@Injectable({
  providedIn: 'root'
})
export class BackendConfigService {
  readonly backendUrl = signal(this.readStoredBackendUrl());

  getBaseUrl(): string {
    return this.backendUrl();
  }

  setBaseUrl(url: string): void {
    const normalizedUrl = url.trim().replace(/\/+$/, '');
    this.backendUrl.set(normalizedUrl || DEFAULT_BACKEND_URL);
    localStorage.setItem(BACKEND_URL_STORAGE_KEY, this.backendUrl());
  }

  reset(): void {
    localStorage.removeItem(BACKEND_URL_STORAGE_KEY);
    this.backendUrl.set(DEFAULT_BACKEND_URL);
  }

  private readStoredBackendUrl(): string {
    const storedUrl = localStorage.getItem(BACKEND_URL_STORAGE_KEY);
    if (!storedUrl) {
      return DEFAULT_BACKEND_URL;
    }

    const normalizedUrl = storedUrl.trim().replace(/\/+$/, '');
    if (!normalizedUrl || normalizedUrl === LEGACY_DEFAULT_BACKEND_URL) {
      return DEFAULT_BACKEND_URL;
    }

    return normalizedUrl;
  }
}