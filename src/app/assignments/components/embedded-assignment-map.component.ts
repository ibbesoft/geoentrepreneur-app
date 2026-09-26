import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, SimpleChanges, ViewChild, inject, signal } from '@angular/core';
import { Assignment } from '../../services/assignment.models';
import { AssignmentGeometry, AssignmentGeometryService } from '../../services/assignment-geometry.service';

@Component({
  selector: 'app-embedded-assignment-map',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './embedded-assignment-map.component.html',
  styleUrl: './embedded-assignment-map.component.css'
})
export class EmbeddedAssignmentMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() assignment: Assignment | null = null;

  @ViewChild('mapContainer', { static: true })
  private mapContainer?: ElementRef<HTMLDivElement>;

  protected readonly loading = signal(false);
  protected readonly geometryCount = signal(0);
  protected readonly statusMessage = signal('Select an assignment to preview its geometry.');

  private readonly geometryService = inject(AssignmentGeometryService);
  private maplibre?: typeof import('maplibre-gl');
  private map?: import('maplibre-gl').Map;
  private mapReady = false;
  private renderRequestId = 0;
  private readonly resizeHandler = () => this.map?.resize();

  ngAfterViewInit(): void {
    this.initializeMap();
    window.addEventListener('resize', this.resizeHandler);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['assignment'] && this.mapReady) {
      void this.renderAssignmentGeometry();
    }
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resizeHandler);
    this.map?.remove();
  }

  private initializeMap(): void {
    if (!this.mapContainer?.nativeElement || this.map) return;
    void this.loadMapLibrary();
  }

  private async loadMapLibrary(): Promise<void> {
    if (!this.maplibre) {
      this.maplibre = await import('maplibre-gl');
      // Must be called before the first Map instance is created.
      this.maplibre.setWorkerUrl('/assets/maplibre-gl-worker.mjs');
    }

    if (!this.mapContainer?.nativeElement || this.map) return;

    const maplibre = this.maplibre;

    this.map = new maplibre.Map({
      container: this.mapContainer.nativeElement,
      style: {
        version: 8,
        sources: {
          osm: {
            type: 'raster',
            tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; OpenStreetMap contributors'
          }
        },
        layers: [{ id: 'osm', type: 'raster', source: 'osm' }]
      },
      center: [18.07, 59.33],
      zoom: 5,
      attributionControl: false
    });

    this.map.addControl(new maplibre.NavigationControl(), 'top-right');
    this.map.on('load', () => {
      this.mapReady = true;
      void this.renderAssignmentGeometry();
    });
  }

  private async renderAssignmentGeometry(): Promise<void> {
    if (!this.mapReady || !this.map) return;

    const renderRequestId = ++this.renderRequestId;

    if (!this.assignment) {
      this.loading.set(false);
      this.geometryCount.set(0);
      this.statusMessage.set('Select an assignment to preview its geometry.');
      this.removeGeometryLayers();
      return;
    }

    this.loading.set(true);
    this.statusMessage.set(`Loading geometry for "${this.assignment.title}"...`);

    try {
      const geometries = await this.geometryService.loadGeometriesByIds(this.assignment.map_geometry_ids);
      if (renderRequestId !== this.renderRequestId) return;

      this.geometryCount.set(geometries.length);
      this.statusMessage.set(geometries.length > 0
        ? `${geometries.length} ${geometries.length === 1 ? 'geometry' : 'geometries'} loaded for "${this.assignment.title}".`
        : 'This assignment has no map geometries yet.');

      this.renderGeometries(geometries);
    } catch (error) {
      console.error('Failed to load assignment geometry:', error);
      if (renderRequestId !== this.renderRequestId) return;
      this.geometryCount.set(0);
      this.statusMessage.set('Unable to load geometry for the selected assignment.');
      this.removeGeometryLayers();
    } finally {
      if (renderRequestId === this.renderRequestId) this.loading.set(false);
    }
  }

  /** Mirrors the web app's renderSavedGeometries: always remove then re-add. */
  private renderGeometries(geometries: AssignmentGeometry[]): void {
    const map = this.map;
    if (!map) return;

    this.removeGeometryLayers();

    if (geometries.length === 0) return;

    console.log('[map] rendering geometries:', geometries.map(g => ({
      id: g.geometry_id,
      name: g.name,
      type: g.geometry.type,
      coordinates: g.geometry.coordinates
    })));

    this.fitGeometryBounds(geometries);
    requestAnimationFrame(() => map.resize());

    const featureCollection = {
      type: 'FeatureCollection' as const,
      features: geometries.map(g => ({
        type: 'Feature' as const,
        id: g.geometry_id,
        properties: {
          name: g.name,
          geometry_type: g.geometry_type,
          isPolygon: g.geometry.type === 'Polygon'
        },
        geometry: g.geometry as never
      }))
    };

   console.log(featureCollection);

    map.addSource('assignment-geometry', {
      type: 'geojson',
      data: featureCollection as never
    });

    map.addLayer({
      id: 'assignment-geometry-fill',
      type: 'fill',
      source: 'assignment-geometry',
      filter: ['==', ['get', 'isPolygon'], true],
      paint: {
        'fill-color': ['match', ['get', 'geometry_type'], 'Zone', '#4CAF50', 'Route', '#2196F3', 'Boundary', '#FF9800', '#6b8cff'],
        'fill-opacity': 0.3
      }
    });

    map.addLayer({
      id: 'assignment-geometry-outline',
      type: 'line',
      source: 'assignment-geometry',
      filter: ['==', ['get', 'isPolygon'], true],
      paint: {
        'line-color': ['match', ['get', 'geometry_type'], 'Zone', '#388E3C', 'Route', '#1976D2', 'Boundary', '#F57C00', '#dbeafe'],
        'line-width': 2
      }
    });

    map.addLayer({
      id: 'assignment-geometry-lines',
      type: 'line',
      source: 'assignment-geometry',
      filter: ['==', ['get', 'isPolygon'], false],
      paint: {
        'line-color': ['match', ['get', 'geometry_type'], 'Zone', '#4CAF50', 'Route', '#2196F3', 'Boundary', '#FF9800', '#67dbc5'],
        'line-width': 3
      }
    });

    
  }

  private removeGeometryLayers(): void {
    const map = this.map;
    if (!map) return;

    for (const id of ['assignment-geometry-fill', 'assignment-geometry-outline', 'assignment-geometry-lines']) {
      if (map.getLayer(id)) map.removeLayer(id);
    }
    if (map.getSource('assignment-geometry')) map.removeSource('assignment-geometry');
  }

  private fitGeometryBounds(geometries: AssignmentGeometry[]): void {
    const map = this.map;
    if (!map) return;

    let minLng = Infinity, maxLng = -Infinity, minLat = Infinity, maxLat = -Infinity;

    for (const g of geometries) {
      for (const [lng, lat] of this.flatCoordinates(g.geometry.coordinates)) {
        if (lng < minLng) minLng = lng;
        if (lng > maxLng) maxLng = lng;
        if (lat < minLat) minLat = lat;
        if (lat > maxLat) maxLat = lat;
      }
    }

    if (!isFinite(minLng)) {
      map.easeTo({ center: [18.07, 59.33], zoom: 5 });
      return;
    }

    map.fitBounds([[minLng, minLat], [maxLng, maxLat]], { padding: 48, maxZoom: 16, duration: 600 });
  }

  private *flatCoordinates(coordinates: unknown): Generator<[number, number]> {
    if (!Array.isArray(coordinates)) return;
    if (coordinates.length >= 2 && typeof coordinates[0] === 'number') {
      yield [coordinates[0] as number, coordinates[1] as number];
    } else {
      for (const c of coordinates) yield* this.flatCoordinates(c);
    }
  }
}