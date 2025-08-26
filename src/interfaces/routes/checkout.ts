import { Hono } from 'hono';
import { createCheckoutSession, createPaymentIntent, createConnectionToken } from '../../domain/payment/services/stripe-services.js';
import { createZipBundleSignedUrl, uploadImagesAndRegister } from '../../domain/media/services/image-upload-service.js';
import { getSquareAuthorization } from '../../domain/payment/services/square-services.js';

export const checkoutRoutes = new Hono();

checkoutRoutes.post('/connection-token', async (c) => {
  try {
    const token = await createConnectionToken();
    return c.json({ secret: token.secret });
  } catch (err: any) {
    console.error('connection-token failed:', err);
    return c.json({ error: 'Failed to create connection token', detail: String(err?.message || err) }, 500);
  }
});

checkoutRoutes.post('/square/mobile-auth-code', async (c) => {
  try {
    const { accessToken, locationId } = await getSquareAuthorization();
    return c.json({ accessToken, locationId });
  } catch (err: any) {
    console.error('square/mobile-auth-code failed:', err);
    return c.json({ error: 'Failed to create Square mobile authorization code', detail: String(err?.message || err) }, 500);
  }
});

checkoutRoutes.post('/create-checkout-session', async (c) => {
  try {
    let deviceToken: string | undefined;
    let line_items: any[] | undefined;
    let success_url = 'https://example.com/success.html';
    let cancel_url = 'https://example.com/cancel.html';
    let currency = 'usd';

    const body = await c.req.json();
    deviceToken = body.deviceToken || body.expoPushToken;
    success_url = body.success_url || success_url;
    cancel_url = body.cancel_url || cancel_url;
    currency = body.currency || currency;
    if (body.line_items) {
      if (Array.isArray(body.line_items)) {
        line_items = body.line_items;
      } else if (typeof body.line_items === 'object') {
        line_items = [body.line_items];
      } else if (typeof body.line_items === 'string') {
        try { const parsed = JSON.parse(body.line_items); line_items = Array.isArray(parsed) ? parsed : [parsed]; } catch (e) {
          return c.json({ error: 'Invalid line_items JSON string', detail: String(e) }, 400);
        }
      }
    }

    if (!Array.isArray(line_items) || line_items.length === 0) {
      return c.json({ error: 'The line_items parameter is required and must be a non-empty array for payment mode.' }, 400);
    }

    const session = await createCheckoutSession({
      mode: 'payment',
      success_url,
      cancel_url,
      currency,
      line_items,
      metadata: deviceToken ? { fcmToken: deviceToken } : undefined
    });

    return c.json({ url: session.url });
  } catch (err: any) {
    console.error('create-checkout-session failed:', err);
    return c.json({ error: 'Failed to create checkout session', detail: String(err?.message || err) }, 500);
  }
});

checkoutRoutes.post('/create-payment-intent', async (c) => {
  try {
    const body = await c.req.json();
    const { expoPushToken, amount, currency = 'usd', capture_method } = body || {};

    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return c.json({ error: 'amount must be a positive number (in the smallest currency unit)' }, 400);
    }

    const paymentIntent = await createPaymentIntent({
      amount: parsedAmount,
      currency,
      capture_method,
      metadata: {
        fcmToken: expoPushToken
      }
    });

    return c.json({ client_secret: paymentIntent.client_secret, id: paymentIntent.id, currency: paymentIntent.currency });
  } catch (err: any) {
    console.error('create-payment-intent failed:', err);
    return c.json({ error: 'Failed to create payment intent', detail: String(err?.message || err) }, 500);
  }
});

checkoutRoutes.post('/images', async (c) => {
  try {
    const contentType = c.req.header('content-type') || '';
    let deviceToken: string;
    let method: 'email'|'sms'|'print'|undefined;
    let destination: string|undefined;
    let expiresAt: string|undefined;
    let images: Array<{ filename?: string; mimeType?: string; base64?: string }> = [];

    if (contentType.includes('multipart/form-data')) {
      const form = await c.req.parseBody();
      deviceToken = form.deviceToken as string;
      method = form.method as any;
      destination = form.destination as string;
      expiresAt = form.expiresAt as string;
      const rawFiles = (form['images[]'] ?? form.images) as any;
      const files = Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [];
      images = await Promise.all(files.map(async (file: any) => {
        const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
        return { filename: file.filename, mimeType: file.type, base64 };
      }));
    } else {
      const body = await c.req.json();
      deviceToken = body.deviceToken;
      method = body.method;
      destination = body.destination;
      expiresAt = body.expiresAt;
      images = body.images || [];
    }

    if (!deviceToken || images.length === 0) {
      return c.json({ error: 'deviceToken and images are required' }, 400);
    }

    const { linkId, uploaded, errors } = await uploadImagesAndRegister(deviceToken, method, destination, images);
    return c.json({ linkId, uploaded, errors });
  } catch (err: any) {
    console.error('POST /checkout/images failed:', err);
    return c.json({ error: 'Upload failed', detail: String(err?.message || err) }, 500);
  }
});
