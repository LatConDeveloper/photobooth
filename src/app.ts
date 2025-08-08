import { Hono } from 'hono';
import { webhookRoutes } from './interfaces/routes/webhook.js';
import { checkoutRoutes } from './interfaces/routes/checkout.js';
import { deliveryRoutes } from './interfaces/routes/delivery.js';


const app = new Hono();

app.route('/checkout', checkoutRoutes);
app.route('/webhook', webhookRoutes);
app.route('/delivery', deliveryRoutes)

export default app;