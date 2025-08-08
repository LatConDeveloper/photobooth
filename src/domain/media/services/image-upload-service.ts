import { createClient } from '@supabase/supabase-js';
import { ImageRepository } from '../repositories/image-repository.js';
import type { PostgrestSingleResponse } from '@supabase/supabase-js';
import JSZip from 'jszip';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_KEY!; // service role is required for server-side uploads
const SUPABASE_BUCKET = process.env.SUPABASE_BUCKET || 'photos';

const EMAIL_FROM = process.env.AWS_SES_EMAIL || 'noreply@photoboot.app';

const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID; // optional (for SMS)
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN; // optional
const TWILIO_FROM = process.env.TWILIO_FROM; // phone number in E.164 format, required by Twilio

const AWS_REGION = process.env.AWS_REGION;
const AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID;
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY;
const SES_FROM = EMAIL_FROM;

const sesClient = (AWS_REGION && AWS_ACCESS_KEY_ID && AWS_SECRET_ACCESS_KEY)
  ? new SESv2Client({
      region: AWS_REGION,
      credentials: {
        accessKeyId: AWS_ACCESS_KEY_ID,
        secretAccessKey: AWS_SECRET_ACCESS_KEY
      }
    })
  : undefined;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export type UploadImageInput = {
  deviceToken: string;
  images: Array<{
    filename?: string;        // optional, we'll generate one if not present
    mimeType?: string;        // e.g., 'image/jpeg'
    base64?: string;          // base64 **without** data URL prefix
    url?: string;             // remote URL to fetch image
  }>;
};

export type DeliveryChannel = {
  email?: { to: string };
  sms?: { to: string };
};

export type UploadedPhotoRecord = {
  device_token: string;
  storage_path: string;
  created_at: string;
};

async function bufferFromInput(item: UploadImageInput['images'][number]): Promise<{ buffer: Buffer; mime: string }>{
  if (item.base64) {
    const mime = item.mimeType || 'image/jpeg';
    return { buffer: Buffer.from(item.base64, 'base64'), mime };
  }
  if (item.url) {
    const res = await fetch(item.url);
    if (!res.ok) throw new Error(`Failed to fetch image URL: ${item.url}`);
    const arrayBuf = await res.arrayBuffer();
    const mime = item.mimeType || (res.headers.get('content-type') ?? 'application/octet-stream');
    return { buffer: Buffer.from(arrayBuf), mime };
  }
  throw new Error('Invalid image item: provide base64 or url');
}

function makeObjectKey(deviceToken: string, filename?: string, mime?: string){
  const ext = filename?.split('.').pop() || (mime?.includes('png') ? 'png' : mime?.includes('webp') ? 'webp' : 'jpg');
  const safeName = filename?.replace(/[^a-zA-Z0-9-_\.]/g, '_');
  const ts = Date.now();
  return `${deviceToken}/${ts}_${Math.random().toString(36).slice(2)}.${ext}`.replace('..', '.');
}

export async function uploadImagesAndRegister(deviceToken: string, images: UploadImageInput['images']){
  if (!deviceToken) throw new Error('deviceToken is required');
  if (!images?.length) return { uploaded: [], errors: ['No images provided'] };

  const repo = new ImageRepository(supabase);
  const uploaded: UploadedPhotoRecord[] = [];
  const errors: string[] = [];

  const link = await repo.createLink(deviceToken);

  for (const img of images){
    try {
      const { buffer, mime } = await bufferFromInput(img);
      const objectKey = makeObjectKey(deviceToken, img.filename, mime);

      const { data: upRes, error: upErr } = await supabase.storage
        .from(SUPABASE_BUCKET)
        .upload(objectKey, buffer, { contentType: mime, upsert: false });

      if (upErr) throw upErr;

      const record = await repo.insertWithLink(link.id, upRes.path);
      uploaded.push(record);
    } catch (e: any){
      errors.push(e.message || String(e));
    }
  }

  return { linkId: link.id, uploaded, errors };
}

export async function getSignedDownloadUrls(linkIdOrDeviceToken: string, expiresInSeconds = 60 * 60){
  const repo = new ImageRepository(supabase);
  let paths: string[] = [];

  try {
    paths = await repo.getPathsByLinkId(linkIdOrDeviceToken);
  } catch {
    paths = await repo.getPathsByDeviceToken(linkIdOrDeviceToken);
  }
  if (!paths.length) return [];

  const { data, error } = await supabase
    .storage
    .from(SUPABASE_BUCKET)
    .createSignedUrls(paths, expiresInSeconds);

  if (error) throw error;
  return data?.map(d => d.signedUrl) || [];
}

export async function createZipBundleSignedUrl(linkIdOrDeviceToken: string, expiresInSeconds = 60 * 60){
  const repo = new ImageRepository(supabase);
  let paths: string[] = [];

  try {
    paths = await repo.getPathsByLinkId(linkIdOrDeviceToken);
  } catch {
    paths = await repo.getPathsByDeviceToken(linkIdOrDeviceToken);
  }
  if (!paths.length) throw new Error('No images found for provided identifier');

  const zip = new JSZip();
  for (const p of paths){
    const { data, error } = await supabase.storage.from(SUPABASE_BUCKET).download(p);
    if (error) throw error;
    const arrBuf = await data.arrayBuffer();
    const name = p.split('/').slice(-1)[0];
    zip.file(name, arrBuf);
  }

  const zipBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });

  const zipKey = `bundles/${linkIdOrDeviceToken}/${Date.now()}.zip`;
  const { data: upData, error: upErr } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .upload(zipKey, zipBuf, { contentType: 'application/zip', upsert: false });
  if (upErr) throw upErr;

  const { data: signed, error: signErr } = await supabase.storage
    .from(SUPABASE_BUCKET)
    .createSignedUrl(upData.path, expiresInSeconds);
  if (signErr) throw signErr;

  return signed.signedUrl as string;
}


export async function sendDeliveryLinks(channels: DeliveryChannel, linkIdOrDeviceToken: string){
  const urls = await getSignedDownloadUrls(linkIdOrDeviceToken);
  if (!urls.length) throw new Error('No images found for provided identifier');

  const tasks: Promise<any>[] = [];

  if (channels.email){
    tasks.push(sendEmailWithLinks(channels.email.to, urls));
  }

  if (channels.sms && TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM){
    const twilio = (await import('twilio')).default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    const body = buildSmsBody(urls);
    tasks.push(twilio.messages.create({ from: TWILIO_FROM, to: channels.sms.to, body }));
  }

  await Promise.all(tasks);
  return { delivered_via: Object.keys(channels), urls };
}

async function sendEmailWithLinks(to: string, urls: string[]){
  const subject = 'Your photos are ready';
  const html = `
    <p>Hi! Your photos are ready to download.</p>
    <ul>
      ${urls.map(u => `<li><a href="${u}">Download photo</a></li>`).join('')}
    </ul>
    <p>These links expire in 1 hour. Please download and save your photos.</p>
  `;

  // Prefer SES if configured
  if (sesClient && SES_FROM){
    const cmd = new SendEmailCommand({
      FromEmailAddress: SES_FROM,
      Destination: { ToAddresses: [to] },
      Content: {
        Simple: {
          Subject: { Data: subject },
          Body: { Html: { Data: html } }
        }
      }
    });
    await sesClient.send(cmd);
    return;
  }

  // If neither provider configured
  throw new Error('No email provider configured: set AWS_REGION & SES_FROM for SES or SENDGRID_API_KEY for SendGrid');
}

function buildSmsBody(urls: string[]){
  const max = 2; 
  const body = [`Your photos are ready!`];
  urls.slice(0, max).forEach((u, i) => body.push(`Link ${i + 1}: ${u}`));
  if (urls.length > max) body.push(`+${urls.length - max} more links (check your email).`);
  return body.join('\n');
}