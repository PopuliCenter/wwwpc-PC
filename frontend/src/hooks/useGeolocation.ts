import { useState, useCallback } from 'react';
import type { GeolocationResult } from '@/types';
import { getPosition } from '@/utils/geo';

interface UseGeolocationReturn {
  location: GeolocationResult | null;
  isLoading: boolean;
  error: string | null;
  requestLocation: () => void;
}

export function useGeolocation(): UseGeolocationReturn {
  const [location, setLocation] = useState<GeolocationResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestLocation = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    // getPosition() menangani native (plugin + izin lokasi Android) maupun web.
    const pos = await getPosition({
      enableHighAccuracy: false,
      timeout: 10000,
      maximumAge: 300000,
    });
    if (!pos) {
      setIsLoading(false);
      setError('Tidak bisa mendapatkan lokasi. Izinkan akses lokasi & aktifkan GPS.');
      return;
    }

    const { latitude, longitude } = pos;
    try {
      // Reverse geocode using a free API
      const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&accept-language=id`,
      );

      if (response.ok) {
        const data = await response.json();
        const address = data.address || {};
        setLocation({
          latitude,
          longitude,
          city: address.city || address.town || address.county || '',
          province: address.state || '',
        });
      } else {
        setLocation({ latitude, longitude });
      }
    } catch {
      // If reverse geocoding fails, still return coordinates
      setLocation({ latitude, longitude });
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { location, isLoading, error, requestLocation };
}
