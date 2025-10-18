// Default commission rates
const DEFAULT_COMMISSION_RATES = {
  DIRECT_COMMISSION: 0.12, // 12% default direct commission
  INDIRECT_RATIO: 0.5,     // 50% of direct commission for indirect referrals
};

// Commission rate tiers based on economic conditions
const COMMISSION_TIERS = [
  { minAmount: 0, directRate: 0.12, indirectRate: 0.06 }, // 12% direct, 6% indirect
  { minAmount: 10000, directRate: 0.10, indirectRate: 0.05 }, // 10% direct, 5% indirect
  { minAmount: 50000, directRate: 0.08, indirectRate: 0.04 }  // 8% direct, 4% indirect
];

// Get current commission rates based on total sales amount
function getCurrentRates(totalSales = 0) {
  // Sort tiers by minAmount in descending order
  const sortedTiers = [...COMMISSION_TIERS].sort((a, b) => b.minAmount - a.minAmount);
  
  // Find the first tier where totalSales >= minAmount
  const currentTier = sortedTiers.find(tier => totalSales >= tier.minAmount) || 
                     { directRate: DEFAULT_COMMISSION_RATES.DIRECT_COMMISSION, 
                       indirectRate: DEFAULT_COMMISSION_RATES.DIRECT_COMMISSION * DEFAULT_COMMISSION_RATES.INDIRECT_RATIO };
  
  return {
    directRate: currentTier.directRate,
    indirectRate: currentTier.indirectRate || (currentTier.directRate * DEFAULT_COMMISSION_RATES.INDIRECT_RATIO)
  };
}

// Calculate commission for a sale
function calculateCommissions(saleAmount, totalSales = 0, isDirect = true) {
  const rates = getCurrentRates(totalSales);
  const rate = isDirect ? rates.directRate : rates.indirectRate;
  
  return {
    amount: saleAmount * rate,
    rate: rate * 100, // Return as percentage
    isDirect,
    tier: {
      directRate: rates.directRate * 100,
      indirectRate: rates.indirectRate * 100
    }
  };
}

export {
  getCurrentRates,
  calculateCommissions,
  DEFAULT_COMMISSION_RATES,
  COMMISSION_TIERS
};
