import { stripe } from "../../../config/stripe.js";
import { notifyDevice } from "../../device/service.js";

export const handleStripeWebhook = async (rawBody: ArrayBuffer, sig: string) => {
  const textBody = Buffer.from(rawBody).toString();
  let event;
  try {
    event = stripe.webhooks.constructEvent(textBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return 'Webhook Error';
  }

  const session = event.data.object;
  const fcmToken = session.metadata?.fcmToken;

  if (event.type === 'checkout.session.completed') {
    if (fcmToken) {
      console.log("FOO", "pago success")
      await notifyDevice(fcmToken, 'Payment Confirmed', 'You can now deliver the photos.', 'paid', session.id);
    }
  } else if (event.type === 'checkout.session.async_payment_failed' || event.type === 'checkout.session.expired') {
    if (fcmToken) {
      console.log("FOO", "fallo")
      await notifyDevice(fcmToken, 'Payment Failed', 'Payment failed or expired.', 'failed', session.id);
    }
  }

  return 'Success';
};
