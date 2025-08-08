import { stripe } from '../../../config/stripe.js';
export const createCheckoutSession = async ({ line_items, success_url, cancel_url, metadata }) => {
    const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        line_items,
        success_url,
        cancel_url,
        metadata,
    });
    return session;
};
export const createPaymentIntent = async ({ amount, metadata }) => {
    const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        payment_method_types: ['card_present'],
        metadata
    });
    return paymentIntent;
};
