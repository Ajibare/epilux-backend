/**
 * Generates a unique SKU for products
 * Format: SKU-{RANDOM_STRING}-{TIMESTAMP}
 * @returns {string} A unique SKU string
 */
const generateSku = () => {
  const randomString = Math.random().toString(36).substring(2, 10).toUpperCase();
  const timestamp = Date.now().toString().slice(-4);
  return `SKU-${randomString}-${timestamp}`;
};

/**
 * Validates if a SKU is in the correct format
 * @param {string} sku - The SKU to validate
 * @returns {boolean} True if the SKU is valid
 */
const isValidSku = (sku) => {
  if (!sku || typeof sku !== 'string') return false;
  return /^SKU-[A-Z0-9]{8}-\d{4}$/.test(sku);
};

export { generateSku, isValidSku };
