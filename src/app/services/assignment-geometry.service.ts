import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { BackendConfigService } from './backend-config.service';

export interface AssignmentGeometry {
  geometry_id: string;
  name: string;
  description?: string;
  geometry: {
    type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
    coordinates: unknown;
  };
  geometry_type: 'Zone' | 'Route' | 'Boundary';
}

@Injectable({
  providedIn: 'root'
})
export class AssignmentGeometryService {
  private readonly authService = inject(AuthService);
  private readonly backendConfig = inject(BackendConfigService);
  private readonly cache = new Map<string, AssignmentGeometry | null>();

  async loadGeometriesByIds(geometryIds: string[]): Promise<AssignmentGeometry[]> {
    const uniqueIds = [...new Set(geometryIds.filter(Boolean))];
    const geometries = await Promise.all(uniqueIds.map(id => this.getGeometryById(id)));
    return geometries.filter((geometry): geometry is AssignmentGeometry => geometry !== null);
  }

  private async getGeometryById(geometryId: string): Promise<AssignmentGeometry | null> {
    if (this.cache.has(geometryId)) {
      return this.cache.get(geometryId) ?? null;
    }

    try {
      const response = await this.authService.authenticatedFetch(
        `${this.backendConfig.getBaseUrl()}/queries/map_geometries/${geometryId}`
      );

      if (response.status === 404) {
        this.cache.set(geometryId, null);
        return null;
      }

      if (!response.ok) {
        throw new Error(`Failed to fetch geometry ${geometryId}`);
      }

      const geometry = await response.json() as AssignmentGeometry;
      this.cache.set(geometryId, geometry);
      return geometry;
    } catch (error) {
      console.error('Error fetching assignment geometry:', error);
      this.cache.set(geometryId, null);
      return null;
    }
  }
}