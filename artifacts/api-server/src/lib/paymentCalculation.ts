/**
 * Shared order-amount math used by order creation and by the checkout preview
 * endpoint, so both always agree. Kept deliberately small and pure — this is
 * the clean integration point for future coupon/discount math: a coupon should
 * discount `baseAmountKobo` (or introduce a `discountKobo` step) *before*
 * calling `computeOrderAmounts`, not touch tax/fee percentages directly.
 */

export interface PaymentCalculationSettings {
  taxPercent: number;
  feePercent: number;
  feeFlatKobo: number;
}

export interface OrderAmountBreakdown {
  baseAmountKobo: number;
  taxKobo: number;
  feeKobo: number;
  totalKobo: number;
}

export function computeOrderAmounts(
  baseAmountKobo: number,
  settings: PaymentCalculationSettings,
): OrderAmountBreakdown {
  const taxKobo = Math.round(baseAmountKobo * ((settings.taxPercent || 0) / 100));
  const feeKobo =
    Math.round(baseAmountKobo * ((settings.feePercent || 0) / 100)) + Math.max(0, Math.round(settings.feeFlatKobo || 0));
  const totalKobo = baseAmountKobo + taxKobo + feeKobo;
  return { baseAmountKobo, taxKobo, feeKobo, totalKobo };
}
