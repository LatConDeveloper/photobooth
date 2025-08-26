import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { getPhotoLinkChannel } from './image-upload-service.js';
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID; // optional (for SMS)
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN; // optional
const TWILIO_FROM = process.env.TWILIO_FROM; // phone number in E.164 format, required by Twilio
const EMAIL_FROM = process.env.AWS_SES_EMAIL || 'noreply@photoboot.app';
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
export async function sendDeliveryLinks(linkIdOrDeviceToken) {
    const photo_link = await getPhotoLinkChannel(linkIdOrDeviceToken);
    const uuid = photo_link.id;
    const baseUrl = process.env.PUBLIC_BASE_URL || 'http://localhost:3000';
    const downloadUrl = `${baseUrl}/delivery/download/${uuid}`;
    const method = (photo_link.method || '').toLowerCase();
    const destination = photo_link.destination;
    // Handle delivery methods explicitly
    if (method === 'print') {
        // No outbound message; just acknowledge and return the URL for logging/debug
        return { delivered_via: 'print', urls: [downloadUrl], skipped: true };
    }
    if (method === 'email') {
        if (!destination) {
            return { delivered_via: 'email', urls: [downloadUrl], skipped: true, reason: 'missing_destination' };
        }
        await sendEmailWithLinks(destination, [downloadUrl]);
        return { delivered_via: 'email', urls: [downloadUrl] };
    }
    if (method === 'sms') {
        if (!(TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_FROM) || !destination) {
            return { delivered_via: 'sms', urls: [downloadUrl], skipped: true, reason: 'twilio_not_configured_or_missing_destination' };
        }
        const twilio = (await import('twilio')).default(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
        const body = buildSmsBody([downloadUrl]);
        await twilio.messages.create({ from: TWILIO_FROM, to: destination, body });
        return { delivered_via: 'sms', urls: [downloadUrl] };
    }
    // Unknown or unsupported method → no-op, but return URL for logging
    return { delivered_via: method || null, urls: [downloadUrl], skipped: true, reason: 'unsupported_method' };
}
async function sendEmailWithLinks(to, urls) {
    const subject = 'Your photos are ready';
    const html = `
    <p>Hi! Your photos are ready to download.</p>
    <ul>
      ${urls.map(u => `<li><a href="${u}">Download photo</a></li>`).join('')}
    </ul>
    <p>These links expire in 1 hour. Please download and save your photos.</p>
  `;
    // Prefer SES if configured
    if (sesClient && SES_FROM) {
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
function buildSmsBody(urls) {
    const max = 2;
    const body = [`Your photos are ready!`];
    urls.slice(0, max).forEach((u, i) => body.push(`Link ${i + 1}: ${u}`));
    if (urls.length > max)
        body.push(`+${urls.length - max} more links (check your email).`);
    return body.join('\n');
}
