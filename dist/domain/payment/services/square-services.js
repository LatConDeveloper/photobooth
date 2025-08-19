import { SquareClient, SquareEnvironment } from 'square';
// Resolve Square environment from env var
const resolveSquareEnv = () => {
    const env = (process.env.SQUARE_ENV || 'sandbox').toLowerCase();
    return env === 'production' ? SquareEnvironment.Production : SquareEnvironment.Sandbox;
};
// Shared Square client (centralized account model)
export const squareClient = new SquareClient({
    token: process.env.SQUARE_ACCESS_TOKEN,
    environment: resolveSquareEnv(),
});
/**
 * For the Mobile Payments SDK (Tap to Pay), we authorize the device with an
 * OAuth access token and a location ID. In a centralized model, we issue the
 * app our own access token + locationId from the backend.
 */
export const getSquareAuthorization = async () => {
    const accessToken = process.env.SQUARE_ACCESS_TOKEN;
    const locationId = process.env.SQUARE_LOCATION_ID;
    if (!accessToken)
        throw new Error('SQUARE_ACCESS_TOKEN is not set');
    if (!locationId)
        throw new Error('SQUARE_LOCATION_ID is not set');
    // No API call required: Mobile Payments SDK authorizes with access token + locationId
    return { accessToken, locationId };
};
