import { Hono } from 'hono';
import { handleStripeWebhook } from '../../domain/payment/events/stripe-webhookhandler.js';
import { WebhooksHelper } from 'square';
import { notifyDevice } from '../../domain/device/service.js';
export const webhookRoutes = new Hono();
webhookRoutes.post('/stripe', async (c) => {
    const rawBody = await c.req.arrayBuffer();
    const sig = c.req.header('stripe-signature') || '';
    const status = await handleStripeWebhook(rawBody, sig);
    return c.text(status);
});
// Square Webhook: verify signature & handle payments events
webhookRoutes.post('/square', async (c) => {
    const signature = c.req.header('x-square-signature') || '';
    const notificationUrl = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '') + '/webhook/square';
    const rawBody = await c.req.text();
    try {
        WebhooksHelper.verifySignature({
            requestBody: rawBody,
            signatureHeader: signature,
            signatureKey: process.env.SQUARE_WEBHOOK_SIGNATURE_KEY,
            notificationUrl,
        });
    }
    catch (e) {
        console.error('Invalid Square webhook signature', e);
        return c.text('Signature Error', 400);
    }
    try {
        const payload = JSON.parse(rawBody);
        console.log(`Square webhook: ${payload.type} - ${payload.event_id}`);
        if (payload.type === 'payment.created') {
            const payment = payload.data.object.payment;
            // Example: log core fields; you can persist to DB or notify device here
            if (payment.note && payment.note.startsWith('ExponentPushToken')) {
                try {
                    await notifyDevice(payment.note, 'Payment Confirmed', 'You can now deliver the photos.', 'paid', payment.id);
                }
                catch (error) {
                    console.error('Error sending push notification', error);
                }
            }
            // notifyDevice(...).catch(console.error);
        }
        else {
            console.log('Unhandled Square event:', payload.type);
        }
    }
    catch (err) {
        console.error('Square webhook handling error', err);
    }
    return c.text('OK');
});
