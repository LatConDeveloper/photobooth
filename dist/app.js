import { Hono } from 'hono';
import { webhookRoutes } from './interfaces/routes/webhook.js';
import { checkoutRoutes } from './interfaces/routes/checkout.js';
const app = new Hono();
app.route('/checkout', checkoutRoutes);
app.route('/webhook', webhookRoutes);
export default app;
