import { Hono } from 'hono';
import { createCheckoutSession, createPaymentIntent } from '../../domain/payment/services/stripe-services.js';
import { createZipBundleSignedUrl, uploadImagesAndRegister } from '../../domain/media/services/image-upload-service.js';

export const checkoutRoutes = new Hono();

checkoutRoutes.post('/create-checkout-session', async (c) => {
  try {
    let deviceToken: string;
    let images: Array<{ filename?: string; mimeType?: string; base64?: string }> = [];
    let mode: 'links' | 'zip' = 'links';
    let expiresIn = 3600;
    let line_items: any[] | undefined;

    const form = await c.req.parseBody();
    deviceToken = form.deviceToken as string;
    mode = 'zip';
    expiresIn = form.expiresIn ? Number(form.expiresIn) : 3600;

    const rawFiles = (form['images[]'] ?? form.images) as any;
    const files = Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [];
    images = await Promise.all(files.map(async (file: any) => {
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      return { filename: file.filename, mimeType: file.type, base64 };
    }));

    if (!deviceToken || images.length === 0) {
      return c.json({ error: 'deviceToken and images are required' }, 400);
    }

    // Save images and delivery preferences (method & destination)
    await uploadImagesAndRegister(deviceToken, form.method as any, form.destination as string , images);

    // --- Parse line_items from form-data ---
    // Accept either a single field 'line_items' with a JSON array/object,
    // or multiple 'line_items[]' entries where each is a JSON object string
    const rawLineItems = (form['line_items[]'] ?? form.line_items) as any;
    if (rawLineItems) {
      if (Array.isArray(rawLineItems)) {
        try {
          line_items = rawLineItems.map((s: string) => (typeof s === 'string' ? JSON.parse(s) : s));
        } catch (e) {
          return c.json({ error: 'Invalid line_items[] JSON entries', detail: String(e) }, 400);
        }
      } else if (typeof rawLineItems === 'string') {
        try {
          const parsed = JSON.parse(rawLineItems);
          line_items = Array.isArray(parsed) ? parsed : [parsed];
        } catch (e) {
          return c.json({ error: 'Invalid line_items JSON (must be a JSON array or object)', detail: String(e) }, 400);
        }
      } else {
        line_items = rawLineItems as any[];
      }
    }

    if (!Array.isArray(line_items) || line_items.length === 0) {
      return c.json({ error: 'The line_items parameter is required and must be a non-empty array for payment mode.' }, 400);
    }

    console.log("form", form.deviceToken, deviceToken)
    const session = await createCheckoutSession({
      mode: 'payment',
      success_url: 'https://example.com/success.html',
      cancel_url: 'https://example.com/cancel.html',
      currency: 'usd',
      line_items,
      metadata: {
        fcmToken: form.deviceToken
      }
    });

    return c.json({ url: session.url });
  } catch (err: any) {
    console.error('create-checkout-session failed:', err);
    return c.json({ error: 'Failed to create checkout session', detail: String(err?.message || err) }, 500);
  }
});

checkoutRoutes.post('/create-payment-intent', async (c) => {
  const body = await c.req.json();
  const { expoPushToken, amount } = body;

  const paymentIntent = await createPaymentIntent({
    amount,
    metadata: {
      fcmToken: expoPushToken
    }
  });

  return c.json({ client_secret: paymentIntent.client_secret });
});
