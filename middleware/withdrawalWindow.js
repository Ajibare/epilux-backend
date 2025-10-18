// middleware/withdrawalWindow.js
import { isWithdrawalWindowOpen, getNextWindowInfo } from '../utils/withdrawalWindow.js';

export const checkWithdrawalWindow = (req, res, next) => {
    if (!isWithdrawalWindowOpen()) {
        const { nextWindowStart, nextWindowEnd } = getNextWindowInfo();
        return res.status(403).json({
            success: false,
            message: 'Withdrawals are only allowed between the 26th and 30th of each month.',
            nextWindow: {
                start: nextWindowStart,
                end: nextWindowEnd
            }
        });
    }
    next();
};