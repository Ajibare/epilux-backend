// services/scheduler.js
import cron from 'node-cron';
import { checkAndReassignMarketers } from '../controllers/orderController.js';

// Run every day at midnight
const setupScheduledTasks = () => {
    // Check and reassign orders that haven't been delivered within 7 days
    cron.schedule('0 0 * * *', async () => {
        console.log('Running scheduled task: checkAndReassignMarketers');
        try {
            const result = await checkAndReassignMarketers();
            console.log('Marketer reassignment completed:', result);
        } catch (error) {
            console.error('Error in marketer reassignment task:', error);
        }
    });

    console.log('Scheduled tasks have been set up');
};

export default setupScheduledTasks;