import { Hono } from 'hono';
import { createCheckoutSession } from '../../domain/payment/services/stripe-services.js';

export const checkoutRoutes = new Hono();

checkoutRoutes.post('/create-checkout-session', async (c) => {
  const body = await c.req.json();
  const { expoPushToken, line_items } = body;
  const session = await createCheckoutSession({
    mode: 'payment',
    success_url: 'https://example.com/success.html',
    cancel_url: 'https://example.com/cancel.html',
    currency: 'usd',
    line_items,
    metadata: {
      fcmToken: expoPushToken
    }
  });
  return c.json({ url: session.url });
});
