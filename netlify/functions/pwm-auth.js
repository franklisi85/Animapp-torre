// Verifica/imposta/cambia la password del Project Manager (ruolo limitato alle sole
// password dei progetti) lato server. Stessa identica logica di pm-auth.js
// (Amministratore Unico), ma su un percorso Firebase separato (pwmConfig/password) —
// le due credenziali sono completamente indipendenti l'una dall'altra.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const DB_URL = 'https://logistic-torreserena-default-rtdb.europe-west1.firebasedatabase.app';

function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function json(statusCode, obj) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
}

async function getAccessToken() {
    const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const now = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600
    }, sa.private_key, { algorithm: 'RS256' });

    const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion
        })
    });
    const data = await res.json();
    if (!data.access_token) throw new Error('Scambio token OAuth fallito: ' + JSON.stringify(data));
    return data.access_token;
}

async function dbGet(path) {
    const token = await getAccessToken();
    const res = await fetch(`${DB_URL}/${path}.json`, { headers: { Authorization: `Bearer ${token}` } });
    return res.json();
}

async function dbSet(path, value) {
    const token = await getAccessToken();
    await fetch(`${DB_URL}/${path}.json`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(value)
    });
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    let body;
    try { body = JSON.parse(event.body); } catch { return json(400, { ok: false, error: 'invalid_json' }); }
    const { action, password, newPassword, currentPassword } = body;

    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        return json(500, { ok: false, error: 'server_not_configured' });
    }

    try {
        const stored = await dbGet('pwmConfig/password');

        if (action === 'login') {
            if (!password || typeof password !== 'string') return json(400, { ok: false, error: 'missing_password' });
            if (!stored) {
                if (password.length < 8) return json(400, { ok: false, error: 'too_short' });
                await dbSet('pwmConfig/password', sha256(password));
                return json(200, { ok: true, bootstrapped: true });
            }
            return json(200, { ok: sha256(password) === stored, bootstrapped: false });
        }

        if (action === 'change') {
            if (!currentPassword || !newPassword) return json(400, { ok: false, error: 'missing_fields' });
            if (newPassword.length < 8) return json(400, { ok: false, error: 'too_short' });
            if (!stored || sha256(currentPassword) !== stored) return json(403, { ok: false, error: 'wrong_current' });
            await dbSet('pwmConfig/password', sha256(newPassword));
            return json(200, { ok: true });
        }

        return json(400, { ok: false, error: 'unknown_action' });
    } catch (e) {
        return json(500, { ok: false, error: e.message });
    }
};
