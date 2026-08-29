/**
 * FX Engine with Real-Time Fetching, 3-Second Timeout, and Edge Fallback Baseline
 */

export interface ExchangeRates {
  base: string;
  rates: Record<string, number>;
  source: 'live' | 'fallback';
  timestamp: string;
}

// Fallback rates relative to USD (USD = 1.0)
// Rates: 1 USD = 16,350 IDR, 0.92 EUR, 1.34 SGD, 155.0 JPY, 0.78 GBP, 1.0 USDT, 0.0000155 BTC
export const FALLBACK_RATES_USD_BASE: Record<string, number> = {
  USD: 1.0,
  USDT: 1.0,
  IDR: 16350.0,
  EUR: 0.92,
  SGD: 1.34,
  JPY: 155.0,
  GBP: 0.78,
  BTC: 0.0000155,
};

const FX_API_URL = 'https://open.er-api.com/v6/latest/USD';
const FX_TIMEOUT_MS = 3000;

export async function getExchangeRates(fetchFn: typeof fetch = fetch): Promise<ExchangeRates> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FX_TIMEOUT_MS);

  try {
    const response = await fetchFn(FX_API_URL, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    clearTimeout(timeoutId);

    if (response.ok) {
      const data = (await response.json()) as unknown;
      if (data && typeof data === 'object' && 'rates' in data && data.rates && typeof data.rates === 'object') {
        const rawRates = data.rates as Record<string, unknown>;
        const rates: Record<string, number> = {
          ...FALLBACK_RATES_USD_BASE,
        };
        for (const [k, v] of Object.entries(rawRates)) {
          if (typeof v === 'number' && Number.isFinite(v) && v > 0) {
            rates[k.toUpperCase()] = v;
          }
        }
        return {
          base: 'USD',
          rates,
          source: 'live',
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch {
    // Network error, abort/timeout, or JSON parsing error -> safely fallback
  } finally {
    clearTimeout(timeoutId);
  }

  return {
    base: 'USD',
    rates: { ...FALLBACK_RATES_USD_BASE },
    source: 'fallback',
    timestamp: new Date().toISOString(),
  };
}

/**
 * Convert an amount from fromCurrency to toCurrency given exchange rates relative to USD.
 * Formula: target = source * (rate[to] / rate[from])
 */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number>
): number {
  if (!Number.isFinite(amount) || amount === 0) return 0;
  const from = fromCurrency.toUpperCase();
  const to = toCurrency.toUpperCase();
  if (from === to) return amount;

  const fromRate = rates[from] || FALLBACK_RATES_USD_BASE[from] || 1.0;
  const toRate = rates[to] || FALLBACK_RATES_USD_BASE[to] || 1.0;

  if (fromRate <= 0) return amount;

  // Convert from source to USD then USD to target
  const amountInUsd = amount / fromRate;
  const converted = amountInUsd * toRate;

  // Return clean rounded float
  return Math.round(converted * 100) / 100;
}
