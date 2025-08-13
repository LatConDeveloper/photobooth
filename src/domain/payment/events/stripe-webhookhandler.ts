import { stripe } from "../../../config/stripe.js";
import { notifyDevice } from "../../device/service.js";
import { sendDeliveryLinks } from "../../media/services/send-service.js";

export const handleStripeWebhook = async (rawBody: ArrayBuffer, sig: string) => {
  const textBody = Buffer.from(rawBody).toString();
  let event;
  try {
    event = stripe.webhooks.constructEvent(textBody, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err) {
    console.error('Webhook signature verification failed.', err);
    return 'Webhook Error';
  }

  console.log(`Received event: ${event.id} - ${event.type}`);

  switch (event.type) {
    case 'checkout.session.completed':
    case 'checkout.session.async_payment_failed':
    case 'checkout.session.expired': {
      try {
        const session = event.data.object as any;
        const fcmToken = session.metadata?.fcmToken;
        if (fcmToken) {
          if (event.type === 'checkout.session.completed') {
            notifyDevice(fcmToken, 'Payment Confirmed', 'You can now deliver the photos.', 'paid', session.id)
              .catch(err => console.error('Error sending success notification:', err));
            // Fire-and-forget delivery links as well
            sendDeliveryLinks(fcmToken)
              .catch(err => console.error('Error sending delivery links:', err));
          } else {
            notifyDevice(fcmToken, 'Payment Failed', 'Payment failed or expired.', 'failed', session.id)
              .catch(err => console.error('Error sending failure notification:', err));
          }
        }
      } catch (err) {
        console.error('Error handling checkout.session.* event:', err);
      }
      break;
    }

    case 'payment_intent.succeeded':
    case 'payment_intent.payment_failed': {
      try {
        const intent = event.data.object as any;
        const fcmToken = intent.metadata?.fcmToken;
        if (fcmToken) {
          if (event.type === 'payment_intent.succeeded') {
            notifyDevice(fcmToken, 'Payment Confirmed', 'You can now deliver the photos.', 'paid', intent.id)
              .catch(err => console.error('Error sending success notification:', err));
          } else {
            notifyDevice(fcmToken, 'Payment Failed', 'Tap to Pay was not successful.', 'failed', intent.id)
              .catch(err => console.error('Error sending failure notification:', err));
          }
        }
      } catch (err) {
        console.error('Error handling payment_intent.* event:', err);
      }
      break;
    }

    default:
      console.log(`Unhandled event type ${event.type}`);
  }

  return 'Success';
};
