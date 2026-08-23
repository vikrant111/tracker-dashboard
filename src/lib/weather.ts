import { TIMING } from "./constants.ts";
/**
 * Weather for the greeting sky — **off unless configured**.
 *
 * Set `WEATHER_LAT` and `WEATHER_LON` in `.env.local` to switch it on. Without
 * them nothing is fetched, nothing leaves the network, and the scene simply
 * follows the clock.
 *
 * There is deliberately no fallback that guesses. A dashboard whose whole
 * discipline is that every number is real must not draw rain it invented.
 *
 * Source: Open-Meteo — free, no API key, no account.
 */

export type Sky = "clear" | "cloudy" | "overcast" | "rain" | "snow" | "storm" | "fog";

export type Weather = {
  sky: Sky;
  /** Degrees Celsius, rounded. */
  temperature: number;
  /** What the provider called it, for the tooltip. */
  label: string;
};

/** WMO weather codes, collapsed to what the scene can actually draw. */
export function skyForCode(code: number): { sky: Sky; label: string } {
  if (!Number.isFinite(code)) return { sky: "clear", label: "Clear" };
  const c = Math.trunc(code);
  if (c === 0) return { sky: "clear", label: "Clear" };
  if (c <= 2) return { sky: "cloudy", label: "Partly cloudy" };
  if (c === 3) return { sky: "overcast", label: "Overcast" };
  if (c <= 48) return { sky: "fog", label: "Fog" };
  if (c <= 57) return { sky: "rain", label: "Drizzle" };
  if (c <= 67) return { sky: "rain", label: "Rain" };
  if (c <= 77) return { sky: "snow", label: "Snow" };
  if (c <= 82) return { sky: "rain", label: "Showers" };
  if (c <= 86) return { sky: "snow", label: "Snow showers" };
  return { sky: "storm", label: "Thunderstorm" };
}

const TTL_MS = TIMING.weatherTtlMs;
let cache: { at: number; value: Weather | null } | null = null;

/**
 * Bounds-check the configured point; a bad value must not reach the URL.
 *
 * Blank is checked before Number(), because `Number("")` is 0 — and 0,0 is a
 * real point in the Atlantic that Open-Meteo will happily answer for. The
 * shipped `.env.example` leaves both keys blank, so without this the default
 * install would show a stranger's weather and call it yours.
 */
function coords(): { lat: number; lon: number } | null {
  const rawLat = process.env.WEATHER_LAT?.trim();
  const rawLon = process.env.WEATHER_LON?.trim();
  if (!rawLat || !rawLon) return null;

  const lat = Number(rawLat);
  const lon = Number(rawLon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/**
 * Returns null when unconfigured, unreachable, or malformed — every failure
 * degrades to "no weather" rather than to a guess.
 */
export async function currentWeather(): Promise<Weather | null> {
  const point = coords();
  if (!point) return null;

  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast?latitude=${point.lat}&longitude=${point.lon}` +
      `&current=temperature_2m,weather_code&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMING.weatherTimeoutMs), cache: "no-store" });
    if (!res.ok) throw new Error(`weather ${res.status}`);

    const body = (await res.json()) as { current?: { temperature_2m?: number; weather_code?: number } };
    const code = body.current?.weather_code;
    const temp = body.current?.temperature_2m;
    if (!Number.isFinite(code) || !Number.isFinite(temp)) throw new Error("weather payload");

    const { sky, label } = skyForCode(code as number);
    const value: Weather = { sky, label, temperature: Math.round(temp as number) };
    cache = { at: Date.now(), value };
    return value;
  } catch (err) {
    // Cache the miss too, so a flaky provider is not retried on every render.
    cache = { at: Date.now(), value: null };
    console.warn("[weather] unavailable:", err instanceof Error ? err.message : err);
    return null;
  }
}
