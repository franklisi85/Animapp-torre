// Verifica/imposta/cambia la password del Project Manager lato server, usando le
// credenziali amministrative di Firebase (mai esposte al browser). L'hash della
// password non viene MAI restituito al client: solo un esito true/false.
const admin = require('firebase-admin');
const crypto = require('crypto');

function initAdmin() {
    if (admin.apps.length) return;
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: 'https://logistic-torreserena-default-rtdb.europe-west1.firebasedatabase.app'
    });
}

function sha256(text) {
    return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

function json(statusCode, obj) {
    return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj) };
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
        initAdmin();
        const ref = admin.database().ref('pmConfig/password');
        const snap = await ref.once('value');
        const stored = snap.val();

        if (action === 'login') {
            if (!password || typeof password !== 'string') return json(400, { ok: false, error: 'missing_password' });
            if (!stored) {
                // Bootstrap: nessuna password esiste ancora — quella inviata ora diventa quella definitiva.
                if (password.length < 8) return json(400, { ok: false, error: 'too_short' });
                await ref.set(sha256(password));
                return json(200, { ok: true, bootstrapped: true });
            }
            return json(200, { ok: sha256(password) === stored, bootstrapped: false });
        }

        if (action === 'change') {
            if (!currentPassword || !newPassword) return json(400, { ok: false, error: 'missing_fields' });
            if (newPassword.length < 8) return json(400, { ok: false, error: 'too_short' });
            if (!stored || sha256(currentPassword) !== stored) return json(403, { ok: false, error: 'wrong_current' });
            await ref.set(sha256(newPassword));
            return json(200, { ok: true });
        }

        return json(400, { ok: false, error: 'unknown_action' });
    } catch (e) {
        return json(500, { ok: false, error: e.message });
    }
};
