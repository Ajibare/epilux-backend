// Delivery pricing shared by order creation and the storefront display.
// Override per environment with DELIVERY_FEE / FREE_DELIVERY_THRESHOLD (in naira).
const toAmount = (value, fallback) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

export const DELIVERY_FEE = toAmount(process.env.DELIVERY_FEE, 1500);
export const FREE_DELIVERY_THRESHOLD = toAmount(process.env.FREE_DELIVERY_THRESHOLD, 10000);

export const calculateDeliveryFee = (subtotal) =>
    subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
