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

async function dbDelete(path) {
    const token = await getAccessToken();
    await fetch(`${DB_URL}/${path}.json`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

// Cerca in pmUsers/ l'utente con questa email (una sola query server-side, con le credenziali
// del service account: bypassa le regole del DB, che al client negano la lettura di pmUserSecrets).
async function findPmUserByEmail(email) {
    const token = await getAccessToken();
    const url = `${DB_URL}/pmUsers.json?orderBy=${encodeURIComponent('"email"')}&equalTo=${encodeURIComponent(JSON.stringify(email))}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const val = await res.json();
    if (!val) return null;
    const id = Object.keys(val)[0];
    return { id, ...val[id] };
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });

    let body;
    try { body = JSON.parse(event.body); } catch { return json(400, { ok: false, error: 'invalid_json' }); }
    const { action, password, newPassword, currentPassword, superAdminPassword, email, targetEmail } = body;

    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
        return json(500, { ok: false, error: 'server_not_configured' });
    }

    try {
        // L'Amministratore Unico può reimpostare la password FISSA (di invito) del Project
        // Manager senza conoscerla, dimostrando di conoscere LA PROPRIA (verificata su pmConfig).
        if (action === 'admin_reset') {
            if (!superAdminPassword || !newPassword) return json(400, { ok: false, error: 'missing_fields' });
            if (newPassword.length < 8) return json(400, { ok: false, error: 'too_short' });
            const superAdminStored = await dbGet('pmConfig/password');
            if (!superAdminStored || sha256(superAdminPassword) !== superAdminStored) {
                return json(403, { ok: false, error: 'wrong_superadmin_password' });
            }
            await dbSet('pwmConfig/password', sha256(newPassword));
            return json(200, { ok: true });
        }

        // L'Amministratore Unico azzera la password PERSONALE di un singolo Project Manager
        // (senza conoscerla): quel PM dovrà rientrare con la password fissa e impostarsene
        // una nuova, esattamente come al primissimo accesso.
        if (action === 'admin_reset_personal') {
            if (!superAdminPassword || !targetEmail) return json(400, { ok: false, error: 'missing_fields' });
            const superAdminStored = await dbGet('pmConfig/password');
            if (!superAdminStored || sha256(superAdminPassword) !== superAdminStored) {
                return json(403, { ok: false, error: 'wrong_superadmin_password' });
            }
            const target = await findPmUserByEmail(targetEmail);
            if (!target) return json(404, { ok: false, error: 'not_found' });
            await dbDelete(`pmUserSecrets/${target.id}`);
            await dbSet(`pmUsers/${target.id}/hasPersonalPassword`, false);
            return json(200, { ok: true });
        }

        // Login con la password FISSA (di invito): serve per un Project Manager nuovo, o per
        // uno che non ha ancora impostato una password personale.
        if (action === 'login') {
            const stored = await dbGet('pwmConfig/password');
            if (!password || typeof password !== 'string') return json(400, { ok: false, error: 'missing_password' });
            if (!stored) {
                if (password.length < 8) return json(400, { ok: false, error: 'too_short' });
                await dbSet('pwmConfig/password', sha256(password));
                return json(200, { ok: true, bootstrapped: true });
            }
            return json(200, { ok: sha256(password) === stored, bootstrapped: false });
        }

        // Cambio della password FISSA condivisa (invariato).
        if (action === 'change') {
            const stored = await dbGet('pwmConfig/password');
            if (!currentPassword || !newPassword) return json(400, { ok: false, error: 'missing_fields' });
            if (newPassword.length < 8) return json(400, { ok: false, error: 'too_short' });
            if (!stored || sha256(currentPassword) !== stored) return json(403, { ok: false, error: 'wrong_current' });
            await dbSet('pwmConfig/password', sha256(newPassword));
            return json(200, { ok: true });
        }

        // Login con la password PERSONALE (una volta che il Project Manager se ne è creata una).
        if (action === 'personal_login') {
            if (!email || !password) return json(400, { ok: false, error: 'missing_fields' });
            const user = await findPmUserByEmail(email);
            if (!user) return json(404, { ok: false, error: 'not_found' });
            const secret = await dbGet(`pmUserSecrets/${user.id}`);
            if (!secret || !secret.passwordHash) return json(400, { ok: false, error: 'no_personal_password' });
            if (sha256(password) !== secret.passwordHash) return json(403, { ok: false, error: 'wrong_password' });
            await dbSet(`pmUsers/${user.id}/lastLogin`, new Date().toISOString());
            return json(200, { ok: true });
        }

        // Crea o cambia la password PERSONALE del Project Manager. La prima volta va dimostrato
        // di essere entrati con la password fissa (currentPassword = quella); le volte successive
        // va dimostrata la password personale attuale.
        if (action === 'set_personal') {
            if (!email || !currentPassword || !newPassword) return json(400, { ok: false, error: 'missing_fields' });
            if (newPassword.length < 8) return json(400, { ok: false, error: 'too_short' });
            const user = await findPmUserByEmail(email);
            if (!user) return json(404, { ok: false, error: 'not_found' });
            const secret = await dbGet(`pmUserSecrets/${user.id}`);
            if (secret && secret.passwordHash) {
                if (sha256(currentPassword) !== secret.passwordHash) return json(403, { ok: false, error: 'wrong_current' });
            } else {
                const sharedStored = await dbGet('pwmConfig/password');
                if (!sharedStored || sha256(currentPassword) !== sharedStored) return json(403, { ok: false, error: 'wrong_current' });
            }
            await dbSet(`pmUserSecrets/${user.id}`, { passwordHash: sha256(newPassword) });
            await dbSet(`pmUsers/${user.id}/hasPersonalPassword`, true);
            return json(200, { ok: true });
        }

        return json(400, { ok: false, error: 'unknown_action' });
    } catch (e) {
        return json(500, { ok: false, error: e.message });
    }
};
