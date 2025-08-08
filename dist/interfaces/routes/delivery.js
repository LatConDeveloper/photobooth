import { Hono } from 'hono';
import { createClient } from '@supabase/supabase-js';
import { sendDeliveryLinks } from '../../domain/media/services/send-service.js';
export const deliveryRoutes = new Hono();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY;
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'photos';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
deliveryRoutes.get('/download/:linkId', async (c) => {
    try {
        const linkId = c.req.param('linkId');
        await sendDeliveryLinks(linkId);
        /*if (!linkId) return c.text('linkId required', 400);
    
        const repo = new ImageRepository(supabase);
        const paths = await repo.getPathsByLinkId(linkId);
        if (!paths.length) return c.text('No images for link', 404);
    
        const zip = new JSZip();
        for (const p of paths) {
          const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(p);
          if (error) throw error;
          const buf = Buffer.from(await data.arrayBuffer());
          const name = p.split('/').slice(-1)[0];
          zip.file(name, buf);
        }
    
        const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
        c.header('Content-Type', 'application/zip');
        c.header('Content-Disposition', `attachment; filename="photos_${linkId}.zip"`);
        return new Response(zipBuf);*/
    }
    catch (err) {
        console.error('GET /download/:linkId failed', err);
        return c.json({ error: 'Failed to build ZIP', detail: String(err?.message || err) }, 500);
    }
});
