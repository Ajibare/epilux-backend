import axios from 'axios';
import config from '../config/environment.js';

// Nigerian banks and account-name lookup through Flutterwave, using the same
// keys as payments. Lookups are advisory: they never block a withdrawal.

const BANK_CACHE_MS = 12 * 60 * 60 * 1000;
const RESOLVE_TIMEOUT_MS = 8000;

// Used only if Flutterwave can't be reached (codes are CBN/NIP codes)
const FALLBACK_BANKS = [
    ['044', 'Access Bank'], ['023', 'Citibank Nigeria'], ['050', 'Ecobank Nigeria'], ['070', 'Fidelity Bank'],
    ['011', 'First Bank of Nigeria'], ['214', 'First City Monument Bank'], ['058', 'Guaranty Trust Bank'],
    ['030', 'Heritage Bank'], ['301', 'Jaiz Bank'], ['082', 'Keystone Bank'], ['50515', 'Moniepoint MFB'],
    ['999992', 'OPay'], ['999991', 'PalmPay'], ['076', 'Polaris Bank'], ['101', 'Providus Bank'],
    ['221', 'Stanbic IBTC Bank'], ['068', 'Standard Chartered Bank'], ['232', 'Sterling Bank'],
    ['100', 'Suntrust Bank'], ['032', 'Union Bank of Nigeria'], ['033', 'United Bank for Africa'],
    ['215', 'Unity Bank'], ['035', 'Wema Bank'], ['057', 'Zenith Bank'],
].map(([code, name]) => ({ code, name }));

let cache = { banks: null, at: 0 };

const headers = () => ({ Authorization: `Bearer ${config.FLUTTERWAVE_SECRET_KEY}` });

/** All Nigerian banks, one entry per code, sorted by name. */
export const getBanks = async () => {
    if (cache.banks && Date.now() - cache.at < BANK_CACHE_MS) return { banks: cache.banks, source: 'flutterwave' };
    try {
        const { data } = await axios.get(`${config.FLUTTERWAVE_BASE_URL}/banks/NG`, { headers: headers(), timeout: 10000 });
        const seen = new Set();
        const banks = (data?.data || [])
            .filter((b) => b?.code && b?.name && !seen.has(b.code) && seen.add(b.code))
            .map((b) => ({ code: String(b.code), name: String(b.name).trim() }))
            .sort((a, b) => a.name.localeCompare(b.name));
        if (banks.length === 0) throw new Error('empty bank list');
        cache = { banks, at: Date.now() };
        return { banks, source: 'flutterwave' };
    } catch (error) {
        console.error('Bank list unavailable, using fallback:', error.message);
        // Serve a stale list rather than the short fallback if we have one
        return { banks: cache.banks || FALLBACK_BANKS, source: cache.banks ? 'flutterwave' : 'fallback' };
    }
};

/**
 * Look up the name on a bank account. Never throws for provider problems:
 * returns { verified: false, reason } so the caller can carry on without it.
 */
export const resolveAccount = async (accountNumber, bankCode) => {
    const number = String(accountNumber || '').replace(/\D/g, '');
    const code = String(bankCode || '').trim();
    if (!/^\d{10}$/.test(number) || !code) return { verified: false, reason: 'invalid_input' };
    if (!config.FLUTTERWAVE_SECRET_KEY) return { verified: false, reason: 'not_configured' };

    try {
        const { data } = await axios.post(
            `${config.FLUTTERWAVE_BASE_URL}/accounts/resolve`,
            { account_number: number, account_bank: code },
            { headers: { ...headers(), 'Content-Type': 'application/json' }, timeout: RESOLVE_TIMEOUT_MS }
        );
        const accountName = data?.data?.account_name?.trim();
        return accountName ? { verified: true, accountName } : { verified: false, reason: 'not_found' };
    } catch (error) {
        const status = error.response?.status;
        // 400 = the provider couldn't match the account (in test mode only sandbox accounts match)
        return { verified: false, reason: status === 400 ? 'not_found' : 'unavailable' };
    }
};

/** Loose comparison of the name the customer typed with the bank's name. */
export const namesMatch = (typed, resolved) => {
    const words = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter((w) => w.length > 1);
    const a = new Set(words(typed));
    const b = words(resolved);
    return b.length > 0 && b.filter((w) => a.has(w)).length >= Math.min(2, b.length);
};
