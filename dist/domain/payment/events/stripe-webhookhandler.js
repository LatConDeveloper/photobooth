import { stripe } from "../../../config/stripe.js";
import { notifyDevice } from "../../device/service.js";
import { sendDeliveryLinks } from "../../media/services/send-service.js";
export const handleStripeWebhook = async (rawBody, sig) => {
    const textBody = Buffer.from(rawBody).toString();
    let event;
    try {
        event = stripe.webhooks.constructEvent(textBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
    }
    catch (err) {
        console.error('Webhook signature verification failed.', err);
        return 'Webhook Error';
    }
    const session = event.data.object;
    const fcmToken = session.metadata?.fcmToken;
    if (event.type === 'checkout.session.completed') {
        if (fcmToken) {
            await notifyDevice(fcmToken, 'Payment Confirmed', 'You can now deliver the photos.', 'paid', session.id);
        }
        // callback for send link via sms or email
        await sendDeliveryLinks(fcmToken);
    }
    else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
        if (fcmToken) {
            await notifyDevice(fcmToken, 'Payment Failed', 'Payment failed or expired.', 'failed', session.id);
        }
    }
    return 'Success';
};
