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
export const createConnectionToken = async () => {
    const token = await stripe.terminal.connectionTokens.create();
    return token;
};
export const createPaymentIntent = async ({ amount, metadata, currency = 'usd', capture_method = 'automatic' }) => {
    const paymentIntent = await stripe.paymentIntents.create({
        amount,
        currency,
        capture_method,
        payment_method_types: ['card_present'],
        metadata
    });
    return paymentIntent;
};
