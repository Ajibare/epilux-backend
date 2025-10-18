// utils/withdrawalWindow.js
export const isWithdrawalWindowOpen = () => {
    const now = new Date();
    const currentDay = now.getDate();
    return currentDay >= 26 && currentDay <= 30;
};

export const getNextWindowInfo = () => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    
    return {
        nextWindowStart: new Date(currentYear, currentMonth, 26),
        nextWindowEnd: new Date(currentYear, currentMonth, 30, 23, 59, 59),
        isCurrentWindowOpen: isWithdrawalWindowOpen()
    };
};