import { Hono } from 'hono';
import { 
  uploadImagesAndRegister,
  getSignedDownloadUrls,
  createZipBundleSignedUrl,
  sendDeliveryLinks,
} from '../../domain/media/services/image-upload-service.js';

export const deliveryRoutes = new Hono();

// POST /images
// Body: { deviceToken: string, images: [...], mode?: 'links'|'zip', expiresIn?: number, delivery?: { email?: { to: string }, sms?: { to: string } } }
// Returns: { linkId, urls? | zipUrl?, delivered_via? }

deliveryRoutes.post('/images', async (c) => {
  const contentType = c.req.header('content-type') || '';

  let deviceToken: string;
  let images: Array<{ filename?: string; mimeType?: string; base64?: string }> = [];
  let mode: 'links' | 'zip' = 'links';
  let expiresIn = 3600;
  let delivery: any;

  if (contentType.includes('multipart/form-data')) {
    const form = await c.req.parseBody();
    deviceToken = form.deviceToken as string;
    mode = (form.mode as 'links' | 'zip') || 'links';
    expiresIn = form.expiresIn ? Number(form.expiresIn) : 3600;
    if (form.delivery) {
      try { delivery = JSON.parse(form.delivery as string); } catch { delivery = undefined; }
    }

    const rawFiles = (form['images[]'] ?? form.images) as any;
    const files = Array.isArray(rawFiles) ? rawFiles : rawFiles ? [rawFiles] : [];
    images = await Promise.all(files.map(async (file: any) => {
      const base64 = Buffer.from(await file.arrayBuffer()).toString('base64');
      return { filename: file.filename, mimeType: file.type, base64 };
    }));
  } else {
    const body = await c.req.json();
    deviceToken = body.deviceToken;
    images = body.images || [];
    mode = body.mode || 'links';
    expiresIn = body.expiresIn || 3600;
    delivery = body.delivery;
  }

  if (!deviceToken || images.length === 0) {
    return c.json({ error: 'deviceToken and images are required' }, 400);
  }

  const { linkId, uploaded, errors } = await uploadImagesAndRegister(deviceToken, images);

  let response: any = { linkId, uploaded, errors };

  if (mode === 'zip') {
    const zipUrl = await createZipBundleSignedUrl(linkId, expiresIn);
    response.zipUrl = zipUrl;
    if (delivery) {
      const sent = await sendDeliveryLinks(delivery, linkId); // send zip link via email/SMS using same helper
      response.delivered_via = sent.delivered_via;
    }
  } else {
    const urls = await getSignedDownloadUrls(linkId, expiresIn);
    response.urls = urls;
    if (delivery) {
      const sent = await sendDeliveryLinks(delivery, linkId);
      response.delivered_via = sent.delivered_via;
    }
  }

  return c.json(response);
});

// GET /images/:linkId?mode=links|zip&expiresIn=3600
// Returns signed URLs or a signed ZIP url for a given linkId

deliveryRoutes.get('/images/:linkId', async (c) => {
  const linkId = c.req.param('linkId');
  const mode = (c.req.query('mode') || 'links') as 'links'|'zip';
  const expiresIn = Number(c.req.query('expiresIn') || 3600);

  if (!linkId) return c.json({ error: 'linkId is required' }, 400);

  if (mode === 'zip') {
    const zipUrl = await createZipBundleSignedUrl(linkId, expiresIn);
    return c.json({ linkId, zipUrl, expiresIn });
  }

  const urls = await getSignedDownloadUrls(linkId, expiresIn);
  return c.json({ linkId, urls, expiresIn });
});
