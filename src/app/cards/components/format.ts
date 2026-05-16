/** Currency formatter for the configurator. */
export function formatPrice(amount: number, currency: string = 'USD'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/** Suffix for recurring vs one-time items. */
export function priceSuffix(isOneTime: boolean): string {
  return isOneTime ? 'one-time' : '/ month';
}
