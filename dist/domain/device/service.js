export const notifyDevice = async (expoPushToken, title, body, status, sessionId) => {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            to: expoPushToken,
            sound: 'default',
            title: title,
            body: body,
            data: { status, sessionId },
        }),
    });
    if (!response.ok) {
        const error = await response.text();
        console.error('Expo push notification error:', error);
    }
};
