import { useState, useCallback } from 'react';
import type { GeolocationResult } from '@/types';

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

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setError('Geolocation tidak didukung oleh browser Anda');
      return;
    }

    setIsLoading(true);
    setError(null);

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

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
      },
      (err) => {
        setIsLoading(false);
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setError('Izin lokasi ditolak. Silakan aktifkan di pengaturan browser.');
            break;
          case err.POSITION_UNAVAILABLE:
            setError('Informasi lokasi tidak tersedia.');
            break;
          case err.TIMEOUT:
            setError('Permintaan lokasi timeout.');
            break;
          default:
            setError('Terjadi kesalahan saat mendapatkan lokasi.');
        }
      },
      {
        enableHighAccuracy: false,
        timeout: 10000,
        maximumAge: 300000, // Cache for 5 minutes
      },
    );
  }, []);

  return { location, isLoading, error, requestLocation };
}
