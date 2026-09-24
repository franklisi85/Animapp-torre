// Diagnostica temporanea: elenca i player OneSignal (fino a 300) raggruppati per il tag
// "project", con conteggio di quanti risultano effettivamente sottoscritti (notification_types
// > 0). Serve solo a capire perché "All included players are not subscribed" — non espone
// dati sensibili (nessuna email/nome), solo id parziale, tag project e stato di sottoscrizione.
exports.handler = async () => {
    const apiKey = process.env.ONESIGNAL_API_KEY;
    if (!apiKey) return { statusCode: 500, body: 'API key not configured' };

    try {
        const res = await fetch('https://onesignal.com/api/v1/players?app_id=9d5f60a7-b686-4cf5-98b6-e044f755263c&limit=300', {
            headers: { Authorization: `Key ${apiKey}` }
        });
        const data = await res.json();
        if (!data.players) return { statusCode: 500, body: JSON.stringify(data) };

        const byProject = {};
        for (const p of data.players) {
            const project = (p.tags && p.tags.project) || '(nessun tag project)';
            if (!byProject[project]) byProject[project] = { total: 0, subscribed: 0, players: [] };
            byProject[project].total++;
            const isSubscribed = p.notification_types > 0;
            if (isSubscribed) byProject[project].subscribed++;
            byProject[project].players.push({
                id: p.id ? p.id.slice(0, 8) + '…' : null,
                notification_types: p.notification_types,
                last_active: p.last_active,
                tags: p.tags
            });
        }

        return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ totalPlayers: data.total_count, byProject }, null, 2) };
    } catch (e) {
        return { statusCode: 500, body: e.message };
    }
};
