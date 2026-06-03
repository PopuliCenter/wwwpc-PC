export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodedAddress {
  city: string;
  province: string;
  displayName?: string;
}

export interface LocationData {
  city: string;
  province: string;
  capturedAt: Date;
}

export interface HeatmapPoint {
  city: string;
  province: string;
  count: number;
}

export interface GeoFilter {
  city?: string;
  province?: string;
}

export interface CaptureLocationResult {
  id: string;
  city: string;
  province: string;
  capturedAt: Date;
}
