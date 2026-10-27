import type { AiOverview, AiRouting, ModelPrice } from './control';

// The rows of Control's price list (G5, C373): every provider and model in a feature's route, in the ledger, or with a
// saved price, once each, sorted, each with its price or null. Pure and free of server code (the price panel runs in the browser), so the test and the screen agree.
export type PriceRow = { providerId: string; model: string; price: ModelPrice | null };

export function priceRows(data: Pick<AiOverview, 'profiles' | 'prices'> & { routing: Pick<AiRouting, 'ledger'> }): PriceRow[] {
  const seen = new Map<string, { providerId: string; model: string }>();
  const add = (providerId: string, model: string) => seen.set(`${providerId} ${model}`, { providerId, model });
  for (const p of data.profiles) {
    if (p.providerId && p.model) add(p.providerId, p.model);
    for (const f of p.fallback) if (f.provider && f.model) add(f.provider, f.model);
  }
  for (const a of data.routing.ledger) add(a.providerId, a.model);
  for (const pr of data.prices) add(pr.providerId, pr.model);
  const price = new Map(data.prices.map((pr) => [`${pr.providerId} ${pr.model}`, pr]));
  return Array.from(seen, ([k, v]) => ({ ...v, price: price.get(k) ?? null })).sort((a, b) => a.providerId.localeCompare(b.providerId) || a.model.localeCompare(b.model));
}

// What an answer cost at a price, in US dollars; null when there is no price.
export function costOf(tokensIn: number, tokensOut: number, price: { inUsd: number; outUsd: number } | null | undefined): number | null {
  return price ? Math.round(((tokensIn * price.inUsd + tokensOut * price.outUsd) / 1_000_000) * 1_000_000) / 1_000_000 : null;
}
