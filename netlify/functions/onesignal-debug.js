// Diagnostica temporanea (di nuovo): interroga la API utente MODERNA di OneSignal per un
// singolo external_id (email) passato esplicitamente, per verificare tag e stato reale delle
// sue subscription. Da rimuovere subito dopo l'uso.
exports.handler = async (event) => {
    const apiKey = process.env.ONESIGNAL_API_KEY;
    if (!apiKey) return { statusCode: 500, body: 'API key not configured' };

    const externalId = event.queryStringParameters?.email;
    if (!externalId) return { statusCode: 400, body: 'Missing email query param' };

    try {
        const res = await fetch(
            `https://api.onesignal.com/apps/9d5f60a7-b686-4cf5-98b6-e044f755263c/users/by/external_id/${encodeURIComponent(externalId)}`,
            { headers: { Authorization: `Key ${apiKey}` } }
        );
        const data = await res.json();
        return { statusCode: res.status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data, null, 2) };
    } catch (e) {
        return { statusCode: 500, body: e.message };
    }
};
