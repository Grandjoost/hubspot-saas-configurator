export type Billing = 'monthly' | 'annual';

/**
 * Annual billing discount applied to recurring line items.
 * Mirrors HubSpot's own pricing convention ("save 10% with annual billing").
 */
export const ANNUAL_DISCOUNT = 0.1;

/** Currency formatter for the configurator. */
export function formatPrice(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Suffix for recurring vs one-time items, billing-aware. */
export function priceSuffix(isOneTime: boolean, billing: Billing = 'monthly'): string {
  if (isOneTime) return 'one-time';
  return billing === 'annual' ? '/ year' : '/ month';
}

/**
 * Effective unit price for a line item, given the chosen billing cadence.
 * Recurring items in annual mode → monthly × 12 × (1 − ANNUAL_DISCOUNT).
 * One-time items are always charged as-is.
 */
export function effectivePrice(
  unitPrice: number,
  isOneTime: boolean,
  billing: Billing
): number {
  if (isOneTime) return unitPrice;
  if (billing === 'annual') {
    return Math.round(unitPrice * 12 * (1 - ANNUAL_DISCOUNT));
  }
  return unitPrice;
}
