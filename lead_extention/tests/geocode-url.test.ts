import { describe, expect, it } from 'vitest';
import { parseCoordinates, pinCoordinatesFromUrl, sameGeoPoint } from '../src/shared/utils';

// These pure helpers back the typed-location geocoding fix: selecting "Paris,
// France" must sweep Paris, never the Lahore map the user happened to start on.
describe('typed-location geocoding helpers', () => {
  it('reads the resolved place pin (!3d!4d) from a Maps place URL', () => {
    const parisPlace = 'https://www.google.com/maps/place/Paris,+France/@48.8566,2.3522,11z/data=!3m1!4b1!4m6!3m5!1s0x47e66e1f:0x40b!8m2!3d48.8566!4d2.3522';
    expect(pinCoordinatesFromUrl(parisPlace)).toEqual({ latitude: 48.8566, longitude: 2.3522 });
    expect(pinCoordinatesFromUrl('https://www.google.com/maps/search/Paris,+France/@31.5,74.3,12z')).toBeNull();
  });

  it('the place pin is the geocode even when the @ camera still lags on the old city', () => {
    // The reported bug: right after navigating, the URL carries the previous
    // Lahore camera (@31.5204,74.3587) while the resolved pin is already Paris.
    // We must trust the pin, not the stale camera.
    const lagging = 'https://www.google.com/maps/place/Paris,+France/@31.5204,74.3587,12z/data=!4m2!3m1!8m2!3d48.8566!4d2.3522';
    expect(pinCoordinatesFromUrl(lagging)).toEqual({ latitude: 48.8566, longitude: 2.3522 });
    expect(parseCoordinates(lagging)).toEqual({ latitude: 31.5204, longitude: 74.3587 }); // the stale camera
  });

  it('parseCoordinates reads the @ camera (used only once it has settled)', () => {
    expect(parseCoordinates('https://www.google.com/maps/search/Restaurant/@48.8566,2.3522,12z')).toEqual({ latitude: 48.8566, longitude: 2.3522 });
  });

  it('sameGeoPoint tells a settled camera from one still mid-fly, and a moved one from the start', () => {
    const lahore = { latitude: 31.5204, longitude: 74.3587 };
    const paris = { latitude: 48.8566, longitude: 2.3522 };
    // Same place within tolerance (two settled reads ~100 m apart).
    expect(sameGeoPoint(paris, { latitude: 48.8571, longitude: 2.3525 }, 0.01)).toBe(true);
    // Different cities are never "the same".
    expect(sameGeoPoint(paris, lahore, 0.05)).toBe(false);
    // Null-safe.
    expect(sameGeoPoint(null, paris, 0.01)).toBe(false);
  });
});
