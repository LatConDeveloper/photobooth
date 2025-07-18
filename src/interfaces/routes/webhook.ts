import { Hono } from 'hono';
import { handleStripeWebhook } from '../../domain/payment/events/stripe-webhookhandler.js';

export const webhookRoutes = new Hono();

webhookRoutes.post('/', async (c) => {
  const rawBody = await c.req.arrayBuffer();
  const sig = c.req.header('stripe-signature') || '';
  const status = await handleStripeWebhook(rawBody, sig);
  return c.text(status);
});