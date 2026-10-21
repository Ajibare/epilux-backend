// services/scheduler.js
// Note: on Vercel serverless there is no long-running process, so these cron
// jobs only run where the server stays up. Admins can also assign orders from
// the dashboard (PUT /api/admin/orders/:id/assign).
import cron from 'node-cron';
import MarketerService from './marketerService.js';

const setupScheduledTasks = () => {
    // Every hour: give paid orders that are still waiting a marketer
    cron.schedule('15 * * * *', async () => {
        try {
            const result = await MarketerService.assignUnassignedPaidOrders();
            if (result.assigned) console.log('Assigned waiting orders:', result);
        } catch (error) {
            console.error('Error assigning waiting orders:', error);
        }
    });

    // Every day at midnight: reassign deliveries not completed within 7 days
    cron.schedule('0 0 * * *', async () => {
        console.log('Running scheduled task: reassignExpiredOrders');
        try {
            const result = await MarketerService.reassignExpiredOrders();
            console.log('Marketer reassignment completed:', result);
        } catch (error) {
            console.error('Error in marketer reassignment task:', error);
        }
    });

    console.log('Scheduled tasks have been set up');
};

export default setupScheduledTasks;
