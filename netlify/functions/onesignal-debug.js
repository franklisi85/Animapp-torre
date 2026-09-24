// Diagnostica temporanea: interroga la API "utente" MODERNA di OneSignal (quella usata
// davvero dall'SDK v16/User Model in uso nell'app) per un singolo external_id (email),
// mostrando tutte le sue subscription (push/email/sms) con lo stato reale attuale.
// La vecchia API /api/v1/players è legacy e può mostrare dati non allineati col nuovo modello.
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
