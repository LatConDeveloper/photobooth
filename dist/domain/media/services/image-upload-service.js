import { createClient } from '@supabase/supabase-js';
import { ImageRepository } from '../repositories/image-repository.js';
import JSZip from 'jszip';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY; // service role is required for server-side uploads
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'photos';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
async function bufferFromInput(item) {
    if (item.base64) {
        const mime = item.mimeType || 'image/jpeg';
        return { buffer: Buffer.from(item.base64, 'base64'), mime };
    }
    if (item.url) {
        const res = await fetch(item.url);
        if (!res.ok)
            throw new Error(`Failed to fetch image URL: ${item.url}`);
        const arrayBuf = await res.arrayBuffer();
        const mime = item.mimeType || (res.headers.get('content-type') ?? 'application/octet-stream');
        return { buffer: Buffer.from(arrayBuf), mime };
    }
    throw new Error('Invalid image item: provide base64 or url');
}
function makeObjectKey(deviceToken, filename, mime) {
    // Extract content inside square brackets, e.g., ExponentPushToken[ayMvP0Dd-yvZtM6jpe70EP]
    let folder;
    const match = deviceToken.match(/\[(.*?)\]/);
    if (match && match[1]) {
        folder = match[1];
    }
    else {
        // fallback: sanitize deviceToken for folder name
        folder = deviceToken.replace(/[^a-zA-Z0-9-_]/g, '_');
    }
    const ext = filename?.split('.').pop() || (mime?.includes('png') ? 'png' : mime?.includes('webp') ? 'webp' : 'jpg');
    const safeName = filename?.replace(/[^a-zA-Z0-9-_\.]/g, '_');
    const ts = Date.now();
    // Construct the object key with folder, timestamp, random string, and extension
    return `${folder}/${ts}_${Math.random().toString(36).slice(2)}.${ext}`.replace('..', '.');
}
export async function getPhotoLinkChannel(token) {
    const repo = new ImageRepository(supabase);
    const photo_link = await repo.getPhotoLinkByDeviceToken(token);
    return photo_link;
}
export async function uploadImagesAndRegister(deviceToken, method, destination, images) {
    if (!deviceToken)
        throw new Error('deviceToken is required');
    if (!images?.length)
        return { uploaded: [], errors: ['No images provided'] };
    const repo = new ImageRepository(supabase);
    const uploaded = [];
    const errors = [];
    const link = await repo.createLink(deviceToken, method, destination);
    for (const img of images) {
        try {
            const { buffer, mime } = await bufferFromInput(img);
            if (!buffer || buffer.length === 0) {
                throw new Error('Empty image buffer');
            }
            const objectKey = makeObjectKey(deviceToken, img.filename, mime);
            const { data: upRes, error: upErr } = await supabase.storage
                .from(SUPABASE_BUCKET)
                .upload(objectKey, buffer, { contentType: mime || 'application/octet-stream', upsert: false });
            if (upErr) {
                // Try to unwrap the underlying Response to expose real status/body
                const resp = upErr.originalError;
                let bodyText = '';
                try {
                    bodyText = resp ? await resp.text() : '';
                }
                catch { }
                console.error('Supabase Storage upload failed', {
                    objectKey,
                    mime,
                    size: buffer.length,
                    status: resp?.status,
                    statusText: resp?.statusText,
                    message: upErr.message,
                    body: bodyText,
                });
                const code = resp?.status;
                const detailed = code
                    ? `Upload failed (status ${code} ${resp?.statusText || ''}): ${upErr.message} ${bodyText}`.trim()
                    : `Upload failed: ${upErr.message} ${bodyText}`.trim();
                throw new Error(detailed);
            }
            const record = await repo.insertWithLink(link.id, upRes.path);
            uploaded.push(record);
        }
        catch (e) {
            console.error('uploadImagesAndRegister: image processing error', e);
            errors.push(e?.message || String(e));
        }
    }
    return { linkId: link.id, uploaded, errors };
}
export async function getSignedDownloadUrls(linkIdOrDeviceToken, expiresInSeconds = 60 * 60) {
    const repo = new ImageRepository(supabase);
    let paths = [];
    try {
        paths = await repo.getPathsByLinkId(linkIdOrDeviceToken);
    }
    catch {
        paths = await repo.getPathsByDeviceToken(linkIdOrDeviceToken);
    }
    if (!paths.length)
        return [];
    const { data, error } = await supabase
        .storage
        .from(SUPABASE_BUCKET)
        .createSignedUrls(paths, expiresInSeconds);
    if (error)
        throw error;
    return data?.map(d => d.signedUrl) || [];
}
export async function createZipBundleSignedUrl(linkIdOrDeviceToken, expiresInSeconds = 60 * 60) {
    const repo = new ImageRepository(supabase);
    let paths = [];
    try {
        paths = await repo.getPathsByLinkId(linkIdOrDeviceToken);
    }
    catch {
        paths = await repo.getPathsByDeviceToken(linkIdOrDeviceToken);
    }
    if (!paths.length)
        throw new Error('No images found for provided identifier');
    const zip = new JSZip();
    for (const p of paths) {
        const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(p);
        if (error)
            throw error;
        const arrBuf = await data.arrayBuffer();
        const name = p.split('/').slice(-1)[0];
        zip.file(name, arrBuf);
    }
    const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const zipKey = `bundles/${linkIdOrDeviceToken}/${Date.now()}.zip`;
    const { data: upData, error: upErr } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(zipKey, zipBuf, { contentType: 'application/zip', upsert: false });
    if (upErr)
        throw upErr;
    const { data: signed, error: signErr } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .createSignedUrl(upData.path, expiresInSeconds);
    if (signErr)
        throw signErr;
    return signed.signedUrl;
}
