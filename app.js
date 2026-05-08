// ==========================================
// FIX iOS: previene zoom automatico al cambio orientamento
// mantenendo la possibilità di zoom manuale
// ==========================================
(function() {
    const vp = document.querySelector('meta[name=viewport]');
    if (!vp) return;
    let t;
    window.addEventListener('orientationchange', function() {
        vp.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=0');
        clearTimeout(t);
        t = setTimeout(function() {
            vp.setAttribute('content', 'width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover');
        }, 400);
    });
})();

// ==========================================
// WEB SHARE TARGET — rileva link condiviso all'avvio
// ==========================================
(function() {
    const params = new URLSearchParams(window.location.search);
    const sharedUrl = params.get('url') || params.get('text') || '';
    if (sharedUrl && sharedUrl.startsWith('http')) {
        window._sharedUrl = sharedUrl;
        window.history.replaceState({}, '', '/');
    }
})();

// ==========================================
// LOGIN GATE - AUTHENTICATION SYSTEM
// ==========================================
const LOGIN_PASSWORDS = {
    team: "TeamStaff2026",
    admin: "Torre2026"
};

// ==========================================
// UTILITY: ID GENERATION & TOAST NOTIFICATIONS
// ==========================================
function generateId() {
    return Date.now() + Math.floor(Math.random() * 10000);
}

function generateReqCode() {
    return 'REQ-' + Math.floor(10000 + Math.random() * 90000);
}

function escHtml(str) {
    return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function showToast(message, type) {
    type = type || 'info';
    const existing = document.getElementById('toast-container');
    if (existing) existing.remove();
    const colors = { success: 'var(--secondary)', error: 'var(--danger)', info: 'var(--primary)' };
    const icons = { success: 'check_circle', error: 'error', info: 'info' };
    const container = document.createElement('div');
    container.id = 'toast-container';
    container.innerHTML = `<div class="toast toast-${type}"><span class="material-symbols-outlined" style="font-size:18px; color:${colors[type]};">${icons[type]}</span><span>${message}</span></div>`;
    document.body.appendChild(container);
    setTimeout(() => { if (container.parentNode) container.remove(); }, 3500);
}

const loginGate = document.getElementById('login-gate');
const loginCard = document.querySelector('.login-card');
const appContainer = document.getElementById('app-container');

// Accesso rapido se già loggato
if (localStorage.getItem('logistic_torre_auth') === 'true') {
    loginGate.classList.add('hidden');
    appContainer.classList.remove('hidden');
}

// Pending login data (set after identity check, before password)
let pendingLoginUser = null;

function showLoginStep(stepId) {
    ['login-step-1','login-step-2','login-step-3','login-step-admin'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(stepId);
    if (target) { target.classList.remove('hidden'); target.style.display = 'flex'; }
}

window.loginCheckIdentity = function() {
    try {
        const firstName = (document.getElementById('login-firstname')?.value || '').trim();
        const lastName  = (document.getElementById('login-lastname')?.value || '').trim();
        const email     = (document.getElementById('login-email')?.value || '').trim().toLowerCase();
        const errEl = document.getElementById('login-step1-error');
        const privacyEl = document.getElementById('privacy-consent');
        const privacyErrEl = document.getElementById('login-privacy-error');

        if (!firstName || !lastName || !email || !email.includes('@')) {
            errEl.classList.remove('hidden'); return;
        }
        if (!firebaseDataLoaded) {
            errEl.textContent = 'Connessione in corso, riprova tra un secondo...';
            errEl.classList.remove('hidden'); return;
        }
        errEl.textContent = 'Compila tutti i campi con una email valida.';
        errEl.classList.add('hidden');
        if (!privacyEl || !privacyEl.checked) {
            privacyErrEl.classList.remove('hidden'); return;
        }
        privacyErrEl.classList.add('hidden');

        if ((appData.blockedEmails || []).includes(email)) {
            showLoginStep('login-step-3'); return;
        }

        const usersRaw = appData.registeredUsers || [];
        const users = Array.isArray(usersRaw) ? usersRaw : Object.values(usersRaw);
        const existing = users.find(u => u && u.email === email);
        const welcome = document.getElementById('login-step2-welcome');

        if (existing) {
            pendingLoginUser = existing;
            if (welcome) welcome.textContent = `Bentornato, ${existing.firstName}!`;
        } else {
            pendingLoginUser = { isNew: true, firstName, lastName, email };
            if (welcome) welcome.textContent = `Benvenuto, ${firstName}!`;
        }
        showLoginStep('login-step-2');
        setTimeout(() => document.getElementById('login-team-pwd')?.focus(), 50);
    } catch(e) {
        const errEl = document.getElementById('login-step1-error');
        if (errEl) { errEl.textContent = 'Errore: ' + e.message; errEl.classList.remove('hidden'); }
    }
};

window.loginWithPassword = function() {
    const pwd = document.getElementById('login-team-pwd')?.value || '';
    const errEl = document.getElementById('login-step2-error');
    if (pwd !== LOGIN_PASSWORDS.team) {
        errEl.textContent = 'Password errata. Riprova.';
        errEl.classList.remove('hidden');
        document.getElementById('login-team-pwd').value = '';
        document.getElementById('login-team-pwd').focus();
        return;
    }
    errEl.classList.add('hidden');
    if (!pendingLoginUser) {
        errEl.textContent = 'Errore: sessione scaduta. Torna al passo 1.';
        errEl.classList.remove('hidden');
        return;
    }
    if (pendingLoginUser.isNew) {
        // Controllo fresco su Firebase per evitare duplicati in caso di race condition
        db.ref('appData/registeredUsers').once('value', snapshot => {
            const usersMap = snapshot.val() || {};
            const usersArr = Object.values(usersMap);
            const alreadyExists = usersArr.find(u => u.email === pendingLoginUser.email);
            if (alreadyExists) {
                if (alreadyExists.role === 'pending') alreadyExists.role = 'animatore';
                alreadyExists.lastLogin = new Date().toISOString();
                if (!alreadyExists.privacyConsentAt) alreadyExists.privacyConsentAt = new Date().toISOString();
                db.ref(`appData/registeredUsers/${alreadyExists.id}`).set(alreadyExists);
                finalizeLogin(alreadyExists.role, `${alreadyExists.firstName} ${alreadyExists.lastName}`, alreadyExists.email);
                return;
            }
            const newUser = {
                id: generateId(),
                firstName: pendingLoginUser.firstName,
                lastName: pendingLoginUser.lastName,
                email: pendingLoginUser.email,
                role: 'animatore',
                registeredAt: new Date().toISOString(),
                lastLogin: new Date().toISOString(),
                privacyConsentAt: new Date().toISOString()
            };
            // Scrivi solo il singolo utente sul suo nodo — evita race condition con registrazioni simultane
            db.ref(`appData/registeredUsers/${newUser.id}`).set(newUser);
            finalizeLogin('animatore', `${newUser.firstName} ${newUser.lastName}`, newUser.email);
        });
    } else {
        // Upgrade legacy 'pending' entries to animatore automatically
        if (pendingLoginUser.role === 'pending') pendingLoginUser.role = 'animatore';
        pendingLoginUser.lastLogin = new Date().toISOString();
        if (!pendingLoginUser.privacyConsentAt) pendingLoginUser.privacyConsentAt = new Date().toISOString();
        // Aggiorna solo questo utente, non l'intero array
        db.ref(`appData/registeredUsers/${pendingLoginUser.id}`).set(pendingLoginUser);
        finalizeLogin(pendingLoginUser.role, `${pendingLoginUser.firstName} ${pendingLoginUser.lastName}`, pendingLoginUser.email);
    }
};

window.showAdminStep = function() {
    const privacyEl = document.getElementById('privacy-consent');
    const privacyErrEl = document.getElementById('login-privacy-error');
    if (!privacyEl || !privacyEl.checked) {
        privacyErrEl.classList.remove('hidden'); return;
    }
    privacyErrEl.classList.add('hidden');
    showLoginStep('login-step-admin');
    setTimeout(() => document.getElementById('login-admin-pwd')?.focus(), 50);
};

window.loginAdmin = function() {
    const pwd = document.getElementById('login-admin-pwd')?.value || '';
    const errEl = document.getElementById('login-admin-error');
    if (pwd !== LOGIN_PASSWORDS.admin) {
        errEl.classList.remove('hidden');
        document.getElementById('login-admin-pwd').value = '';
        document.getElementById('login-admin-pwd').focus();
        loginCard.classList.add('shake');
        setTimeout(() => loginCard.classList.remove('shake'), 500);
        return;
    }
    errEl.classList.add('hidden');
    finalizeLogin('admin', 'Capo Equipe', '');
};

window.backToStep1 = function() {
    pendingLoginUser = null;
    showLoginStep('login-step-1');
    setTimeout(() => document.getElementById('login-firstname')?.focus(), 50);
};

window.openPrivacyModal = function() {
    document.getElementById('privacy-modal').classList.remove('hidden');
};
window.closePrivacyModal = function() {
    document.getElementById('privacy-modal').classList.add('hidden');
};

// Enter key support on password fields
setTimeout(() => {
    document.getElementById('login-team-pwd')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginWithPassword(); });
    document.getElementById('login-admin-pwd')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginAdmin(); });
    document.getElementById('login-email')?.addEventListener('keydown', e => { if (e.key === 'Enter') loginCheckIdentity(); });
}, 200);

function finalizeLogin(role, name, email) {
    localStorage.setItem('logistic_torre_auth', 'true');
    localStorage.setItem('logistic_torre_role', role);
    localStorage.setItem('logistic_torre_username', name);
    localStorage.setItem('logistic_torre_email', email || '');
    currentRole = role;
    currentUsername = name;
    if (typeof applyRole === 'function') applyRole();
    loginGate.classList.add('hidden');
    setTimeout(() => { appContainer.classList.remove('hidden'); loginGate.style.display = 'none'; }, 600);
    initOneSignal(email, name, role);
}

// ==========================================
// ONESIGNAL — PUSH NOTIFICATIONS
// ==========================================
function initOneSignal(email, name, role) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
        await OneSignal.init({
            appId: '9d5f60a7-b686-4cf5-98b6-e044f755263c',
            promptOptions: { slidedown: { prompts: [{ type: 'push', autoPrompt: false }] } }
        });
        if (email) {
            await OneSignal.login(email);
            OneSignal.User.addTag('email', email);
            OneSignal.User.addTag('name', name);
            OneSignal.User.addTag('role', role);
        }
        const isSubscribed = await OneSignal.User.PushSubscription.optedIn;
        const hasPermission = OneSignal.Notifications.permission;
        const btn = document.getElementById('btn-resubscribe');
        if (isSubscribed || hasPermission) {
            // Sempre rinnova il token ad ogni apertura per evitare che scada
            try { await OneSignal.User.PushSubscription.optIn(); } catch(e) {}
            if (btn) { btn.style.color = '#22c55e'; btn.title = 'Notifiche attive ✓'; }
        } else {
            if (btn) { btn.style.color = '#f59e0b'; btn.title = 'Tocca per attivare le notifiche'; }
            setTimeout(showNotifPrompt, 2000);
        }
        OneSignal.Notifications.addEventListener('click', (event) => {
            const view = event?.notification?.additionalData?.view;
            if (view) {
                localStorage.setItem('pending_nav_view', view);
                setTimeout(() => { navigateTo(view); localStorage.removeItem('pending_nav_view'); }, 500);
            }
        });
    });
}

function showNotifPrompt() {
    if (sessionStorage.getItem('notif_prompt_shown')) return;
    if (document.getElementById('notif-prompt-modal')) return;
    sessionStorage.setItem('notif_prompt_shown', '1');
    const modal = document.createElement('div');
    modal.id = 'notif-prompt-modal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;padding:20px;';
    modal.innerHTML = `
        <div style="background:white;border-radius:18px;padding:28px 24px;max-width:320px;width:100%;text-align:center;box-shadow:0 24px 60px rgba(0,0,0,0.25);">
            <span class="material-symbols-outlined" style="font-size:52px;color:#f59e0b;">notifications_active</span>
            <h3 style="margin:12px 0 8px;font-size:1.1rem;color:#1e293b;font-weight:700;">Attiva le notifiche</h3>
            <p style="color:#64748b;font-size:0.88rem;margin-bottom:22px;line-height:1.5;">Ricevi in tempo reale messaggi chat, avvisi e ordini di servizio dal team.</p>
            <button onclick="window._confirmNotifPrompt()" style="width:100%;background:#f59e0b;color:white;border:none;border-radius:10px;padding:13px;font-size:1rem;font-weight:700;cursor:pointer;margin-bottom:10px;">🔔 Attiva notifiche</button>
            <button onclick="window._dismissNotifPrompt()" style="width:100%;background:none;color:#94a3b8;border:none;padding:8px;font-size:0.88rem;cursor:pointer;">Adesso no</button>
        </div>
    `;
    document.body.appendChild(modal);
}
window._confirmNotifPrompt = async function() {
    const modal = document.getElementById('notif-prompt-modal');
    if (modal) modal.remove();
    await window.activateNotifications();
};
window._dismissNotifPrompt = function() {
    const modal = document.getElementById('notif-prompt-modal');
    if (modal) modal.remove();
};

window.activateNotifications = function() {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
        try {
            const granted = await OneSignal.Notifications.requestPermission();
            if (granted) {
                await OneSignal.User.PushSubscription.optIn();
                const btn = document.getElementById('btn-resubscribe');
                if (btn) { btn.style.color = '#22c55e'; btn.title = 'Notifiche attive ✓'; }
                const banner = document.getElementById('notif-activation-banner');
                if (banner) banner.remove();
                showToast('Notifiche attivate! 🔔', 'success');
            } else {
                showToast('Vai in Impostazioni → Safari → Notifiche e autorizza questa app.', 'error');
            }
        } catch(e) {
            showToast('Errore attivazione: ' + e.message, 'error');
        }
    });
};

window.sendTestNotification = async function() {
    showToast('Invio notifica di test...', 'success');
    try {
        const res = await fetch('/.netlify/functions/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: '🔔 Test notifica', message: 'Se vedi questo banner le notifiche funzionano!', view: 'dashboard' })
        });
        const data = await res.json();
        if (data.recipients > 0) {
            showToast('✅ Inviata a ' + data.recipients + ' dispositivi', 'success');
        } else if (data.id) {
            showToast('✅ Inviata (ID: ' + data.id + ')', 'success');
        } else {
            showToast('⚠️ Risposta: ' + JSON.stringify(data), 'error');
        }
    } catch(e) {
        showToast('❌ Errore: ' + e.message, 'error');
    }
};

async function sendPushNotification(title, message, senderEmail, view) {
    try {
        const res = await fetch('/.netlify/functions/notify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title, message, view })
        });
        if (!res.ok && currentRole === 'admin') {
            const txt = await res.text();
            showToast('Errore notifica: ' + res.status + ' ' + txt, 'error');
        }
    } catch (e) {
        if (currentRole === 'admin') showToast('Notifica non inviata: ' + e.message, 'error');
    }
}

// ==========================================
// SEARCH & FILTER MODULE
// ==========================================
window.searchState = {
    inventory: { q: '', groupId: '' },
    staff:     { q: '' },
    events:    { q: '', week: '', type: '' },
    files:     { q: '', type: '' },
    users:     { q: '', role: '' }
};

function _updateClear(inputId, clearId) {
    const el = document.getElementById(inputId);
    const cl = document.getElementById(clearId);
    if (cl) cl.classList.toggle('hidden', !el || el.value.length === 0);
}

// ── Inventory ──
window.applyInventorySearch = function(val) {
    window.searchState.inventory.q = val;
    _updateClear('search-inventory-input', 'search-inventory-clear');
    renderInventory();
};
window.clearInventorySearch = function() {
    window.searchState.inventory.q = '';
    const el = document.getElementById('search-inventory-input');
    if (el) el.value = '';
    _updateClear('search-inventory-input', 'search-inventory-clear');
    renderInventory();
};
window.applyInventoryGroupFilter = function(groupId) {
    window.searchState.inventory.groupId = groupId;
    renderInventory();
};
function renderInventoryChips() {
    const c = document.getElementById('inventory-group-chips');
    if (!c) return;
    const groups = appData.sectorGroups || [];
    const active = window.searchState.inventory.groupId;
    c.innerHTML = `<button class="filter-chip ${!active ? 'active' : ''}" onclick="applyInventoryGroupFilter('')">Tutti i Settori</button>` +
        groups.map(g => `<button class="filter-chip ${String(active)===String(g.id)?'active':''}" onclick="applyInventoryGroupFilter('${g.id}')">${escHtml(g.name)}</button>`).join('');
    // Wire up live search input
    const inp = document.getElementById('search-inventory-input');
    if (inp && !inp._wired) {
        inp.addEventListener('input', () => applyInventorySearch(inp.value));
        inp._wired = true;
    }
}

// ── Staff ──
window.applyStaffSearch = function(val) {
    window.searchState.staff.q = val;
    _updateClear('search-staff-input', 'search-staff-clear');
    renderStaff();
};
window.clearStaffSearch = function() {
    window.searchState.staff.q = '';
    const el = document.getElementById('search-staff-input');
    if (el) el.value = '';
    _updateClear('search-staff-input', 'search-staff-clear');
    renderStaff();
};
function renderStaffChips() {
    const c = document.getElementById('staff-group-chips');
    if (!c) return;
    const inp = document.getElementById('search-staff-input');
    if (inp && !inp._wired) {
        inp.addEventListener('input', () => applyStaffSearch(inp.value));
        inp._wired = true;
    }
}

// ── Events ──
window.applyEventsSearch = function(val) {
    window.searchState.events.q = val;
    _updateClear('search-events-input', 'search-events-clear');
    applyEventsDisplayFilter();
};
window.clearEventsSearch = function() {
    window.searchState.events.q = '';
    const el = document.getElementById('search-events-input');
    if (el) el.value = '';
    _updateClear('search-events-input', 'search-events-clear');
    applyEventsDisplayFilter();
};
window.applyEventsFilter = function(filterType, val) {
    window.searchState.events[filterType] = val;
    document.querySelectorAll(`#search-events .filter-chip[data-filter="${filterType}"]`).forEach(chip => {
        chip.classList.toggle('active', chip.dataset.val === val);
    });
    applyEventsDisplayFilter();
};
function applyEventsDisplayFilter() {
    const { q, week, type } = window.searchState.events;
    const query = q.toLowerCase().trim();
    const w1l = document.getElementById('week1-label'), w1g = document.getElementById('week1-grid');
    const w2l = document.getElementById('week2-label'), w2g = document.getElementById('week2-grid');
    if (w1l) w1l.style.display = week === '2' ? 'none' : '';
    if (w1g) w1g.style.display = week === '2' ? 'none' : '';
    if (w2l) w2l.style.display = week === '1' ? 'none' : '';
    if (w2g) w2g.style.display = week === '1' ? 'none' : '';
    document.querySelectorAll('.event-box').forEach(box => {
        const title = (box.querySelector('.t')?.textContent || '').toLowerCase();
        const isRest = box.classList.contains('rest');
        let show = true;
        if (query && !title.includes(query)) show = false;
        if (type === 'rest' && !isRest) show = false;
        if (type === 'event' && isRest) show = false;
        box.style.display = show ? '' : 'none';
    });
    // Wire input
    const inp = document.getElementById('search-events-input');
    if (inp && !inp._wired) {
        inp.addEventListener('input', () => applyEventsSearch(inp.value));
        inp._wired = true;
    }
}

// ── Files ──
window.applyFilesSearch = function(val) {
    window.searchState.files.q = val;
    _updateClear('search-files-input', 'search-files-clear');
    renderFiles();
};
window.clearFilesSearch = function() {
    window.searchState.files.q = '';
    const el = document.getElementById('search-files-input');
    if (el) el.value = '';
    _updateClear('search-files-input', 'search-files-clear');
    renderFiles();
};
window.applyFilesFilter = function(type) {
    window.searchState.files.type = type;
    document.querySelectorAll('#search-files .filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.val === type);
    });
    renderFiles();
};
function wireFilesSearch() {
    const inp = document.getElementById('search-files-input');
    if (inp && !inp._wired) {
        inp.addEventListener('input', () => applyFilesSearch(inp.value));
        inp._wired = true;
    }
}

// ── Users ──
window.applyUsersSearch = function(val) {
    window.searchState.users.q = val;
    _updateClear('search-users-input', 'search-users-clear');
    renderRegisteredUsers();
};
window.clearUsersSearch = function() {
    window.searchState.users.q = '';
    const el = document.getElementById('search-users-input');
    if (el) el.value = '';
    _updateClear('search-users-input', 'search-users-clear');
    renderRegisteredUsers();
};
window.applyUsersFilter = function(role) {
    window.searchState.users.role = role;
    document.querySelectorAll('#search-users .filter-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.val === role);
    });
    renderRegisteredUsers();
};
function wireUsersSearch() {
    const inp = document.getElementById('search-users-input');
    if (inp && !inp._wired) {
        inp.addEventListener('input', () => applyUsersSearch(inp.value));
        inp._wired = true;
    }
}

// ==========================================
// TELEGRAM NOTIFICATIONS CONFIG
// ==========================================
const TELEGRAM_CONFIG = {
    botTokenMagazzino: "8508370432:AAH9vv94rMv4Ub0oL15ORDV3nKu4Uf8o3SI",
    botTokenEventi: "8387692912:AAFoXwjgFqw0dYdCbqoOBds6ShiNaf8BN10",
    chatIdAdmin: "843013302",
    chatIdGroup: "-5217486033"
};

async function sendTelegramNotification(message, token, targetChatId) {
    if (!token || token === "INSERISCI_QUI_IL_TOKEN") return;
    const chatId = targetChatId || TELEGRAM_CONFIG.chatIdAdmin;
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
    } catch (error) { console.warn('Telegram failed:', error); }
}

// ==========================================
// FIREBASE CONFIGURATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyA1jGqWbQ_YYXVMMZSlqCvDAyhpiyDXO94",
  authDomain: "logistic-torreserena.firebaseapp.com",
  databaseURL: "https://logistic-torreserena-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "logistic-torreserena",
  storageBucket: "logistic-torreserena.firebasestorage.app",
  messagingSenderId: "535403524161",
  appId: "1:535403524161:web:f1f200f6b46487ab3896c0",
  measurementId: "G-JLB3FXPKSG"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();
let storage;

// Fallback logic for Storage Bucket
try {
    storage = firebase.storage();
} catch(e) {
    console.warn("Tentativo fallback bucket...");
    firebaseConfig.storageBucket = "logistic-torreserena.appspot.com";
    storage = firebase.storage();
}

// Initial 2.0 Data Setup
const DEFAULT_DATA = {
    sectors: [
        {
            id: 1, name: "Sport", manager: "Giulia Bianchi",
            materials: [
                { id: 1001, name: "Pallone da Beach Volley", total: 4, available: 4 },
                { id: 1002, name: "Racchettoni", total: 10, available: 6 }
            ]
        },
        {
            id: 2, name: "Spettacolo", manager: "Mario Rossi",
            materials: [
                { id: 2001, name: "Microfono ad Archetto", total: 8, available: 8 },
                { id: 2002, name: "Costume di Scena", total: 15, available: 12 }
            ]
        }
    ],
    staff: [
        { id: 1, name: "Mario Rossi", role: "Responsabile Spettacolo" },
        { id: 2, name: "Giulia Bianchi", role: "Responsabile Sport" }
    ],
    events: [
        { id: 1, title: "Torneo Beach Volley", time: "10:00", location: "Spiaggia", day: "mon" },
        { id: 2, title: "Musical: Il Re Leone", time: "21:30", location: "Anfiteatro", day: "wed" },
        { id: 3, title: "Acquagym", time: "11:00", location: "Piscina", day: "tue" }
    ],
    notifications: [],
    sectorGroups: [],
    operatori: [],
    avvisi: [],
    ordineGiorno: [],
    files: [],
    registeredUsers: [],
    blockedEmails: [],
    settings: { blockRequests: false },
    dashboardSectionNames: { avvisi: 'Avvisi', odg: 'Ordine del Giorno', richieste: 'Le Mie Richieste' }
};

// State Management
let appData = DEFAULT_DATA;
let currentRole = localStorage.getItem('logistic_torre_role') || 'animatore';
let currentUsername = localStorage.getItem('logistic_torre_username') || '';
let nameOverlayShown = false;
let firebaseDataLoaded = false;

window.saveData = function() {
    db.ref('appData').set(appData);
}

// Pulizia sezione file
window.resetFiles = function() {
    if(confirm('Sei sicuro di voler eliminare TUTTI i file e cartelle dalla sezione? Questa operazione è irreversibile.')) {
        appData.files = [];
        saveData();
        window.currentFolderId = 'root';
        renderFiles();
    }
}

// Clean old versions
localStorage.removeItem('logistic_torre_data'); 
localStorage.removeItem('logistic_torre_data_v2'); 

// View Admin vs Responsabile Mode
const btnAdminLogin = document.getElementById('btn-admin-login');
const userAvatar = document.getElementById('user-avatar');

function applyRole() {
    document.body.classList.remove('view-as-admin', 'view-as-responsabile', 'view-as-animatore', 'view-as-operatore');
    document.body.classList.add(`view-as-${currentRole}`);
    
    if (currentRole === 'admin') {
        userAvatar.textContent = "CE";
        userAvatar.style.background = "linear-gradient(135deg, var(--danger), var(--accent))";
        btnAdminLogin.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">logout</span> Esci da Capo Equipe';
        btnAdminLogin.classList.remove('primary');
    } else if (currentRole === 'operatore') {
        userAvatar.textContent = "OPR";
        userAvatar.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
        btnAdminLogin.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">lock</span> Accesso Capo Equipe';
        btnAdminLogin.classList.add('primary');
    } else if (currentRole === 'animatore') {
        userAvatar.textContent = "STF";
        userAvatar.style.background = "linear-gradient(135deg, #10b981, #059669)";
        btnAdminLogin.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">lock</span> Accesso Capo Equipe';
        btnAdminLogin.classList.add('primary');
    } else {
        userAvatar.textContent = "RSP";
        userAvatar.style.background = "linear-gradient(135deg, var(--primary), var(--secondary))";
        btnAdminLogin.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px;">lock</span> Accesso Capo Equipe';
        btnAdminLogin.classList.add('primary');
    }
    
    renderInventory();
    renderEvents();
    if(typeof renderFiles === 'function') renderFiles();
    renderDashboard();
}

if (btnAdminLogin) btnAdminLogin.addEventListener('click', () => {
    if (currentRole === 'admin') {
        currentRole = 'animatore';
        localStorage.setItem('logistic_torre_role', currentRole);
        applyRole();
    } else {
        openAdminLoginModal();
    }
});

function openAdminLoginModal() {
    openModal("Accesso Capo Equipe", `
        <div class="form-group">
            <label>Password Amministratore</label>
            <input type="password" id="admin-pwd-input" class="form-control" placeholder="Inserisci la password" autocomplete="current-password">
        </div>
        <p id="admin-pwd-error" class="hidden" style="color:var(--danger); font-size:0.85rem; margin-bottom:12px;">Password errata. Accesso negato.</p>
        <button class="btn primary" onclick="submitAdminLogin()" style="width:100%; justify-content:center;">Accedi</button>
    `);
    setTimeout(() => {
        const inp = document.getElementById('admin-pwd-input');
        if (inp) {
            inp.focus();
            inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitAdminLogin(); });
        }
    }, 50);
}

window.submitAdminLogin = function() {
    const pwd = document.getElementById('admin-pwd-input')?.value || '';
    if (pwd === LOGIN_PASSWORDS.admin) {
        currentRole = 'admin';
        localStorage.setItem('logistic_torre_role', currentRole);
        applyRole();
        modal.classList.add('hidden');
        showToast('Accesso Amministratore garantito.', 'success');
    } else {
        document.getElementById('admin-pwd-error').classList.remove('hidden');
        document.getElementById('admin-pwd-input').value = '';
        document.getElementById('admin-pwd-input').focus();
    }
}

// Global Logout Logic
const btnResubscribe = document.getElementById('btn-resubscribe');
if (btnResubscribe) {
    btnResubscribe.addEventListener('click', () => activateNotifications());
}

const btnGlobalLogout = document.getElementById('btn-global-logout');
if (btnGlobalLogout) {
    btnGlobalLogout.addEventListener('click', () => {
        if (confirm("Sei sicuro di voler uscire dal tuo account?")) {
            localStorage.removeItem('logistic_torre_auth');
            localStorage.removeItem('logistic_torre_role');
            localStorage.removeItem('logistic_torre_username');
            localStorage.removeItem('logistic_torre_email');
            window.location.reload();
        }
    });
}

// Firebase Listener
db.ref('appData').on('value', (snapshot) => {
    firebaseDataLoaded = true;
    if (snapshot.exists()) {
        appData = snapshot.val();
        
        // Ensure arrays (Firebase removes empty arrays)
        if (!appData.sectors) appData.sectors = [];
        let _migrated = false;
        appData.sectors.forEach(sec => {
            // Migrate from old activities structure → flat materials
            if (sec.activities) {
                if (!sec.materials) sec.materials = [];
                sec.activities.forEach(act => {
                    (act.materials || []).forEach(mat => sec.materials.push(mat));
                });
                delete sec.activities;
                _migrated = true;
            }
            if (!sec.materials) sec.materials = [];
        });
        if (_migrated) saveData();
        if (!appData.staff) appData.staff = [];
        if (!appData.events) appData.events = [];
        if (!appData.notifications) appData.notifications = [];
        if (!appData.files) appData.files = [];
        if (!appData.settings) appData.settings = { blockRequests: false };
        if (!appData.sectorGroups) appData.sectorGroups = [];
        if (!appData.operatori) appData.operatori = [];
        if (!appData.avvisi) appData.avvisi = [];
        if (!appData.folderNotes) appData.folderNotes = {};
        if (!appData.pageNotes) appData.pageNotes = {};
        // Normalizza: Firebase può restituire un oggetto invece di array quando le chiavi non sono sequenziali
        // Conserva la chiave Firebase reale (_fbKey) per consentire eliminazioni precise per nodo
        if (!appData.registeredUsers) {
            appData.registeredUsers = [];
        } else if (!Array.isArray(appData.registeredUsers)) {
            appData.registeredUsers = Object.entries(appData.registeredUsers).map(([key, u]) => ({ ...u, _fbKey: key }));
        } else {
            appData.registeredUsers = appData.registeredUsers.map((u, idx) => ({ ...u, _fbKey: String(idx) }));
        }
        if (!appData.blockedEmails) appData.blockedEmails = [];
        if (!appData.dashboardSectionNames) appData.dashboardSectionNames = { avvisi: 'Avvisi', odg: 'Ordine del Giorno', richieste: 'Le Mie Richieste' };

        // Sync role from Firebase in case admin changed it
        const storedEmail = localStorage.getItem('logistic_torre_email');
        if (storedEmail && currentRole !== 'admin') {
            const me = appData.registeredUsers.find(u => u.email === storedEmail);
            if (me && me.role !== currentRole) {
                currentRole = me.role;
                localStorage.setItem('logistic_torre_role', currentRole);
                if (typeof applyRole === 'function') applyRole();
            }
        }

        // Force logout if current user's email was blocked by admin
        if (storedEmail && currentRole !== 'admin') {
            if ((appData.blockedEmails || []).includes(storedEmail)) {
                localStorage.removeItem('logistic_torre_auth');
                localStorage.removeItem('logistic_torre_role');
                localStorage.removeItem('logistic_torre_username');
                localStorage.removeItem('logistic_torre_email');
                alert('Il tuo accesso è stato bloccato dall\'amministratore. Contatta il Capo Equipe.');
                window.location.reload();
                return;
            }
        }

        // Re-render UI
        renderInventory();
        renderStaff();
        renderEvents();
        if(typeof renderFiles === 'function') renderFiles();
        renderDashboard();
        updateNotificationsBadge();
        updateBlockRequestsBtn();
        ['dashboard','inventory','staff','events'].forEach(renderPageNote);
        if (currentRole === 'admin') renderRegisteredUsers();
        renderChatInputBar();
        if (currentRole === 'admin') renderChatPermissionsPanel();

        // Web Share Target: apri modal richiesta rapida se arriva un link condiviso
        if (window._sharedUrl && localStorage.getItem('logistic_torre_auth') === 'true') {
            const sharedUrl = window._sharedUrl;
            window._sharedUrl = null;
            if (appData.settings && appData.settings.blockRequests && currentRole !== 'admin') {
                showToast('Richieste bloccate — link condiviso non utilizzabile.', 'error');
            } else {
                setTimeout(() => {
                    navigateTo('inventory');
                    showToast('Link prodotto ricevuto. Completa la richiesta.', 'info');
                    openQuickRequestModal(sharedUrl);
                }, 400);
            }
        }

        // Overlay nome solo per sessioni legacy senza email registrata
        const hasEmail = !!localStorage.getItem('logistic_torre_email');
        if (!nameOverlayShown && !currentUsername && !hasEmail && localStorage.getItem('logistic_torre_auth') === 'true' && currentRole !== 'admin') {
            nameOverlayShown = true;
            showNameOverlay();
        }
    } else {
        // Safe empty state when DB has no data left
        appData = { sectors: [], staff: [], events: [], notifications: [], files: [], sectorGroups: [], operatori: [], avvisi: [], ordineGiorno: [], registeredUsers: [], blockedEmails: [], settings: { blockRequests: false }, folderNotes: {}, pageNotes: {} };
        renderInventory();
        renderStaff();
        renderEvents();
        if(typeof renderFiles === 'function') renderFiles();
        renderDashboard();
        updateNotificationsBadge();
    }
});

// Notifications Logic
const btnNotifications = document.getElementById('btn-notifications');
const notifDropdown = document.getElementById('notifications-dropdown');
const notifBadge = document.getElementById('notif-badge');
const notifList = document.getElementById('notifications-list');

btnNotifications.addEventListener('click', () => {
    if (currentRole !== 'admin') return;
    notifDropdown.classList.toggle('hidden');
    renderNotifications();
});

function updateNotificationsBadge() {
    if (currentRole === 'admin' && appData.notifications.length > 0) {
        notifBadge.textContent = appData.notifications.length;
        notifBadge.classList.remove('hidden');
    } else {
        notifBadge.classList.add('hidden');
    }
}

function renderNotifications() {
    notifList.innerHTML = '';
    if (appData.notifications.length === 0) {
        notifList.innerHTML = '<div style="padding:16px; text-align:center; color:var(--text-muted);">Nessuna richiesta pendente</div>';
        return;
    }

    // Download button at top
    const downloadDiv = document.createElement('div');
    downloadDiv.style.cssText = 'padding:12px 16px; border-bottom:1px solid var(--border); text-align:right;';
    downloadDiv.innerHTML = `<button class="btn small primary" onclick="downloadRequestsList()" style="width:100%;justify-content:center;"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Scarica Lista Richieste</button>`;
    notifList.appendChild(downloadDiv);
    
    appData.notifications.forEach(n => {
        const div = document.createElement('div');
        div.className = 'notif-item';
        div.innerHTML = `
            <div class="n-header">
                <span>${n.sectorName}</span>
                <div style="display:flex; gap:6px; align-items:center;">
                    ${n.confirmCode ? `<span class="confirm-code">${n.confirmCode}</span>` : ''}
                    <span class="badge" style="background:#fff3cd; color:#856404;">In Attesa</span>
                </div>
            </div>
            <div class="n-body">
                Richiesti <strong>${n.qty}x</strong> ${n.matName}
                <div style="font-size:0.8rem; margin-top:4px;">Da: ${n.reqBy}</div>
                ${n.notes ? `<div style="font-size:0.8rem; margin-top:4px; color:var(--text-main); background:var(--bg-main); padding:4px 8px; border-radius:4px; border-left:2px solid var(--accent);">📝 ${escHtml(n.notes)}</div>` : ''}
                ${n.url ? `<div style="font-size:0.8rem; margin-top:4px;"><a href="${escHtml(n.url)}" target="_blank" style="color:var(--primary); display:inline-flex; align-items:center; gap:4px;"><span class="material-symbols-outlined" style="font-size:14px;">open_in_new</span> Vedi prodotto</a></div>` : ''}
            </div>
            <div class="n-actions">
                <button class="btn small primary" onclick="approveRestock(${n.id}, ${n.secId}, ${n.matId}, ${n.qty})">
                    Segna Acquistato (Reintegra)
                </button>
                <button class="btn small" onclick="deleteRequest(${n.id})" style="background:var(--danger);color:white;border:none;" title="Elimina richiesta">
                    <span class="material-symbols-outlined" style="font-size:15px;">delete</span> Elimina
                </button>
            </div>
        `;
        notifList.appendChild(div);
    });
}

// Download Requests List as Excel (.xls — XML SpreadsheetML, no library needed)
window.downloadRequestsList = function() {
    if (!appData.notifications || appData.notifications.length === 0) {
        showToast('Nessuna richiesta da scaricare.', 'error');
        return;
    }

    const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const headers = ['Reparto','Materiale','Quantità','Richiesto Da','Note / Dettagli','Link Prodotto','Codice Conferma','Data'];
    const headerRow = headers.map(h => `<th style="background:#6366f1;color:#fff;font-weight:bold;padding:8px 12px;border:1px solid #4f46e5;">${h}</th>`).join('');
    const dataRows = appData.notifications.map(n =>
        `<tr>${[n.sectorName,n.matName,n.qty,n.reqBy,n.notes||'',n.url||'',n.confirmCode||'',n.date||'']
        .map(v=>`<td style="padding:6px 12px;border:1px solid #e2e8f0;">${esc(v)}</td>`).join('')}</tr>`
    ).join('');
    const xls = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel">
<head><meta charset="UTF-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet>
<x:Name>Richieste Materiale</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
</x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
<body><table><thead><tr>${headerRow}</tr></thead><tbody>${dataRows}</tbody></table></body></html>`;

    const blob = new Blob([xls], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const today = new Date();
    const dateStr = `${today.getDate().toString().padStart(2,'0')}-${(today.getMonth()+1).toString().padStart(2,'0')}-${today.getFullYear()}`;
    link.download = `richieste_materiale_${dateStr}.xls`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

window.deleteRequest = function(notifId) {
    if (!confirm('Eliminare questa richiesta? Il materiale NON verrà reintegrato.')) return;
    appData.notifications = appData.notifications.filter(n => n.id !== notifId);
    saveData();
    renderNotifications();
    renderInventory();
    updateNotificationsBadge();
    if (appData.notifications.length === 0) notifDropdown.classList.add('hidden');
    showToast('Richiesta eliminata.', 'success');
};

window.approveRestock = function(notifId, secId, matId, qty) {
    const sec = appData.sectors.find(s => s.id === secId);
    if (sec) {
        const mat = (sec.materials || []).find(m => m.id === matId);
        if (mat) { mat.total += qty; mat.available += qty; }
    }
    appData.notifications = appData.notifications.filter(n => n.id !== notifId);
    saveData();
    renderInventory();
    renderNotifications();
    if(appData.notifications.length === 0) notifDropdown.classList.add('hidden');
}

// Navigation Logic
const navLinks = document.querySelectorAll('.nav-links li');
const views = document.querySelectorAll('.view');
const currentViewTitle = document.getElementById('current-view-title');

navLinks.forEach(link => {
    link.addEventListener('click', () => {
        navLinks.forEach(l => l.classList.remove('active'));
        views.forEach(v => v.classList.add('hidden'));
        link.classList.add('active');
        const viewId = link.getAttribute('data-view');
        const viewEl = document.getElementById(`view-${viewId}`);
        if (viewEl) viewEl.classList.remove('hidden');
        currentViewTitle.textContent = link.querySelector('span:last-child').textContent;
        if (['dashboard','inventory','staff','events'].includes(viewId)) renderPageNote(viewId);
        if (viewId === 'users') renderRegisteredUsers();
        if (viewId === 'spettacoli') renderSpettacoli();
        if (viewId === 'chat') { initChat(); setTimeout(markChatSeen, 300); }
        // Chiude il modale e riordina la pagina materiali ad ogni visita
        modal.classList.add('hidden');
        if (viewId === 'inventory') renderInventory();
    });
});

// ── ACCORDION STATE per i Settori (gruppi) ──
function getAccordionState() {
    const identity = localStorage.getItem('logistic_torre_email') || currentUsername || currentRole || 'guest';
    const key = `logistic_accordion_${identity}`;
    try { return JSON.parse(localStorage.getItem(key)) || { groups: {} }; } catch { return { groups: {} }; }
}
function saveAccordionState(state) {
    const identity = localStorage.getItem('logistic_torre_email') || currentUsername || currentRole || 'guest';
    const key = `logistic_accordion_${identity}`;
    localStorage.setItem(key, JSON.stringify(state));
}

function buildSectorCard(sec, secIndex, allSectors, query) {
    const isFirst = secIndex === 0;
    const isLast = secIndex === allSectors.length - 1;
    const isAdmin = currentRole === 'admin';
    const upSectorBtn = isAdmin ? `<button class="btn-icon admin-only" onclick="moveSector(${sec.id}, -1)" title="Sposta su" ${isFirst ? 'disabled style="opacity:0.3;"' : ''}><span class="material-symbols-outlined" style="font-size:18px;">arrow_upward</span></button>` : '';
    const downSectorBtn = isAdmin ? `<button class="btn-icon admin-only" onclick="moveSector(${sec.id}, 1)" title="Sposta giù" ${isLast ? 'disabled style="opacity:0.3;"' : ''}><span class="material-symbols-outlined" style="font-size:18px;">arrow_downward</span></button>` : '';

    const q = (query || '').toLowerCase().trim();
    const blocked = appData.settings && appData.settings.blockRequests;
    const allMats = sec.materials || [];
    const mats = q
        ? (sec.name.toLowerCase().includes(q) ? allMats : allMats.filter(m => m.name.toLowerCase().includes(q)))
        : allMats;

    const materialsHTML = mats.map(mat => {
        const adminEditBtn = isAdmin ? `<button class="btn-icon edit admin-only" onclick="openEditMaterialModal(event, ${sec.id}, ${mat.id})" title="Modifica"><span class="material-symbols-outlined" style="font-size:18px">edit</span></button>` : '';
        const adminDeleteBtn = isAdmin ? `<button class="btn-icon delete admin-only" onclick="deleteMaterial(${sec.id}, ${mat.id})"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>` : '';
        const restockBtn = blocked
            ? `<button class="btn small" disabled style="opacity:0.4; cursor:not-allowed; background:var(--text-muted); color:white;"><span class="material-symbols-outlined" style="font-size:16px;">block</span> Bloccato</button>`
            : `<button class="btn small primary" onclick="openRestockModal(${sec.id}, ${mat.id})"><span class="material-symbols-outlined" style="font-size:16px;">add_shopping_cart</span> Richiedi</button>`;
        return `<li>
                    <div class="mat-info">
                        <strong>${escHtml(mat.name)}</strong>
                        <div class="mat-status">
                            <span>Giacenza Totale: ${mat.total}</span>
                            <span style="color: ${mat.available > 0 ? 'var(--secondary)' : 'var(--danger)'}">Disponibili: ${mat.available}</span>
                        </div>
                        ${mat.details ? `<div class="mat-details">${escHtml(mat.details)}</div>` : ''}
                    </div>
                    <div class="mat-actions">${restockBtn}${adminEditBtn}${adminDeleteBtn}</div>
                </li>`;
    }).join('');

    const secPending = (appData.notifications || []).filter(n => String(n.secId) === String(sec.id));
    let pendingHTML = '';
    if (secPending.length > 0) {
        const pendingBadge = `<span style="font-size:0.72rem;font-weight:600;background:#fff3cd;color:#92400e;border:1px solid #fde68a;border-radius:99px;padding:2px 8px;">${secPending.length}</span>`;
        const rows = secPending.map(n => `
            <div class="pending-req-item">
                <div class="pr-info">
                    <span class="material-symbols-outlined" style="font-size:18px; color:var(--accent); flex-shrink:0;">inventory</span>
                    <div>
                        <strong>${n.qty}x ${escHtml(n.matName)}</strong>
                        <div class="pr-meta">Da: ${escHtml(n.reqBy)}${n.confirmCode ? `&nbsp;·&nbsp;<span class="confirm-code">${n.confirmCode}</span>` : ''}</div>
                        ${n.notes ? `<div class="pr-notes">${escHtml(n.notes)}</div>` : ''}
                        ${n.url ? `<a href="${escHtml(n.url)}" target="_blank" style="font-size:0.78rem;color:var(--primary);display:inline-flex;align-items:center;gap:3px;margin-top:2px;"><span class="material-symbols-outlined" style="font-size:13px;">open_in_new</span> Vedi prodotto</a>` : ''}
                    </div>
                </div>
                <div class="pr-actions">
                    <span class="badge" style="background:#fff3cd; color:#856404; padding:3px 8px;">In Attesa</span>
                    ${isAdmin ? `<button class="btn small primary admin-only" onclick="approveRestock(${n.id}, ${n.secId}, ${n.matId}, ${n.qty})"><span class="material-symbols-outlined" style="font-size:14px;">check</span> Reintegra</button>` : ''}
                    ${isAdmin ? `<button class="btn small admin-only" onclick="deleteRequest(${n.id})" style="background:var(--danger);color:white;border:none;" title="Elimina richiesta"><span class="material-symbols-outlined" style="font-size:14px;">delete</span></button>` : ''}
                </div>
            </div>`).join('');
        pendingHTML = `<div class="sector-pending">
            <div class="sector-pending-header">
                <span class="material-symbols-outlined" style="font-size:16px;">pending_actions</span>
                Richieste Pendenti ${pendingBadge}
            </div>${rows}
        </div>`;
    }

    const addMatBtn = (blocked && !isAdmin) ? '' :
        `<button class="btn small primary" onclick="openAddMaterialModal(${sec.id})"><span class="material-symbols-outlined" style="font-size:15px;">add</span> Materiale</button>`;

    const secCard = document.createElement('div');
    secCard.className = 'sector-card';
    secCard.innerHTML = `
        <div class="sector-header">
            <h3>${escHtml(sec.name)} <span>(Resp: ${escHtml(sec.manager || '—')})</span></h3>
            <div style="display:flex; gap:8px; align-items:center; flex-shrink:0;">
                ${upSectorBtn}${downSectorBtn}
                ${addMatBtn}
                ${isAdmin ? `<button class="btn-icon edit admin-only" onclick="openEditSectorModal(event, ${sec.id})" title="Modifica Reparto"><span class="material-symbols-outlined" style="font-size:18px;">edit</span></button>` : ''}
                ${isAdmin ? `<button class="btn-icon delete admin-only" onclick="deleteSector(${sec.id})" title="Elimina Reparto"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>` : ''}
            </div>
        </div>
        <div class="sector-body">
            <ul class="materials-list">
                ${materialsHTML || '<p style="padding:16px; color:var(--text-muted); font-size:0.85rem;">Nessun materiale inserito.</p>'}
            </ul>
        </div>
        ${pendingHTML}`;
    return secCard;
}

// Inventory Render
function renderInventory() {
    const container = document.getElementById('sectors-container');
    container.innerHTML = '';

    const groups = appData.sectorGroups || [];
    const ungrouped = appData.sectors.filter(s => !s.groupId);

    renderInventoryChips();
    const { q: _invQ, groupId: _invGrp } = window.searchState.inventory;
    const invQuery = _invQ.toLowerCase().trim();
    const sectorMatchesSearch = (sec) => {
        if (!invQuery) return true;
        if (sec.name.toLowerCase().includes(invQuery)) return true;
        return (sec.materials || []).some(m => m.name.toLowerCase().includes(invQuery));
    };

    // Render gruppi
    groups.forEach((grp, grpIndex) => {
        if (_invGrp && String(grp.id) !== String(_invGrp)) return;
        const grpSectors = appData.sectors
            .filter(s => String(s.groupId) === String(grp.id))
            .filter(sectorMatchesSearch);
        if (invQuery && grpSectors.length === 0) return;
        const isGrpFirst = grpIndex === 0;
        const isGrpLast = grpIndex === groups.length - 1;
        const grpEditBtn = currentRole === 'admin' ? `<button class="btn-icon admin-only" onclick="openEditGroupModal(event,${grp.id})" title="Rinomina"><span class="material-symbols-outlined" style="font-size:18px;">edit</span></button>` : '';
        const grpDelBtn  = currentRole === 'admin' ? `<button class="btn-icon admin-only" onclick="deleteGroup(${grp.id})" title="Elimina Settore"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>` : '';
        const grpUpBtn   = currentRole === 'admin' ? `<button class="btn-icon admin-only" onclick="moveGroup(${grp.id},-1)" ${isGrpFirst ? 'disabled style="opacity:0.3;"' : ''}><span class="material-symbols-outlined" style="font-size:18px;">arrow_upward</span></button>` : '';
        const grpDownBtn = currentRole === 'admin' ? `<button class="btn-icon admin-only" onclick="moveGroup(${grp.id},1)" ${isGrpLast ? 'disabled style="opacity:0.3;"' : ''}><span class="material-symbols-outlined" style="font-size:18px;">arrow_downward</span></button>` : '';

        const grpEl = document.createElement('div');
        grpEl.className = 'sector-group';
        grpEl.innerHTML = `
            <div class="sector-group-header" onclick="toggleGroup(this, event, ${grp.id})">
                <h3>
                    <span class="material-symbols-outlined group-chevron ${getAccordionState().groups[String(grp.id)] ? 'open' : ''}">chevron_right</span>
                    <span class="material-symbols-outlined">folder</span>
                    ${escHtml(grp.name)}
                    <span class="mat-count-badge" style="background:rgba(255,255,255,0.2); color:white; border-color:rgba(255,255,255,0.3);">${grpSectors.length} settori</span>
                </h3>
                <div style="display:flex; gap:4px; align-items:center;" onclick="event.stopPropagation()">
                    ${grpUpBtn}${grpDownBtn}${grpEditBtn}${grpDelBtn}
                </div>
            </div>
            <div class="sector-group-body ${getAccordionState().groups[String(grp.id)] ? '' : 'collapsed'}"></div>`;

        const body = grpEl.querySelector('.sector-group-body');
        if (grpSectors.length === 0) {
            body.innerHTML = '<p style="padding:16px; color:var(--text-muted); font-size:0.85rem;">Nessun reparto in questo settore.</p>';
        } else {
            grpSectors.forEach((sec, i) => body.appendChild(buildSectorCard(sec, i, grpSectors, invQuery)));
        }
        container.appendChild(grpEl);
    });

    // Reparti senza settore
    if (!_invGrp) {
        const filtUngrouped = ungrouped.filter(sectorMatchesSearch);
        filtUngrouped.forEach((sec, i) => container.appendChild(buildSectorCard(sec, i, filtUngrouped, invQuery)));
    }

    if (appData.sectors.length === 0 && groups.length === 0) {
        container.innerHTML = '<p style="padding:16px; color:var(--text-muted);">Nessun reparto registrato.</p>';
    } else if ((invQuery || _invGrp) && container.children.length === 0) {
        container.innerHTML = '<p class="search-no-results"><span class="material-symbols-outlined" style="font-size:36px;display:block;margin-bottom:8px;opacity:0.4;">search_off</span>Nessun risultato trovato.</p>';
    }
}

window.openRestockModal = function(secId, matId) {
    const sec = appData.sectors.find(s => s.id === secId);
    const mat = sec && (sec.materials || []).find(m => m.id === matId);
    if (!sec || !mat) { showToast('Materiale non trovato.', 'error'); return; }
    openModal(`Richiesta: ${escHtml(mat.name)}`, `
        <div class="form-group">
            <label>Giacenza Attuale <span style="color:var(--text-muted); font-weight:400;">(aggiorna il magazzino)</span></label>
            <input type="number" id="restock-current" class="form-control" value="${mat.available}" min="0">
        </div>
        <div class="form-group">
            <label>Quantità da Richiedere</label>
            <input type="number" id="restock-qty" class="form-control" value="1" min="1">
        </div>
        <div class="form-group">
            <label>Dettagli / Note</label>
            <textarea id="restock-notes" class="form-control" rows="2" placeholder="Es. Urgente, per evento di sabato, marca specifica..."></textarea>
        </div>
        <div class="form-group">
            <label>Link Prodotto <span style="color:var(--text-muted); font-weight:400;">(opzionale)</span></label>
            <input type="url" id="restock-url" class="form-control" placeholder="https://...">
        </div>
        <button class="btn primary" onclick="requestRestock(${secId}, ${matId})" style="width:100%; justify-content:center;">
            <span class="material-symbols-outlined" style="font-size:16px;">add_shopping_cart</span> Invia Richiesta
        </button>
    `);
    setTimeout(() => { const el = document.getElementById('restock-qty'); if(el) el.focus(); }, 50);
}

window.requestRestock = function(secId, matId) {
    if (appData.settings && appData.settings.blockRequests) {
        showToast('Le richieste sono bloccate dall\'amministratore.', 'error');
        return;
    }
    const qty = parseInt(document.getElementById('restock-qty').value);
    const currentStock = parseInt(document.getElementById('restock-current').value);
    const notes = document.getElementById('restock-notes').value.trim();
    const url = document.getElementById('restock-url').value.trim();
    if(qty > 0) {
        const sec = appData.sectors.find(s => s.id === secId);
        const mat = sec && (sec.materials || []).find(m => m.id === matId);
        if (!sec || !mat) { showToast('Errore: materiale non trovato.', 'error'); return; }
        if (!isNaN(currentStock) && currentStock !== mat.available) {
            mat.available = currentStock;
            mat.total = Math.max(mat.total, currentStock);
        }
        const confirmCode = generateReqCode();
        appData.notifications.push({
            id: generateId(), secId, matId,
            matName: mat.name, sectorName: sec.name,
            qty: qty, reqBy: currentUsername || currentRole,
            notes: notes, url: url,
            confirmCode: confirmCode,
            date: new Date().toLocaleDateString('it-IT')
        });
        saveData();
        modal.classList.add('hidden');
        showToast(`Richiesta inoltrata: ${qty}x ${mat.name} — Codice: ${confirmCode}`, 'success');

        sendTelegramNotification(
            `🔔 <b>Nuova Richiesta Materiale</b>\n\n` +
            `📦 <b>Reparto:</b> ${sec.name}\n` +
            `🏷️ <b>Materiale:</b> ${mat.name}\n` +
            `🔢 <b>Quantità:</b> ${qty}\n` +
            `👤 <b>Richiesto da:</b> ${currentUsername || currentRole}\n` +
            `🔖 <b>Codice:</b> ${confirmCode}\n` +
            (notes ? `📝 <b>Note:</b> ${notes}\n` : '') +
            (url ? `🔗 <b>Link:</b> ${url}\n` : '') +
            `\n⏰ ${new Date().toLocaleString('it-IT')}`,
            TELEGRAM_CONFIG.botTokenMagazzino,
            TELEGRAM_CONFIG.chatIdAdmin
        );
    }
}

// Modals Setup
const modal = document.getElementById('modal-container');
const btnCloseModal = document.getElementById('btn-close-modal');
const modalTitle = document.getElementById('modal-title');
const modalBody = document.getElementById('modal-body');

function openModal(title, content) {
    modalTitle.textContent = title;
    modalBody.innerHTML = content;
    modal.classList.remove('hidden');
}
btnCloseModal.addEventListener('click', () => modal.classList.add('hidden'));

// Admin Actions for Inventory
document.getElementById('btn-add-sector').addEventListener('click', () => {
    const groups = appData.sectorGroups || [];
    const grpOpts = groups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('');
    const grpSelect = groups.length > 0 ? `
        <div class="form-group">
            <label>Settore <span style="color:var(--text-muted); font-weight:400;">(opzionale)</span></label>
            <select id="sec-group" class="form-control">
                <option value="">-- Nessun settore --</option>
                ${grpOpts}
            </select>
        </div>` : '';
    const responsabili = (appData.registeredUsers || []).filter(u => u.role === 'responsabile');
    let opts = `<option value="">-- Nessuno --</option>` + responsabili.map(u => { const n=`${u.firstName} ${u.lastName}`; return `<option value="${escHtml(n)}">${escHtml(n)}</option>`; }).join('');
    openModal("Nuovo Reparto", `
        <div class="form-group"><label>Nome Reparto</label><input type="text" id="sec-name" class="form-control"></div>
        <div class="form-group"><label>Responsabile Assegnato</label><select id="sec-mgr" class="form-control">${opts}</select></div>
        ${grpSelect}
        <button class="btn primary" onclick="addSector()">Salva Reparto</button>
    `);
});

document.getElementById('btn-add-group').addEventListener('click', () => {
    openModal("Nuovo Settore", `
        <div class="form-group"><label>Nome Settore</label><input type="text" id="grp-name" class="form-control" placeholder="Es. Animazione, Cucina, Tecnico..."></div>
        <button class="btn primary" onclick="addGroup()" style="width:100%; justify-content:center;">Salva Settore</button>
    `);
});

window.addSector = function() {
    const name = document.getElementById('sec-name').value.trim();
    if (!name) { showToast('Inserisci un nome per il reparto.', 'error'); return; }
    const grpEl = document.getElementById('sec-group');
    const groupId = grpEl ? (parseInt(grpEl.value) || null) : null;
    appData.sectors.push({
        id: generateId(), name: name,
        manager: document.getElementById('sec-mgr').value,
        groupId: groupId,
        activities: []
    });
    saveData(); renderInventory(); modal.classList.add('hidden');
}

window.addGroup = function() {
    const name = document.getElementById('grp-name').value.trim();
    if (!name) { showToast('Inserisci un nome per il settore.', 'error'); return; }
    if (!appData.sectorGroups) appData.sectorGroups = [];
    appData.sectorGroups.push({ id: generateId(), name: name });
    saveData(); renderInventory(); modal.classList.add('hidden');
}

window.toggleGroup = function(headerEl, event, grpId) {
    if (event) event.stopPropagation();
    const body = headerEl.parentElement.querySelector('.sector-group-body');
    const chevron = headerEl.querySelector('.group-chevron');
    if (!body) return;
    const isOpen = !body.classList.contains('collapsed');
    body.classList.toggle('collapsed', isOpen);
    if (chevron) chevron.classList.toggle('open', !isOpen);
    if (grpId != null) {
        const state = getAccordionState();
        state.groups[String(grpId)] = !isOpen;
        saveAccordionState(state);
    }
}

window.openEditGroupModal = function(event, grpId) {
    event.stopPropagation();
    const groups = appData.sectorGroups || [];
    const grp = groups.find(g => String(g.id) === String(grpId));
    if (!grp) return;
    openModal("Modifica Settore", `
        <div class="form-group"><label>Nome Settore</label><input type="text" id="edit-grp-name" class="form-control" value="${escHtml(grp.name)}"></div>
        <button class="btn primary" onclick="saveGroupEdit(${grpId})" style="width:100%; justify-content:center;">Salva Modifiche</button>
    `);
}

window.saveGroupEdit = function(grpId) {
    const groups = appData.sectorGroups || [];
    const grp = groups.find(g => String(g.id) === String(grpId));
    if (!grp) return;
    const name = document.getElementById('edit-grp-name').value.trim();
    if (!name) { showToast('Il nome del settore non può essere vuoto.', 'error'); return; }
    grp.name = name;
    saveData(); renderInventory(); modal.classList.add('hidden');
}

window.deleteGroup = function(grpId) {
    if (!confirm('Eliminare il settore? I reparti al suo interno diventeranno non raggruppati.')) return;
    appData.sectorGroups = (appData.sectorGroups || []).filter(g => String(g.id) !== String(grpId));
    appData.sectors.forEach(s => { if (String(s.groupId) === String(grpId)) s.groupId = null; });
    saveData(); renderInventory();
}

window.moveGroup = function(grpId, direction) {
    const groups = appData.sectorGroups || [];
    const index = groups.findIndex(g => String(g.id) === String(grpId));
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= groups.length) return;
    const tmp = groups[index];
    groups[index] = groups[newIndex];
    groups[newIndex] = tmp;
    saveData(); renderInventory();
}


window.openAddMaterialModal = function(secId) {
    if (appData.settings && appData.settings.blockRequests && currentRole !== 'admin') {
        showToast('Le richieste sono bloccate. Non è possibile aggiungere materiali.', 'error');
        return;
    }
    openModal("Nuovo Materiale", `
        <div class="form-group"><label>Nome Materiale</label><input type="text" id="mat-name" class="form-control"></div>
        <div class="form-group">
            <label>Stato del Materiale</label>
            <div class="radio-group-material">
                <label class="radio-opt">
                    <input type="radio" name="mat-status" value="nessuno" checked onchange="updateMatQtyLabel()">
                    <span>Non ho il materiale — devo richiederlo</span>
                </label>
                <label class="radio-opt">
                    <input type="radio" name="mat-status" value="integra" onchange="updateMatQtyLabel()">
                    <span>Ho materiale ma devo integrarlo</span>
                </label>
                <label class="radio-opt">
                    <input type="radio" name="mat-status" value="disponibile" onchange="updateMatQtyLabel()">
                    <span>Ho già il materiale in magazzino</span>
                </label>
            </div>
        </div>
        <div class="form-group">
            <label id="mat-qty-label">Giacenza Iniziale</label>
            <input type="number" id="mat-qty" class="form-control" value="0" min="0">
        </div>
        <div class="form-group hidden" id="mat-req-qty-group">
            <label>Quantità da Richiedere</label>
            <input type="number" id="mat-req-qty" class="form-control" value="1" min="1">
        </div>
        <div class="form-group">
            <label>Dettagli / Note <span style="color:var(--text-muted); font-weight:400;">(opzionale)</span></label>
            <textarea id="mat-details" class="form-control" rows="2" placeholder="Es. Marca, specifiche tecniche, dove trovarlo..."></textarea>
        </div>
        <div class="form-group hidden" id="mat-url-group">
            <label>Link Prodotto <span style="color:var(--text-muted); font-weight:400;">(opzionale)</span></label>
            <input type="url" id="mat-url" class="form-control" placeholder="https://...">
        </div>
        <button class="btn primary" onclick="addMaterial(${secId})" style="width:100%; justify-content:center;">Salva Materiale</button>
    `);
    setTimeout(updateMatQtyLabel, 50);
}

window.updateMatQtyLabel = function() {
    const status = document.querySelector('input[name="mat-status"]:checked').value;
    const label = document.getElementById('mat-qty-label');
    const reqGroup = document.getElementById('mat-req-qty-group');
    const urlGroup = document.getElementById('mat-url-group');
    const qtyField = document.getElementById('mat-qty');
    if (status === 'disponibile') {
        if (label) label.textContent = 'Giacenza';
        if (qtyField) { qtyField.value = qtyField.value || 0; qtyField.removeAttribute('readonly'); }
        if (reqGroup) reqGroup.classList.add('hidden');
        if (urlGroup) urlGroup.classList.add('hidden');
    } else if (status === 'integra') {
        if (label) label.textContent = 'Giacenza Attuale';
        if (qtyField) qtyField.removeAttribute('readonly');
        if (reqGroup) reqGroup.classList.remove('hidden');
        if (urlGroup) urlGroup.classList.remove('hidden');
    } else {
        if (label) label.textContent = 'Quantità in giacenza';
        if (qtyField) { qtyField.value = 0; qtyField.setAttribute('readonly', true); }
        if (reqGroup) reqGroup.classList.remove('hidden');
        if (urlGroup) urlGroup.classList.remove('hidden');
    }
}

window.addMaterial = function(secId) {
    if (appData.settings && appData.settings.blockRequests && currentRole !== 'admin') {
        showToast('Le richieste sono bloccate. Non è possibile aggiungere materiali.', 'error');
        return;
    }
    const name = document.getElementById('mat-name').value.trim();
    if (!name) { showToast('Inserisci un nome per il materiale.', 'error'); return; }
    const qty    = parseInt(document.getElementById('mat-qty').value) || 0;
    const reqQty = parseInt(document.getElementById('mat-req-qty')?.value) || 0;
    const statusEl = document.querySelector('input[name="mat-status"]:checked');
    if (!statusEl) { showToast('Seleziona lo stato del materiale.', 'error'); return; }
    const status = statusEl.value;
    const sec = appData.sectors.find(s => s.id === secId);
    if (!sec) { showToast('Reparto non trovato.', 'error'); return; }
    if (!sec.materials) sec.materials = [];

    const initialStock = (status === 'disponibile' || status === 'integra') ? qty : 0;
    const newMat = {
        id: generateId(), name,
        total: initialStock, available: initialStock,
        details: document.getElementById('mat-details').value.trim()
    };
    sec.materials.push(newMat);

    const needsRequest = status === 'integra' || status === 'nessuno';
    const requestedQty = status === 'integra' ? reqQty : qty || 1;
    const matUrl = document.getElementById('mat-url')?.value.trim() || '';

    if (needsRequest && requestedQty > 0) {
        const confirmCode = generateReqCode();
        appData.notifications.push({
            id: generateId(), secId, matId: newMat.id,
            matName: name, sectorName: sec.name,
            qty: requestedQty, reqBy: currentUsername || currentRole,
            notes: newMat.details || '', url: matUrl,
            confirmCode, date: new Date().toLocaleDateString('it-IT')
        });
        sendTelegramNotification(
            `🛒 <b>${status === 'nessuno' ? 'Materiale Mancante — Richiesta' : 'Integrazione Materiale'}</b>\n\n` +
            `📦 <b>Reparto:</b> ${sec.name}\n` +
            `🏷️ <b>Materiale:</b> ${name}\n` +
            `🔢 <b>Quantità Richiesta:</b> ${requestedQty}\n` +
            (status === 'integra' ? `📊 <b>Giacenza Attuale:</b> ${qty}\n` : '') +
            `👤 <b>Da:</b> ${currentUsername || currentRole}\n` +
            `🔖 <b>Codice:</b> ${confirmCode}\n` +
            (matUrl ? `🔗 <b>Link:</b> ${matUrl}\n` : '') +
            `\n⏰ ${new Date().toLocaleString('it-IT')}`,
            TELEGRAM_CONFIG.botTokenMagazzino,
            TELEGRAM_CONFIG.chatIdAdmin
        );
        showToast(`Materiale aggiunto — richiesta inviata. Codice: ${confirmCode}`, 'success');
    } else {
        if (currentRole !== 'admin') {
            sendTelegramNotification(
                `✅ <b>Nuovo Materiale Aggiunto</b>\n\n` +
                `📦 <b>Reparto:</b> ${sec.name}\n` +
                `🏷️ <b>Materiale:</b> ${name}\n` +
                `🔢 <b>Giacenza:</b> ${qty}\n` +
                `👤 <b>Da:</b> ${currentUsername || currentRole}\n\n` +
                `⏰ ${new Date().toLocaleString('it-IT')}`,
                TELEGRAM_CONFIG.botTokenMagazzino,
                TELEGRAM_CONFIG.chatIdAdmin
            );
        }
        showToast('Materiale aggiunto con successo.', 'success');
    }

    saveData(); renderInventory(); modal.classList.add('hidden');
}

window.deleteMaterial = function(secId, matId) {
    if(confirm("Eliminare definitivamente questo materiale?")) {
        const sec = appData.sectors.find(s => String(s.id) === String(secId));
        if (!sec) return;
        sec.materials = (sec.materials || []).filter(m => String(m.id) !== String(matId));
        saveData(); renderInventory();
    }
}

window.deleteSector = function(secId) {
    if(confirm("ATTENZIONE: Eliminare l'intero reparto e tutti i suoi materiali? L'azione è irreversibile.")) {
        appData.sectors = appData.sectors.filter(s => String(s.id) !== String(secId));
        saveData(); renderInventory();
    }
}

window.moveSector = function(secId, direction) {
    const index = appData.sectors.findIndex(s => String(s.id) === String(secId));
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= appData.sectors.length) return;
    const tmp = appData.sectors[index];
    appData.sectors[index] = appData.sectors[newIndex];
    appData.sectors[newIndex] = tmp;
    saveData();
    renderInventory();
}

// ===== EDIT FUNCTIONS (Admin Only) =====

// Edit Sector
window.openEditSectorModal = function(event, secId) {
    event.stopPropagation();
    const sec = appData.sectors.find(s => String(s.id) === String(secId));
    if (!sec) return;
    const responsabili = (appData.registeredUsers || []).filter(u => u.role === 'responsabile');
    let opts = `<option value="">-- Nessuno --</option>` + responsabili.map(u => { const n=`${u.firstName} ${u.lastName}`; return `<option value="${escHtml(n)}" ${n === sec.manager ? 'selected' : ''}>${escHtml(n)}</option>`; }).join('');
    if (sec.manager && !responsabili.find(u => `${u.firstName} ${u.lastName}` === sec.manager)) {
        opts = `<option value="${escHtml(sec.manager)}" selected>${escHtml(sec.manager)}</option>` + opts;
    }
    const groups = appData.sectorGroups || [];
    const grpOpts = groups.map(g => `<option value="${g.id}" ${String(g.id) === String(sec.groupId) ? 'selected' : ''}>${escHtml(g.name)}</option>`).join('');
    const grpSelect = groups.length > 0 ? `
        <div class="form-group">
            <label>Settore <span style="color:var(--text-muted); font-weight:400;">(opzionale)</span></label>
            <select id="edit-sec-group" class="form-control">
                <option value="" ${!sec.groupId ? 'selected' : ''}>-- Nessun settore --</option>
                ${grpOpts}
            </select>
        </div>` : '';
    openModal("Modifica Reparto", `
        <div class="form-group"><label>Nome Reparto</label><input type="text" id="edit-sec-name" class="form-control" value="${escHtml(sec.name)}"></div>
        <div class="form-group"><label>Responsabile Assegnato</label><select id="edit-sec-mgr" class="form-control">${opts}</select></div>
        ${grpSelect}
        <button class="btn primary" onclick="saveSectorEdit(${secId})">Salva Modifiche</button>
    `);
}
window.saveSectorEdit = function(secId) {
    const sec = appData.sectors.find(s => String(s.id) === String(secId));
    if (!sec) return;
    const name = document.getElementById('edit-sec-name').value.trim();
    if (!name) { showToast('Il nome del reparto non può essere vuoto.', 'error'); return; }
    sec.name = name;
    sec.manager = document.getElementById('edit-sec-mgr').value;
    const grpEl = document.getElementById('edit-sec-group');
    if (grpEl) sec.groupId = parseInt(grpEl.value) || null;
    saveData(); renderInventory(); modal.classList.add('hidden');
}

// Edit Material
window.openEditMaterialModal = function(event, secId, matId) {
    event.stopPropagation();
    const sec = appData.sectors.find(s => String(s.id) === String(secId));
    if (!sec) return;
    const mat = (sec.materials || []).find(m => String(m.id) === String(matId));
    if (!mat) return;
    openModal("Modifica Materiale", `
        <div class="form-group"><label>Nome Materiale</label><input type="text" id="edit-mat-name" class="form-control" value="${escHtml(mat.name)}"></div>
        <div class="form-group"><label>Giacenza Totale</label><input type="number" id="edit-mat-total" class="form-control" value="${mat.total}"></div>
        <div class="form-group"><label>Disponibili</label><input type="number" id="edit-mat-avail" class="form-control" value="${mat.available}"></div>
        <div class="form-group"><label>Dettagli / Note <span style="color:var(--text-muted); font-weight:400;">(opzionale)</span></label><textarea id="edit-mat-details" class="form-control" rows="2" placeholder="Es. Marca, specifiche, dove trovarlo...">${escHtml(mat.details || '')}</textarea></div>
        <button class="btn primary" onclick="saveMaterialEdit(${secId}, ${matId})" style="width:100%; justify-content:center;">Salva Modifiche</button>
    `);
}
window.saveMaterialEdit = function(secId, matId) {
    const sec = appData.sectors.find(s => String(s.id) === String(secId));
    if (!sec) return;
    const mat = (sec.materials || []).find(m => String(m.id) === String(matId));
    if (!mat) return;
    const name = document.getElementById('edit-mat-name').value.trim();
    if (!name) { showToast('Il nome del materiale non può essere vuoto.', 'error'); return; }
    const total = parseInt(document.getElementById('edit-mat-total').value) || 0;
    const available = parseInt(document.getElementById('edit-mat-avail').value) || 0;
    if (available > total) { showToast('I disponibili non possono superare la giacenza totale.', 'error'); return; }
    mat.name = name; mat.total = total; mat.available = available;
    mat.details = document.getElementById('edit-mat-details').value.trim();
    saveData(); renderInventory(); modal.classList.add('hidden');
}

// Staff (Responsabili) — dynamic from registeredUsers
function renderStaff() {
    const container = document.getElementById('staff-cards');
    if (!container) return;
    renderStaffChips();
    const staffQ = (window.searchState.staff.q || '').toLowerCase().trim();
    let responsabili = (appData.registeredUsers || []).filter(u => u.role === 'responsabile');
    if (staffQ) {
        responsabili = responsabili.filter(u =>
            `${u.firstName} ${u.lastName}`.toLowerCase().includes(staffQ) ||
            (u.email || '').toLowerCase().includes(staffQ)
        );
    }
    if (responsabili.length === 0 && staffQ) {
        container.innerHTML = '<p class="search-no-results" style="grid-column:1/-1"><span class="material-symbols-outlined" style="font-size:36px;display:block;margin-bottom:8px;opacity:0.4;">search_off</span>Nessun responsabile trovato.</p>';
        return;
    }
    if (responsabili.length === 0) {
        container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;grid-column:1/-1;">
            Nessun responsabile assegnato. Assegna il ruolo "Responsabile" nella sezione <strong>Utenti</strong>.
        </p>`;
        return;
    }
    container.innerHTML = responsabili.map(u => {
        const fullName = `${u.firstName} ${u.lastName}`;
        const assignedGroups = (appData.sectorGroups || []).filter(g => g.manager === fullName);
        const groupBadges = assignedGroups.length > 0
            ? assignedGroups.map(g => `<span class="sector-tag">${escHtml(g.name)}</span>`).join('')
            : `<span style="font-size:0.75rem;color:var(--text-muted);font-style:italic;">Nessun settore assegnato</span>`;
        const adminBtn = currentRole === 'admin'
            ? `<button class="btn-secondary" style="font-size:0.78rem;padding:4px 10px;margin-top:4px;" onclick="openAssignGroupsModal(${u.id})">
                <span class="material-symbols-outlined" style="font-size:14px;">edit</span> Assegna settori
               </button>`
            : '';
        return `
        <div class="card staff-card" draggable="true" data-id="${u.id}" style="padding:16px;display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--secondary));display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.85rem;flex-shrink:0;">
                    ${escHtml((u.firstName||'?')[0])}${escHtml((u.lastName||'?')[0])}
                </div>
                <div style="min-width:0;flex:1;">
                    <div style="font-weight:600;font-size:0.9rem;word-break:break-word;">${escHtml(u.firstName)} ${escHtml(u.lastName)}</div>
                    <div style="font-size:0.78rem;color:var(--text-muted);word-break:break-all;">${escHtml(u.email)}</div>
                </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:5px;min-height:20px;">${groupBadges}</div>
            ${adminBtn}
        </div>`;
    }).join('');

    // Drag-and-drop reordering
    let dragSrc = null;
    container.querySelectorAll('.staff-card').forEach(card => {
        card.addEventListener('dragstart', () => {
            dragSrc = card;
            card.classList.add('dragging');
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
            container.querySelectorAll('.staff-card').forEach(c => c.classList.remove('drag-over'));
        });
        card.addEventListener('dragover', e => {
            e.preventDefault();
            if (card !== dragSrc) card.classList.add('drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
        card.addEventListener('drop', e => {
            e.preventDefault();
            card.classList.remove('drag-over');
            if (dragSrc && dragSrc !== card) {
                const cards = [...container.querySelectorAll('.staff-card')];
                const srcIdx = cards.indexOf(dragSrc);
                const dstIdx = cards.indexOf(card);
                if (srcIdx < dstIdx) container.insertBefore(dragSrc, card.nextSibling);
                else container.insertBefore(dragSrc, card);
            }
        });
    });
}

window.openAssignGroupsModal = function(userId) {
    if (currentRole !== 'admin') return;
    const user = (appData.registeredUsers || []).find(u => u.id === userId);
    if (!user) return;
    const fullName = `${user.firstName} ${user.lastName}`;
    const groups = appData.sectorGroups || [];
    if (groups.length === 0) { showToast('Nessun settore disponibile. Creane uno prima.', 'error'); return; }
    const checkboxes = groups.map(g => `
        <label style="display:flex;align-items:center;gap:10px;padding:8px 4px;cursor:pointer;border-bottom:1px solid var(--border);">
            <input type="checkbox" class="group-assign-check" value="${g.id}" ${g.manager === fullName ? 'checked' : ''} style="width:16px;height:16px;flex-shrink:0;">
            <span style="font-size:0.9rem;">${escHtml(g.name)}</span>
        </label>`).join('');
    openModal(`Settori di ${escHtml(user.firstName)} ${escHtml(user.lastName)}`, `
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">Seleziona i settori che questo responsabile gestirà.</p>
        <div style="margin-bottom:16px;">${checkboxes}</div>
        <button class="btn primary" onclick="saveAssignedGroups(${userId})" style="width:100%;justify-content:center;">Salva</button>
    `);
};

window.saveAssignedGroups = function(userId) {
    if (currentRole !== 'admin') return;
    const user = (appData.registeredUsers || []).find(u => u.id === userId);
    if (!user) return;
    const fullName = `${user.firstName} ${user.lastName}`;
    const selected = new Set(
        Array.from(document.querySelectorAll('.group-assign-check:checked')).map(cb => Number(cb.value))
    );
    (appData.sectorGroups || []).forEach(g => {
        if (selected.has(g.id)) {
            g.manager = fullName;
        } else if (g.manager === fullName) {
            g.manager = '';
        }
    });
    saveData();
    modal.classList.add('hidden');
    showToast(`Gruppi aggiornati per ${user.firstName}.`, 'success');
};


// ==========================================
// REGISTERED USERS PANEL (Admin only)
// ==========================================
const ROLE_LABELS = { admin: 'Capo Equipe', responsabile: 'Responsabile', animatore: 'Animatore', operatore: 'Operatore' };
const ROLE_COLORS = { admin: 'var(--danger)', responsabile: 'var(--primary)', animatore: 'var(--secondary)', operatore: 'var(--accent)' };

function renderRegisteredUsers() {
    const approvedContainer = document.getElementById('registered-users-list');
    const blockedContainer  = document.getElementById('blocked-users-list');
    const blockedSection    = document.getElementById('blocked-users-section');
    if (!approvedContainer) return;

    wireUsersSearch();
    const users   = appData.registeredUsers || [];
    const blocked = appData.blockedEmails   || [];
    const usersQ    = (window.searchState.users.q || '').toLowerCase().trim();
    const usersRole = window.searchState.users.role || '';
    let sorted = [...users].sort((a, b) => (a.lastName || '').localeCompare(b.lastName || ''));
    if (usersQ) sorted = sorted.filter(u => `${u.firstName} ${u.lastName}`.toLowerCase().includes(usersQ) || (u.email || '').toLowerCase().includes(usersQ));
    if (usersRole) sorted = sorted.filter(u => u.role === usersRole);

    const countEl = document.getElementById('registered-users-count');
    if (countEl) countEl.textContent = users.length > 0 ? `${users.length} utenti · ${blocked.length} bloccati` : '';

    // Reset "select all" checkbox on re-render
    const selectAll = document.getElementById('select-all-users');
    if (selectAll) selectAll.checked = false;

    // Blocked section
    if (blockedSection) blockedSection.classList.toggle('hidden', blocked.length === 0);
    if (blockedContainer) {
        blockedContainer.innerHTML = blocked.length === 0 ? '' : blocked.map(email => {
            const user = users.find(u => u.email === email);
            const name = user ? `${escHtml(user.firstName)} ${escHtml(user.lastName)}` : '—';
            return `<div class="reg-user-row">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; font-size:0.9rem;">${name}</div>
                    <div style="font-size:0.77rem; color:var(--text-muted);">${escHtml(email)}</div>
                </div>
                <div style="display:flex; gap:6px; flex-shrink:0;">
                    <button class="btn-secondary" style="padding:5px 12px; font-size:0.78rem;" onclick="unblockUser('${escHtml(email)}')">
                        Sblocca
                    </button>
                    <button class="btn-icon delete" title="Elimina definitivamente" onclick="deleteBlockedEmail('${escHtml(email)}')">
                        <span class="material-symbols-outlined" style="font-size:18px;">delete_forever</span>
                    </button>
                </div>
            </div>`;
        }).join('');
    }

    // Active users section
    if (sorted.length === 0) {
        approvedContainer.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem; padding:8px 0;">Nessun utente registrato.</p>';
        return;
    }
    approvedContainer.innerHTML = sorted.map(u => {
        const lastLogin = u.lastLogin ? new Date(u.lastLogin).toLocaleDateString('it-IT') : '—';
        return `<div class="reg-user-row">
            <div style="display:flex; align-items:center; gap:10px; flex:1; min-width:0;">
                <input type="checkbox" class="user-email-checkbox" data-email="${escHtml(u.email)}" style="flex-shrink:0; width:16px; height:16px;">
                <div style="min-width:0;">
                    <div style="font-weight:600; font-size:0.9rem;">${escHtml(u.firstName)} ${escHtml(u.lastName)}</div>
                    <div style="font-size:0.77rem; color:var(--text-muted);">${escHtml(u.email)}</div>
                    <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Ultimo accesso: ${lastLogin}</div>
                </div>
            </div>
            <div style="display:flex; align-items:center; gap:8px; flex-shrink:0; flex-wrap:wrap; justify-content:flex-end;">
                <select class="reg-user-role-select" onchange="changeUserRole(${u.id}, this.value)" style="border:1px solid ${ROLE_COLORS[u.role] || 'var(--border)'}; color:${ROLE_COLORS[u.role] || 'var(--text)'};">
                    <option value="animatore" ${u.role==='animatore'?'selected':''}>Animatore</option>
                    <option value="responsabile" ${u.role==='responsabile'?'selected':''}>Responsabile</option>
                    <option value="operatore" ${u.role==='operatore'?'selected':''}>Operatore</option>
                </select>
                <button class="btn-icon" onclick="deleteUserOnly('${escHtml(u._fbKey || String(u.id))}')" title="Elimina account (senza bloccare)" style="color:var(--text-muted);">
                    <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
                </button>
                <button class="btn-icon delete" onclick="deleteRegisteredUser(${u.id})" title="Rimuovi e blocca">
                    <span class="material-symbols-outlined" style="font-size:18px;">person_off</span>
                </button>
            </div>
        </div>`;
    }).join('');
}

window.changeUserRole = function(id, newRole) {
    if (currentRole !== 'admin') return;
    if (!appData.registeredUsers) return;
    const user = appData.registeredUsers.find(u => u.id === id);
    if (!user) return;
    const wasResponsabile = user.role === 'responsabile';
    user.role = newRole;
    // If downgraded from responsabile, clear their name from sector managers
    if (wasResponsabile && newRole !== 'responsabile') {
        const fullName = `${user.firstName} ${user.lastName}`;
        (appData.sectors || []).forEach(sec => { if (sec.manager === fullName) sec.manager = ''; });
        (appData.sectorGroups || []).forEach(grp => { if (grp.manager === fullName) grp.manager = ''; });
    }
    saveData();
    showToast(`Ruolo di ${user.firstName} aggiornato: ${ROLE_LABELS[newRole]}.`, 'success');
};

window.deleteRegisteredUser = function(id) {
    if (currentRole !== 'admin') return;
    const user = (appData.registeredUsers || []).find(u => u.id === id);
    if (!user) return;
    if (!confirm(`Rimuovere ${user.firstName} ${user.lastName}? La sua email verrà bloccata e non potrà più accedere.`)) return;
    if (user.role === 'responsabile') {
        const fullName = `${user.firstName} ${user.lastName}`;
        (appData.sectors || []).forEach(sec => { if (sec.manager === fullName) sec.manager = ''; });
        (appData.sectorGroups || []).forEach(grp => { if (grp.manager === fullName) grp.manager = ''; });
    }
    if (!appData.blockedEmails) appData.blockedEmails = [];
    if (!appData.blockedEmails.includes(user.email)) appData.blockedEmails.push(user.email);
    appData.registeredUsers = appData.registeredUsers.filter(u => u.id !== id);
    saveData();
    showToast(`${user.firstName} ${user.lastName} rimosso e bloccato.`, 'success');
};

window.deleteUserOnly = function(fbKey) {
    if (currentRole !== 'admin') return;
    const user = (appData.registeredUsers || []).find(u => (u._fbKey || String(u.id)) === fbKey);
    if (!user) return;
    if (!confirm(`Eliminare l'account di ${user.firstName} ${user.lastName}?\nL'email NON verrà bloccata (usa questa opzione per rimuovere un doppione).`)) return;
    // Rimuove solo il nodo esatto su Firebase — non tocca nessun altro utente
    db.ref(`appData/registeredUsers/${fbKey}`).remove();
    // Aggiorna l'array locale rimuovendo solo l'entry con questa chiave
    appData.registeredUsers = (appData.registeredUsers || []).filter(u => (u._fbKey || String(u.id)) !== fbKey);
    renderRegisteredUsers();
    renderStaff();
    showToast(`Account di ${user.firstName} ${user.lastName} eliminato.`, 'success');
};

window.openAddUserModal = function() {
    if (currentRole !== 'admin') return;
    openModal('Aggiungi Utente', `
        <div class="form-group">
            <label>Nome</label>
            <input id="add-user-firstname" class="form-control" type="text" placeholder="Es. Mario" autocomplete="off">
        </div>
        <div class="form-group">
            <label>Cognome</label>
            <input id="add-user-lastname" class="form-control" type="text" placeholder="Es. Rossi" autocomplete="off">
        </div>
        <div class="form-group">
            <label>Email</label>
            <input id="add-user-email" class="form-control" type="email" placeholder="Es. mario.rossi@email.it" autocomplete="off">
        </div>
        <div class="form-group">
            <label>Ruolo</label>
            <select id="add-user-role" class="form-control">
                <option value="animatore">Animatore</option>
                <option value="responsabile">Responsabile</option>
                <option value="operatore">Operatore</option>
            </select>
        </div>
        <p id="add-user-error" class="login-error hidden" style="margin-bottom:8px;">Compila tutti i campi con una email valida.</p>
        <button class="btn primary" onclick="saveNewUser()" style="width:100%; justify-content:center;">Salva</button>
    `);
    setTimeout(() => document.getElementById('add-user-firstname')?.focus(), 100);
};

window.saveNewUser = function() {
    if (currentRole !== 'admin') return;
    const firstName = (document.getElementById('add-user-firstname')?.value || '').trim();
    const lastName  = (document.getElementById('add-user-lastname')?.value || '').trim();
    const email     = (document.getElementById('add-user-email')?.value || '').trim().toLowerCase();
    const role      = document.getElementById('add-user-role')?.value || 'animatore';
    const errEl     = document.getElementById('add-user-error');

    if (!firstName || !lastName || !email || !email.includes('@')) {
        errEl.classList.remove('hidden'); return;
    }
    const existing = (appData.registeredUsers || []).find(u => u.email === email);
    if (existing) {
        errEl.textContent = 'Esiste già un utente con questa email.';
        errEl.classList.remove('hidden'); return;
    }
    const newUser = {
        id: generateId(),
        firstName, lastName, email, role,
        registeredAt: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
        privacyConsentAt: new Date().toISOString()
    };
    db.ref(`appData/registeredUsers/${newUser.id}`).set(newUser);
    modal.classList.add('hidden');
    showToast(`${firstName} ${lastName} aggiunto come ${ROLE_LABELS[role]}.`, 'success');
};

window.unblockUser = function(email) {
    if (currentRole !== 'admin') return;
    if (!confirm(`Sbloccare ${email}? Potrà accedere di nuovo come animatore.`)) return;
    appData.blockedEmails = (appData.blockedEmails || []).filter(e => e !== email);
    saveData();
    showToast(`${email} sbloccato.`, 'success');
};

window.deleteBlockedEmail = function(email) {
    if (currentRole !== 'admin') return;
    if (!confirm(`Eliminare definitivamente ${email} dalla lista bloccati? L'email non sarà più bloccata ma non verrà riabilitata.`)) return;
    appData.blockedEmails = (appData.blockedEmails || []).filter(e => e !== email);
    saveData();
    showToast(`${email} rimosso dalla lista bloccati.`, 'success');
};

window.toggleSelectAllUsers = function(cb) {
    document.querySelectorAll('.user-email-checkbox').forEach(el => { el.checked = cb.checked; });
};

window.sendEmailToSelected = function() {
    const checked = document.querySelectorAll('.user-email-checkbox:checked');
    const emails = Array.from(checked).map(cb => cb.dataset.email).filter(Boolean);
    if (emails.length === 0) { showToast('Seleziona almeno un utente.', 'error'); return; }
    window.location.href = `mailto:?bcc=${emails.join(',')}`;
};

// Events (Grid)
const daysMap  = ['mon','tue','wed','thu','fri','sat','sun'];
const daysMap2 = ['w2-mon','w2-tue','w2-wed','w2-thu','w2-fri','w2-sat','w2-sun'];
const daysIT   = ['Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato','Domenica'];

function getCurrentMonday() {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    return monday.toISOString().split('T')[0];
}

function getPlanningDates() {
    const start = (appData.settings && appData.settings.planningStartDate) || getCurrentMonday();
    if (!start) return null;
    const base = new Date(start + 'T00:00:00');
    const dates = [];
    for (let i = 0; i < 14; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        dates.push(d);
    }
    return dates;
}

function updatePlanningHeaders() {
    const dates = getPlanningDates();
    const allIds = [...daysMap, ...daysMap2];
    allIds.forEach((id, i) => {
        const el = document.getElementById(`dh-${id}`);
        if (!el) return;
        el.textContent = dates
            ? `${daysIT[i % 7]} ${dates[i].getDate().toString().padStart(2,'0')}/${(dates[i].getMonth()+1).toString().padStart(2,'0')}`
            : daysIT[i % 7];
    });
    const label = document.getElementById('planning-period-label');
    if (label && dates) {
        const fmt = d => `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}/${d.getFullYear()}`;
        label.textContent = `${fmt(dates[0])} — ${fmt(dates[13])}`;
    } else if (label) {
        label.textContent = 'Periodo non impostato';
    }
}

window.openSetPeriodModal = function() {
    const cur = appData.settings && appData.settings.planningStartDate || '';
    openModal('Imposta Periodo Bisettimanale', `
        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:12px;">Seleziona il <strong>lunedì</strong> di inizio del periodo. Le date di tutti i 14 giorni si calcoleranno automaticamente.</p>
        <div class="form-group">
            <label>Lunedì di inizio</label>
            <input type="date" id="period-start" class="form-control" value="${cur}">
        </div>
        <button class="btn primary" onclick="savePlanningPeriod()" style="width:100%;justify-content:center;">
            <span class="material-symbols-outlined" style="font-size:16px;">save</span> Salva Periodo
        </button>
    `);
}

window.savePlanningPeriod = function() {
    const val = document.getElementById('period-start').value;
    if (!val) { showToast('Seleziona una data.', 'error'); return; }
    if (!appData.settings) appData.settings = {};
    appData.settings.planningStartDate = val;
    saveData();
    modal.classList.add('hidden');
    updatePlanningHeaders();
    showToast('Periodo aggiornato!', 'success');
}

function renderEvents() {
    [...daysMap, ...daysMap2].forEach(d => {
        const el = document.getElementById(`events-${d}`);
        if (el) el.innerHTML = '';
    });
    updatePlanningHeaders();

    setTimeout(applyEventsDisplayFilter, 0);
    appData.events.forEach(ev => {
        const container = document.getElementById(`events-${ev.day}`);
        if(container) {
            const isAdmin = currentRole === 'admin';
            const editBtn = isAdmin ? `<span class="material-symbols-outlined edit-ev-btn admin-only" onclick="openEditEventModal(event, ${ev.id})" title="Modifica">edit</span>` : '';
            const delBtn = isAdmin ? `<span class="material-symbols-outlined delete-ev-btn admin-only" onclick="event.stopPropagation(); deleteEvent(${ev.id})">close</span>` : '';
            const isRest = ev.isRest;
            const hasDetails = ev.description || ev.staff || ev.notes;
            container.innerHTML += `
                <div class="event-box ${isAdmin ? 'admin-only-btn':''} ${isRest ? 'rest' : ''}" onclick="openEventDetail('${ev.id}')" style="cursor:pointer;">
                    ${editBtn}
                    ${delBtn}
                    <span class="t">${isRest ? '<span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; margin-right:4px;">hotel</span>' : ''}${ev.title}</span>
                    <div class="time"><span class="material-symbols-outlined" style="font-size:12px;">schedule</span> ${ev.time}</div>
                    <div class="loc"><span class="material-symbols-outlined" style="font-size:12px;">${isRest ? 'info' : 'location_on'}</span> ${ev.location}</div>
                    ${hasDetails ? '<div class="ev-has-details"><span class="material-symbols-outlined" style="font-size:11px;">info</span> dettagli</div>' : ''}
                </div>
            `;
        }
    });
}

window.openEventDetail = function(evId) {
    const ev = appData.events.find(e => String(e.id) === String(evId));
    if (!ev) return;
    const daysITMap = { mon:'Lunedì',tue:'Martedì',wed:'Mercoledì',thu:'Giovedì',fri:'Venerdì',sat:'Sabato',sun:'Domenica','w2-mon':'Lunedì (Sett.2)','w2-tue':'Martedì (Sett.2)','w2-wed':'Mercoledì (Sett.2)','w2-thu':'Giovedì (Sett.2)','w2-fri':'Venerdì (Sett.2)','w2-sat':'Sabato (Sett.2)','w2-sun':'Domenica (Sett.2)' };
    const isRest = ev.isRest;
    const isAdmin = currentRole === 'admin';
    openModal(ev.title, `
        <div class="event-detail">
            <div class="event-detail-row">
                <span class="material-symbols-outlined">calendar_today</span>
                <div><strong>Giorno</strong><p>${daysITMap[ev.day] || ev.day}</p></div>
            </div>
            <div class="event-detail-row">
                <span class="material-symbols-outlined">schedule</span>
                <div><strong>Orario</strong><p>${ev.time}</p></div>
            </div>
            <div class="event-detail-row">
                <span class="material-symbols-outlined">${isRest ? 'info' : 'location_on'}</span>
                <div><strong>${isRest ? 'Note' : 'Luogo'}</strong><p>${escHtml(ev.location)}</p></div>
            </div>
            ${ev.description ? `<div class="event-detail-row">
                <span class="material-symbols-outlined">description</span>
                <div><strong>Descrizione</strong><p>${escHtml(ev.description)}</p></div>
            </div>` : ''}
            ${ev.staff ? `<div class="event-detail-row">
                <span class="material-symbols-outlined">group</span>
                <div><strong>Staff Coinvolto</strong><p>${escHtml(ev.staff)}</p></div>
            </div>` : ''}
            ${ev.notes ? `<div class="event-detail-row">
                <span class="material-symbols-outlined">sticky_note_2</span>
                <div><strong>Note</strong><p>${escHtml(ev.notes)}</p></div>
            </div>` : ''}
            ${isAdmin ? `<div style="margin-top:20px;">
                <button class="btn primary" onclick="openEditEventModal(event, ${ev.id})" style="width:100%; justify-content:center;">
                    <span class="material-symbols-outlined" style="font-size:16px;">edit</span> Modifica Evento
                </button>
            </div>` : ''}
        </div>
    `);
}

// Edit Event
window.openEditEventModal = function(event, evId) {
    event.stopPropagation();
    const ev = appData.events.find(e => String(e.id) === String(evId));
    if (!ev) return;
    let opts = '<optgroup label="Settimana 1">';
    daysMap.forEach((d, i)  => opts += `<option value="${d}" ${d===ev.day?'selected':''}>Sett.1 — ${daysIT[i]}</option>`);
    opts += '</optgroup><optgroup label="Settimana 2">';
    daysMap2.forEach((d, i) => opts += `<option value="${d}" ${d===ev.day?'selected':''}>Sett.2 — ${daysIT[i]}</option>`);
    opts += '</optgroup>';
    openModal("Modifica Evento", `
        <div class="form-group"><label>Titolo</label><input type="text" id="edit-ev-title" class="form-control" value="${escHtml(ev.title)}"></div>
        <div class="form-group"><label>Giorno</label><select id="edit-ev-day" class="form-control">${opts}</select></div>
        <div class="form-group"><label>Ora</label><input type="time" id="edit-ev-time" class="form-control" value="${ev.time}"></div>
        <div class="form-group"><label>Luogo</label><input type="text" id="edit-ev-loc" class="form-control" value="${escHtml(ev.location)}"></div>
        <div class="form-group"><label>Descrizione</label><textarea id="edit-ev-desc" class="form-control" rows="3" placeholder="Descrizione dettagliata...">${escHtml(ev.description || '')}</textarea></div>
        <div class="form-group"><label>Staff Coinvolto</label><input type="text" id="edit-ev-staff" class="form-control" value="${escHtml(ev.staff || '')}" placeholder="Es. Mario Rossi, Giulia Bianchi"></div>
        <div class="form-group"><label>Note</label><input type="text" id="edit-ev-notes" class="form-control" value="${escHtml(ev.notes || '')}" placeholder="Note aggiuntive o istruzioni"></div>
        <button class="btn primary" onclick="saveEventEdit(${evId})" style="width:100%; justify-content:center;">Salva Modifiche</button>
    `);
}
window.saveEventEdit = function(evId) {
    const ev = appData.events.find(e => String(e.id) === String(evId));
    if (!ev) return;
    const title = document.getElementById('edit-ev-title').value.trim();
    const loc = document.getElementById('edit-ev-loc').value.trim();
    if (!title || !loc) { showToast('Titolo e luogo sono obbligatori.', 'error'); return; }
    ev.title = title;
    ev.day = document.getElementById('edit-ev-day').value;
    ev.time = document.getElementById('edit-ev-time').value;
    ev.location = loc;
    ev.description = document.getElementById('edit-ev-desc').value.trim();
    ev.staff = document.getElementById('edit-ev-staff').value.trim();
    ev.notes = document.getElementById('edit-ev-notes').value.trim();
    saveData(); renderEvents(); modal.classList.add('hidden');
}

window.deleteEvent = function(id) {
    if(confirm("Cancellare evento?")) { 
        appData.events = appData.events.filter(e => String(e.id) !== String(id)); 
        window.saveData(); 
    }
}

document.getElementById('btn-add-event').addEventListener('click', () => {
    let opts = '<optgroup label="Settimana 1">';
    daysMap.forEach((d, i)  => opts += `<option value="${d}">Sett.1 — ${daysIT[i]}</option>`);
    opts += '</optgroup><optgroup label="Settimana 2">';
    daysMap2.forEach((d, i) => opts += `<option value="${d}">Sett.2 — ${daysIT[i]}</option>`);
    opts += '</optgroup>';

    openModal("Aggiungi Evento", `
        <div class="form-group"><label>Titolo *</label><input type="text" id="ev-title" class="form-control"></div>
        <div class="form-group"><label>Giorno</label><select id="ev-day" class="form-control">${opts}</select></div>
        <div class="form-group"><label>Ora *</label><input type="time" id="ev-time" class="form-control"></div>
        <div class="form-group"><label>Luogo *</label><input type="text" id="ev-loc" class="form-control"></div>
        <div class="form-group"><label>Descrizione</label><textarea id="ev-desc" class="form-control" rows="3" placeholder="Descrizione dettagliata dell'evento..."></textarea></div>
        <div class="form-group"><label>Staff Coinvolto</label><input type="text" id="ev-staff" class="form-control" placeholder="Es. Mario Rossi, Giulia Bianchi"></div>
        <div class="form-group"><label>Note</label><input type="text" id="ev-notes" class="form-control" placeholder="Note aggiuntive o istruzioni speciali"></div>
        <button class="btn primary" onclick="addEvent()" style="width:100%; justify-content:center;">Salva in Calendario</button>
    `);
});

document.getElementById('btn-add-rest').addEventListener('click', () => {
    let optsDay = '<optgroup label="Settimana 1">';
    daysMap.forEach((d, i)  => optsDay += `<option value="${d}">Sett.1 — ${daysIT[i]}</option>`);
    optsDay += '</optgroup><optgroup label="Settimana 2">';
    daysMap2.forEach((d, i) => optsDay += `<option value="${d}">Sett.2 — ${daysIT[i]}</option>`);
    optsDay += '</optgroup>';
    
    openModal("Aggiungi Turno Riposo", `
        <div class="form-group"><label>Nome Animatore / Staff</label><input type="text" id="rest-staff" class="form-control" placeholder="Es. Marco (Miniclub)"></div>
        <div class="form-group"><label>Giorno</label><select id="rest-day" class="form-control">${optsDay}</select></div>
        <div class="form-group"><label>Orario / Turno</label><input type="text" id="rest-time" class="form-control" placeholder="Es. Mattina libera / Intera giornata"></div>
        <div class="form-group"><label>Note o Eccezioni</label><input type="text" id="rest-notes" class="form-control" placeholder="Es. Reperibile in caso di pioggia"></div>
        <button class="btn secondary" onclick="addRestEvent()" style="width:100%; justify-content:center; background-color:var(--text-muted); color:white;">Salva Turno di Riposo</button>
    `);
});

window.addRestEvent = function() {
    const staffName = document.getElementById('rest-staff').value.trim();
    if (!staffName) { showToast('Inserisci il nome dello staff.', 'error'); return; }
    appData.events.push({
        id: generateId(),
        title: `RIPOSO: ${staffName}`,
        day: document.getElementById('rest-day').value,
        time: document.getElementById('rest-time').value || "Giornata Intera",
        location: document.getElementById('rest-notes').value || "Nessuna eccezione",
        isRest: true
    });
    saveData(); renderEvents(); modal.classList.add('hidden');
}

window.addEvent = function() {
    const title = document.getElementById('ev-title').value.trim();
    const day = document.getElementById('ev-day').value;
    const time = document.getElementById('ev-time').value;
    const loc = document.getElementById('ev-loc').value.trim();
    if (!title || !time || !loc) { showToast('Compila tutti i campi obbligatori.', 'error'); return; }

    appData.events.push({
        id: generateId(),
        title: title,
        day: day,
        time: time,
        location: loc,
        description: document.getElementById('ev-desc').value.trim(),
        staff: document.getElementById('ev-staff').value.trim(),
        notes: document.getElementById('ev-notes').value.trim()
    });
    saveData(); renderEvents(); modal.classList.add('hidden');
    
    // Mappa per tradurre il giorno in italiano sulla notifica
    const daysITMap = { mon:'Lunedì',tue:'Martedì',wed:'Mercoledì',thu:'Giovedì',fri:'Venerdì',sat:'Sabato',sun:'Domenica','w2-mon':'Lunedì (Sett.2)','w2-tue':'Martedì (Sett.2)','w2-wed':'Mercoledì (Sett.2)','w2-thu':'Giovedì (Sett.2)','w2-fri':'Venerdì (Sett.2)','w2-sat':'Sabato (Sett.2)','w2-sun':'Domenica (Sett.2)' };
    
    // 🔔 Invia notifica Telegram al Gruppo Collaboratori
    sendTelegramNotification(
        `📅 <b>Nuovo Evento in Calendario</b>\n\n` +
        `🎭 <b>Titolo:</b> ${title}\n` +
        `📆 <b>Giorno:</b> ${daysITMap[day] || day}\n` +
        `⏰ <b>Orario:</b> ${time}\n` +
        `📍 <b>Luogo:</b> ${loc}\n\n` +
        `👤 <i>Aggiunto dall'Admin</i>`,
        TELEGRAM_CONFIG.botTokenEventi,
        TELEGRAM_CONFIG.chatIdGroup
    );
}

function getFileIcon(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (['jpg','jpeg','png','gif','webp','svg','bmp'].includes(ext)) return 'image';
    if (ext === 'pdf') return 'picture_as_pdf';
    if (['doc','docx'].includes(ext)) return 'description';
    if (['xls','xlsx','csv'].includes(ext)) return 'table_chart';
    if (['ppt','pptx'].includes(ext)) return 'slideshow';
    if (['zip','rar','7z'].includes(ext)) return 'folder_zip';
    if (['mp4','mov','avi','mkv'].includes(ext)) return 'video_file';
    if (['mp3','wav','aac'].includes(ext)) return 'audio_file';
    return 'attach_file';
}

// Global Stats (Dashboard)
function updateDashboardStats() {
    document.getElementById('stat-events-today').textContent = appData.events.length;
    document.getElementById('stat-total-staff').textContent = (appData.registeredUsers || []).filter(u => u.role === 'responsabile').length;
    document.getElementById('stat-total-requests').textContent = appData.notifications.length;
}

function renderDashboard() {
    updateDashboardStats();

    // ---- Titoli sezioni dinamici + pulsante rinomina (admin) ----
    const secNames = appData.dashboardSectionNames || {};
    const defaultNames = { avvisi: 'Avvisi', odg: 'Ordine del Giorno', richieste: 'Le Mie Richieste' };
    ['avvisi', 'odg', 'richieste'].forEach(key => {
        const titleEl = document.getElementById(`sec-title-${key}`);
        const renameEl = document.getElementById(`sec-rename-${key}`);
        if (titleEl) titleEl.textContent = secNames[key] || defaultNames[key];
        if (renameEl) renameEl.innerHTML = currentRole === 'admin'
            ? `<button class="btn-icon" onclick="openRenameSectionModal('${key}')" title="Rinomina sezione" style="margin-left:4px;vertical-align:middle;"><span class="material-symbols-outlined" style="font-size:15px;color:var(--text-muted);">edit</span></button>`
            : '';
    });

    // ---- Bacheca Avvisi ----
    const bacheca = document.getElementById('bacheca-avvisi');
    if (bacheca) {
        const avvisi = appData.avvisi || [];
        const isAdmin = currentRole === 'admin';
        if (avvisi.length === 0) {
            bacheca.innerHTML = '<p class="dashboard-empty">Nessun avviso al momento.</p>';
        } else {
            bacheca.innerHTML = avvisi.slice().reverse().map(av => {
                const fileHtml = av.fileUrl ? `
                    <a href="${escHtml(av.fileUrl)}" target="_blank" class="odg-pdf-link" style="margin-top:8px;">
                        <span class="material-symbols-outlined" style="font-size:28px;color:var(--primary);flex-shrink:0;">${getFileIcon(av.fileName)}</span>
                        <div style="min-width:0;flex:1;">
                            <div style="font-weight:600;font-size:0.85rem;word-break:break-word;">${escHtml(av.fileName || 'Allegato')}</div>
                            <div style="font-size:0.75rem;color:var(--text-muted);">Tocca per aprire</div>
                        </div>
                        <span class="material-symbols-outlined" style="color:var(--primary);flex-shrink:0;">open_in_new</span>
                    </a>` : '';
                return `<div class="avviso-card">
                    <div class="avviso-body">
                        <div class="avviso-meta">
                            <span class="material-symbols-outlined" style="font-size:18px;color:var(--accent);">campaign</span>
                            <strong>${escHtml(av.autore)}</strong>
                            <span class="avviso-date">${av.data}</span>
                        </div>
                        <p class="avviso-text">${escHtml(av.testo)}</p>
                        ${fileHtml}
                    </div>
                    ${isAdmin ? `<button class="btn-icon delete admin-only" onclick="deleteAvviso('${av.id}')" title="Elimina"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>` : ''}
                </div>`;
            }).join('');
        }
    }

    // ---- Ordine del Giorno ----
    const odgEl = document.getElementById('bacheca-odg');
    if (odgEl) {
        const odg = appData.ordineGiorno || [];
        if (odg.length === 0) {
            odgEl.innerHTML = '<p class="dashboard-empty">Nessun documento pubblicato.</p>';
        } else {
            const isAdmin = currentRole === 'admin';
            odgEl.innerHTML = odg.slice().reverse().map(item => {
                const delBtn = isAdmin ? `<button class="btn-icon delete admin-only" onclick="deleteOrdineGiorno('${item.id}')" title="Elimina"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>` : '';
                if (item.type === 'image') {
                    return `<div class="odg-item">
                        <img src="${escHtml(item.url)}" class="odg-image" loading="lazy" onclick="window.open('${escHtml(item.url)}','_blank')" title="Clicca per aprire a piena dimensione">
                        <div class="odg-meta">
                            <span class="material-symbols-outlined" style="font-size:15px;">image</span>
                            <span>${escHtml(item.name)}</span>
                            <span class="avviso-date">${item.data}</span>
                            ${delBtn}
                        </div>
                    </div>`;
                } else {
                    const icon = getFileIcon(item.name);
                    const iconColor = icon === 'picture_as_pdf' ? 'var(--danger)' : 'var(--primary)';
                    return `<div class="odg-item">
                        <a href="${escHtml(item.url)}" target="_blank" class="odg-pdf-link">
                            <span class="material-symbols-outlined" style="font-size:36px;color:${iconColor};flex-shrink:0;">${icon}</span>
                            <div style="min-width:0;flex:1;">
                                <div style="font-weight:600;font-size:0.9rem;word-break:break-word;">${escHtml(item.name)}</div>
                                <div style="font-size:0.78rem;color:var(--text-muted);">Tocca per aprire</div>
                            </div>
                            <span class="material-symbols-outlined" style="color:var(--primary);flex-shrink:0;">open_in_new</span>
                        </a>
                        <div class="odg-meta">
                            <span class="avviso-date">${item.data}</span>
                            ${delBtn}
                        </div>
                    </div>`;
                }
            }).join('');
        }
    }

    // ---- Le Mie Richieste ----
    const reqEl = document.getElementById('dashboard-mie-richieste');
    if (reqEl) {
        const tutte = appData.notifications || [];
        const mie = currentUsername ? tutte.filter(n => n.reqBy === currentUsername) : [];
        if (!currentUsername) {
            reqEl.innerHTML = '<p class="dashboard-empty">Effettua il login con il tuo nome per vedere le tue richieste.</p>';
        } else if (mie.length === 0) {
            reqEl.innerHTML = '<p class="dashboard-empty">Nessuna richiesta inviata.</p>';
        } else {
            reqEl.innerHTML = mie.slice().reverse().map(n => `
                <div class="dashboard-event-item">
                    <span class="material-symbols-outlined" style="font-size:18px; color:var(--accent); flex-shrink:0;">inventory</span>
                    <div>
                        <strong>${n.qty}x ${escHtml(n.matName)}</strong>
                        <div style="font-size:0.8rem; color:var(--text-muted);">${escHtml(n.sectorName || '')} ${n.confirmCode ? '· <span class="confirm-code">' + n.confirmCode + '</span>' : ''}</div>
                    </div>
                </div>
            `).join('');
        }
    }

    updateNotificationsBadge();
    initDashboardDrag();
}

let _dashDragInit = false;
function initDashboardDrag() {
    const wrapper = document.getElementById('dashboard-sections-wrapper');
    if (!wrapper) return;

    // Restore saved order from localStorage
    if (!_dashDragInit) {
        _dashDragInit = true;
        try {
            const saved = localStorage.getItem('animapp_dash_order');
            if (saved) {
                const ids = JSON.parse(saved);
                ids.forEach(id => {
                    const el = document.getElementById(id);
                    if (el) wrapper.appendChild(el);
                });
            }
        } catch(e) {}

        let dragged = null;

        function getSections() {
            return [...wrapper.querySelectorAll(':scope > .dashboard-section')];
        }
        function saveOrder() {
            localStorage.setItem('animapp_dash_order', JSON.stringify(getSections().map(s => s.id)));
        }
        function clearOver() {
            getSections().forEach(s => s.classList.remove('dash-drag-over'));
        }

        getSections().forEach(section => {
            section.addEventListener('dragstart', (e) => {
                dragged = section;
                requestAnimationFrame(() => section.classList.add('dash-dragging'));
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', section.id);
            });
            section.addEventListener('dragend', () => {
                section.classList.remove('dash-dragging');
                clearOver();
                dragged = null;
                saveOrder();
            });
            section.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (!dragged || section === dragged) return;
                clearOver();
                section.classList.add('dash-drag-over');
                const mid = section.getBoundingClientRect().top + section.getBoundingClientRect().height / 2;
                if (e.clientY < mid) {
                    wrapper.insertBefore(dragged, section);
                } else {
                    wrapper.insertBefore(dragged, section.nextSibling);
                }
            });
            section.addEventListener('dragleave', (e) => {
                if (!section.contains(e.relatedTarget)) section.classList.remove('dash-drag-over');
            });
            section.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                clearOver();
            });
        });
    }
}

// ---- Rinomina sezioni dashboard ----
window.openRenameSectionModal = function(key) {
    const defaultNames = { avvisi: 'Avvisi', odg: 'Ordine del Giorno', richieste: 'Le Mie Richieste' };
    const current = (appData.dashboardSectionNames || {})[key] || defaultNames[key];
    openModal('Rinomina Sezione', `
        <div class="form-group"><label>Nome sezione</label><input type="text" id="rename-sec-input" class="form-control" value="${escHtml(current)}" maxlength="40"></div>
        <div class="form-actions">
            <button class="btn-secondary" onclick="document.getElementById('modal-container').classList.add('hidden')">Annulla</button>
            <button class="btn primary" onclick="saveSectionRename('${key}')">Salva</button>
        </div>
    `);
    setTimeout(() => { const el = document.getElementById('rename-sec-input'); if(el){ el.focus(); el.select(); } }, 50);
};

window.saveSectionRename = function(key) {
    const val = (document.getElementById('rename-sec-input').value || '').trim();
    if (!val) { showToast('Il nome non può essere vuoto.', 'error'); return; }
    if (!appData.dashboardSectionNames) appData.dashboardSectionNames = {};
    appData.dashboardSectionNames[key] = val;
    saveData(); renderDashboard(); modal.classList.add('hidden');
    showToast('Sezione rinominata.', 'success');
};

// ---- Avvisi ----
window.openAddAvvisoModal = function() {
    openModal('Nuovo Avviso', `
        <div class="form-group"><label>Testo dell'avviso</label><textarea id="avviso-testo" class="form-control" rows="4" placeholder="Scrivi l'avviso per tutto il team..."></textarea></div>
        <div class="form-group">
            <label>Allegato <span style="color:var(--text-muted);font-weight:400;">(opzionale — qualsiasi file)</span></label>
            <input type="file" id="avviso-file" class="form-control" style="padding:8px;">
        </div>
        <div id="avviso-file-preview" style="margin-bottom:8px;"></div>
        <div class="upload-progress hidden" id="avviso-progress-wrap" style="margin-bottom:16px;"><div class="upload-progress-bar" id="avviso-progress-bar"></div></div>
        <div class="form-actions">
            <button class="btn-secondary" onclick="document.getElementById('modal-container').classList.add('hidden')">Annulla</button>
            <button class="btn primary" id="avviso-publish-btn" onclick="addAvviso()"><span class="material-symbols-outlined" style="font-size:16px;">send</span> Pubblica</button>
        </div>
    `);
    setTimeout(() => {
        document.getElementById('avviso-testo')?.focus();
        document.getElementById('avviso-file')?.addEventListener('change', () => {
            const f = document.getElementById('avviso-file').files[0];
            const prev = document.getElementById('avviso-file-preview');
            if (!prev || !f) return;
            prev.innerHTML = `<div style="display:flex;align-items:center;gap:8px;padding:8px;background:var(--bg-main);border-radius:8px;font-size:0.85rem;">
                <span class="material-symbols-outlined" style="color:var(--primary);">${getFileIcon(f.name)}</span>
                <span style="word-break:break-word;">${escHtml(f.name)}</span>
            </div>`;
        });
    }, 50);
};

window.addAvviso = async function() {
    const testo = document.getElementById('avviso-testo').value.trim();
    if (!testo) { showToast('Scrivi il testo dell\'avviso.', 'error'); return; }
    const fileInput = document.getElementById('avviso-file');
    const file = fileInput && fileInput.files[0];
    const btn = document.getElementById('avviso-publish-btn');
    if (btn) btn.disabled = true;

    let fileUrl = null, fileName = null;
    if (file) {
        const progressWrap = document.getElementById('avviso-progress-wrap');
        const progressBar = document.getElementById('avviso-progress-bar');
        if (progressWrap) progressWrap.classList.remove('hidden');
        try {
            const fileId = generateId();
            const ref = storage.ref(`avvisi/${fileId}/${file.name}`);
            const task = ref.put(file);
            task.on('state_changed', snap => {
                const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
                if (progressBar) progressBar.style.width = pct + '%';
            });
            await task;
            fileUrl = await ref.getDownloadURL();
            fileName = file.name;
        } catch(e) {
            showToast('Errore caricamento allegato. Riprova.', 'error');
            if (btn) btn.disabled = false;
            return;
        }
    }

    if (!appData.avvisi) appData.avvisi = [];
    const now = new Date();
    const avviso = {
        id: generateId(),
        testo,
        autore: currentUsername || 'Admin',
        data: now.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + now.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })
    };
    if (fileUrl) { avviso.fileUrl = fileUrl; avviso.fileName = fileName; }
    appData.avvisi.push(avviso);
    saveData(); renderDashboard(); modal.classList.add('hidden');
    showToast('Avviso pubblicato.', 'success');
    sendPushNotification('📢 Nuovo Avviso', testo.length > 100 ? testo.slice(0, 97) + '...' : testo, null, 'dashboard');
};

window.deleteAvviso = function(id) {
    if (!confirm('Eliminare questo avviso?')) return;
    const item = (appData.avvisi || []).find(a => String(a.id) === String(id));
    appData.avvisi = (appData.avvisi || []).filter(a => String(a.id) !== String(id));
    saveData(); renderDashboard();
    if (item && item.fileUrl) {
        try { storage.refFromURL(item.fileUrl).delete().catch(() => {}); } catch(e) {}
    }
};

window.openAddOrdineGiornoModal = function() {
    openModal('Carica Ordine del Giorno', `
        <div class="form-group">
            <label>Seleziona file <span style="color:var(--text-muted);font-weight:400;">(qualsiasi tipo)</span></label>
            <input type="file" id="odg-file" class="form-control" style="padding:8px;">
            <p style="font-size:0.78rem;color:var(--text-muted);margin-top:6px;">Immagini: anteprima inline. Tutti gli altri file: link di download.</p>
        </div>
        <div id="odg-preview" style="margin-bottom:16px;"></div>
        <div class="upload-progress hidden" id="odg-progress-wrap" style="margin-bottom:16px;">
            <div class="upload-progress-bar" id="odg-progress-bar"></div>
        </div>
        <div class="form-actions">
            <button class="btn-secondary" onclick="document.getElementById('modal-container').classList.add('hidden')">Annulla</button>
            <button class="btn primary" id="odg-upload-btn" onclick="uploadOrdineGiorno()">
                <span class="material-symbols-outlined" style="font-size:16px;">upload</span> Pubblica
            </button>
        </div>
    `);
    setTimeout(() => {
        const fileInput = document.getElementById('odg-file');
        if (!fileInput) return;
        fileInput.addEventListener('change', () => {
            const file = fileInput.files[0];
            const preview = document.getElementById('odg-preview');
            if (!preview || !file) return;
            if (file.type.startsWith('image/')) {
                const url = URL.createObjectURL(file);
                preview.innerHTML = `<img src="${url}" style="width:100%;border-radius:8px;max-height:220px;object-fit:contain;background:var(--bg-main);">`;
            } else {
                preview.innerHTML = `<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--bg-main);border-radius:8px;">
                    <span class="material-symbols-outlined" style="font-size:28px;color:var(--primary);">${getFileIcon(file.name)}</span>
                    <span style="font-size:0.9rem;word-break:break-word;">${escHtml(file.name)}</span>
                </div>`;
            }
        });
    }, 50);
};

window.uploadOrdineGiorno = async function() {
    const fileInput = document.getElementById('odg-file');
    if (!fileInput || !fileInput.files[0]) { showToast('Seleziona un file.', 'error'); return; }
    const file = fileInput.files[0];
    const btn = document.getElementById('odg-upload-btn');
    const progressWrap = document.getElementById('odg-progress-wrap');
    const progressBar = document.getElementById('odg-progress-bar');
    if (btn) btn.disabled = true;
    if (progressWrap) progressWrap.classList.remove('hidden');
    try {
        const fileId = generateId();
        const ref = storage.ref(`ordinegiorno/${fileId}/${file.name}`);
        const task = ref.put(file);
        task.on('state_changed', snap => {
            const pct = Math.round((snap.bytesTransferred / snap.totalBytes) * 100);
            if (progressBar) progressBar.style.width = pct + '%';
        });
        await task;
        const url = await ref.getDownloadURL();
        if (!appData.ordineGiorno) appData.ordineGiorno = [];
        const now = new Date();
        appData.ordineGiorno.push({
            id: fileId,
            url,
            name: file.name,
            type: file.type.startsWith('image/') ? 'image' : 'file',
            autore: currentUsername || 'Admin',
            data: now.toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'numeric' }) + ' ' + now.toLocaleTimeString('it-IT', { hour:'2-digit', minute:'2-digit' })
        });
        saveData();
        renderDashboard();
        document.getElementById('modal-container').classList.add('hidden');
        showToast('Documento pubblicato nella bacheca.', 'success');
        sendPushNotification('📋 Ordine di Servizio', `${currentUsername || 'Admin'} ha pubblicato un nuovo ordine di servizio`, null, 'dashboard');
    } catch(e) {
        console.error(e);
        showToast('Errore durante il caricamento. Riprova.', 'error');
        if (btn) btn.disabled = false;
    }
};

window.deleteOrdineGiorno = function(id) {
    if (!confirm('Eliminare questo documento dalla bacheca?')) return;
    const item = (appData.ordineGiorno || []).find(x => String(x.id) === String(id));
    appData.ordineGiorno = (appData.ordineGiorno || []).filter(x => String(x.id) !== String(id));
    saveData();
    renderDashboard();
    if (item && item.url) {
        try { storage.refFromURL(item.url).delete().catch(() => {}); } catch(e) {}
    }
    showToast('Documento rimosso.', 'success');
};

// ==========================================
// RICHIESTA RAPIDA DA LINK (Web Share Target)
// ==========================================
function openQuickRequestModal(prefillUrl) {
    const groups = appData.sectorGroups || [];
    const grpOpts = groups.map(g => `<option value="${g.id}">${escHtml(g.name)}</option>`).join('');
    openModal('🔗 Richiesta Rapida da Link', `
        <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:14px;">Link ricevuto: <a href="${escHtml(prefillUrl)}" target="_blank" style="color:var(--primary);word-break:break-all;">${escHtml(prefillUrl)}</a></p>
        ${groups.length > 0 ? `
        <div class="form-group">
            <label>Settore <span style="color:var(--text-muted);font-weight:400;">(opzionale)</span></label>
            <select id="qr-group" class="form-control" onchange="updateQrSectors()">
                <option value="">-- Tutti i reparti --</option>
                ${grpOpts}
            </select>
        </div>` : ''}
        <div class="form-group">
            <label>Reparto *</label>
            <select id="qr-sector" class="form-control">
                <option value="">-- Seleziona reparto --</option>
            </select>
        </div>
        <div class="form-group">
            <label>Nome Materiale *</label>
            <input type="text" id="qr-name" class="form-control" placeholder="Es. Pallone, Microfono...">
        </div>
        <div class="form-group">
            <label>Quantità da Richiedere *</label>
            <input type="number" id="qr-qty" class="form-control" value="1" min="1">
        </div>
        <div class="form-group">
            <label>Note <span style="color:var(--text-muted);font-weight:400;">(opzionale)</span></label>
            <textarea id="qr-notes" class="form-control" rows="2" placeholder="Urgente, specifiche..."></textarea>
        </div>
        <div class="form-group">
            <label>Link Prodotto</label>
            <input type="url" id="qr-url" class="form-control" value="${escHtml(prefillUrl)}">
        </div>
        <button class="btn primary" onclick="submitQuickRequest()" style="width:100%;justify-content:center;">
            <span class="material-symbols-outlined" style="font-size:16px;">add_shopping_cart</span> Invia Richiesta
        </button>
    `);
    setTimeout(() => updateQrSectors(), 50);
}

window.updateQrSectors = function() {
    const grpEl = document.getElementById('qr-group');
    const grpId = grpEl ? grpEl.value : '';
    const sectors = appData.sectors || [];
    const filtered = grpId ? sectors.filter(s => String(s.groupId) === String(grpId)) : sectors;
    const sel = document.getElementById('qr-sector');
    if (!sel) return;
    sel.innerHTML = '<option value="">-- Seleziona reparto --</option>' +
        filtered.map(s => `<option value="${s.id}">${escHtml(s.name)}</option>`).join('');
};

window.submitQuickRequest = function() {
    if (appData.settings && appData.settings.blockRequests && currentRole !== 'admin') {
        showToast('Le richieste sono bloccate.', 'error'); return;
    }
    const secId = document.getElementById('qr-sector').value;
    const name  = document.getElementById('qr-name').value.trim();
    const qty   = parseInt(document.getElementById('qr-qty').value) || 0;
    const notes = document.getElementById('qr-notes').value.trim();
    const url   = document.getElementById('qr-url').value.trim();

    if (!secId) { showToast('Seleziona un reparto.', 'error'); return; }
    if (!name)  { showToast('Inserisci il nome del materiale.', 'error'); return; }
    if (qty < 1){ showToast('Inserisci una quantità valida.', 'error'); return; }

    const sec = (appData.sectors || []).find(s => String(s.id) === String(secId));
    if (!sec) { showToast('Reparto non trovato.', 'error'); return; }
    if (!sec.materials) sec.materials = [];

    const newMat = { id: generateId(), name, total: 0, available: 0, details: notes };
    sec.materials.push(newMat);

    const confirmCode = generateReqCode();
    appData.notifications.push({
        id: generateId(), secId: sec.id, matId: newMat.id,
        matName: name, sectorName: sec.name,
        qty, reqBy: currentUsername || currentRole,
        notes, url, confirmCode,
        date: new Date().toLocaleDateString('it-IT')
    });
    saveData();
    modal.classList.add('hidden');
    showToast(`Richiesta inviata: ${qty}x ${name} — Codice: ${confirmCode}`, 'success');
    sendTelegramNotification(
        `🔗 <b>Richiesta Rapida da Link</b>\n\n` +
        `📦 <b>Reparto:</b> ${sec.name}\n` +
        `🏷️ <b>Materiale:</b> ${name}\n` +
        `🔢 <b>Quantità:</b> ${qty}\n` +
        `👤 <b>Da:</b> ${currentUsername || currentRole}\n` +
        `🔖 <b>Codice:</b> ${confirmCode}\n` +
        (notes ? `📝 <b>Note:</b> ${notes}\n` : '') +
        (url   ? `🔗 <b>Link:</b> ${url}\n`   : '') +
        `\n⏰ ${new Date().toLocaleString('it-IT')}`,
        TELEGRAM_CONFIG.botTokenMagazzino,
        TELEGRAM_CONFIG.chatIdAdmin
    );
};

// Initialization
function showNameOverlay() {
    const overlay = document.getElementById('name-overlay');
    const content = document.getElementById('name-overlay-content');
    if (!overlay) return;
    content.innerHTML = `<input type="text" id="overlay-name-input" class="form-control" placeholder="Es. Marco Bianchi" autocomplete="name">`;
    setTimeout(() => { const inp = document.getElementById('overlay-name-input'); if(inp) inp.focus(); }, 50);
    overlay.classList.remove('hidden');
}

window.saveOverlayName = function() {
    const inp = document.getElementById('overlay-name-input');
    const name = inp ? inp.value.trim() : '';
    if (!name) { document.getElementById('name-overlay-error').classList.remove('hidden'); return; }
    localStorage.setItem('logistic_torre_username', name);
    currentUsername = name;
    document.getElementById('name-overlay').classList.add('hidden');
    showToast(`Benvenuto, ${name}!`, 'success');
}

function navigateTo(viewId) {
    const link = document.querySelector(`.nav-links li[data-view="${viewId}"]`);
    if (link) link.click();
}

function init() {
    applyRole();
    renderStaff();
    renderDashboard();
    updateNotificationsBadge();
    initChat();
    handleViewFromUrl();

    // Inizializza OneSignal anche per utenti già loggati (senza passare dal login)
    const savedEmail = localStorage.getItem('logistic_torre_email') || '';
    const savedName  = localStorage.getItem('logistic_torre_username') || '';
    const savedRole  = localStorage.getItem('logistic_torre_role') || 'animatore';
    if (localStorage.getItem('logistic_torre_auth') === 'true') {
        initOneSignal(savedEmail, savedName, savedRole);
    }

    // Dashboard card navigation
    const statEvents = document.getElementById('stat-events-today');
    if (statEvents) statEvents.closest('.stat-card').addEventListener('click', () => navigateTo('events'));
    const statStaff = document.getElementById('stat-total-staff');
    if (statStaff) statStaff.closest('.stat-card').addEventListener('click', () => navigateTo('staff'));
    const statRequests = document.getElementById('stat-total-requests');
    if (statRequests) statRequests.closest('.stat-card').addEventListener('click', () => {
        navigateTo('inventory');
        if (currentRole === 'admin') setTimeout(() => btnNotifications.click(), 200);
    });
}

// ==========================================
// BLOCCA / SBLOCCA RICHIESTE MATERIALE
// ==========================================
function updateBlockRequestsBtn() {
    const btn = document.getElementById('btn-toggle-requests');
    if (!btn) return;
    const blocked = appData.settings && appData.settings.blockRequests;
    if (blocked) {
        btn.innerHTML = '<span class="material-symbols-outlined">lock_open</span> Sblocca Richieste';
        btn.style.cssText = 'background:var(--danger); color:white; border:none;';
    } else {
        btn.innerHTML = '<span class="material-symbols-outlined">block</span> Blocca Richieste';
        btn.style.cssText = '';
    }
}

window.toggleBlockRequests = function() {
    if (!appData.settings) appData.settings = {};
    appData.settings.blockRequests = !appData.settings.blockRequests;
    saveData();
    const blocked = appData.settings.blockRequests;
    showToast(blocked ? 'Richieste bloccate per tutti.' : 'Richieste sbloccate.', blocked ? 'error' : 'success');
    const msg = blocked
        ? `🔒 <b>Richieste Materiali Bloccate</b>\n\nL'amministratore ha bloccato le richieste di materiale. Non è possibile effettuare nuove richieste fino a nuovo avviso.\n\n⏰ ${new Date().toLocaleString('it-IT')}`
        : `✅ <b>Richieste Materiali Riaperte</b>\n\nL'amministratore ha riaperto le richieste di materiale. È nuovamente possibile richiedere e aggiungere materiali.\n\n⏰ ${new Date().toLocaleString('it-IT')}`;
    sendTelegramNotification(msg, TELEGRAM_CONFIG.botTokenEventi, TELEGRAM_CONFIG.chatIdGroup);
}

// ==========================================
// GLOBAL DRAG-AND-DROP PREVENTION
// ==========================================
document.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); });
document.addEventListener('drop', (e) => { e.preventDefault(); e.stopPropagation(); });

// ==========================================
// FILES & FOLDERS LOGIC
// ==========================================
window.currentFolderId = 'root';

function getFileIcon(type) {
    if (type === 'gdrive') return 'add_to_drive';
    if (type === 'dropbox') return 'cloud';
    if (type === 'pdf') return 'picture_as_pdf';
    if (type === 'excel') return 'table_chart';
    if (type === 'image') return 'image';
    if (type === 'video') return 'videocam';
    if (type === 'audio') return 'audio_file';
    if (type === 'word') return 'description';
    if (type === 'powerpoint') return 'slideshow';
    if (type === 'archive') return 'folder_zip';
    return 'draft';
}

function canAccessFolder(folderId) {
    if (folderId === 'root') return true;
    if (currentRole === 'admin') return true;
    const folder = appData.files && appData.files.find(f => String(f.id) === String(folderId) && f.isFolder);
    if (!folder) return true;
    const access = folder.visibleTo || 'all';
    if (access === 'responsabile' && currentRole !== 'responsabile') return false;
    if (access === 'animatore' && currentRole !== 'animatore') return false;
    if (access === 'specific') {
        const allowed = folder.allowedStaff || [];
        if (!currentUsername || !allowed.includes(currentUsername)) return false;
    }
    return canAccessFolder(folder.parentId || 'root');
}

function staffCheckboxesHTML(selectedNames) {
    selectedNames = selectedNames || [];
    const allUsers = appData.registeredUsers || [];
    if (allUsers.length === 0)
        return '<p style="font-size:0.85rem;color:var(--text-muted);">Nessun utente registrato.</p>';
    return `<div style="max-height:180px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:8px;margin-top:4px;">
        ${allUsers.map(u => {
            const fullName = `${u.firstName} ${u.lastName}`;
            return `<label style="display:flex;align-items:center;gap:8px;padding:6px 4px;cursor:pointer;">
                <input type="checkbox" class="staff-vis-check" value="${escHtml(fullName)}" ${selectedNames.includes(fullName) ? 'checked' : ''}>
                <span style="font-size:0.9rem;">${escHtml(fullName)}</span>
                <span style="font-size:0.75rem;color:var(--text-muted);">${ROLE_LABELS[u.role] || u.role}</span>
            </label>`;
        }).join('')}
    </div>`;
}

window.updateStaffVisibility = function(preSelected) {
    const sel = document.getElementById('folder-access') || document.getElementById('rename-access');
    const container = document.getElementById('staff-visibility-container');
    if (!sel || !container) return;
    if (sel.value === 'specific') {
        container.style.display = 'block';
        container.innerHTML = `<label style="font-size:0.85rem;font-weight:500;color:var(--text-main);margin-bottom:4px;display:block;">Seleziona gli utenti</label>${staffCheckboxesHTML(preSelected || [])}`;
    } else {
        container.style.display = 'none';
    }
}

window.navigateToFolder = function(id) {
    if (!canAccessFolder(id)) {
        showToast('Non hai i permessi per accedere a questa cartella.', 'error');
        return;
    }
    window.currentFolderId = id;
    renderFiles();
}

function renderFiles() {
    const grid = document.getElementById('files-grid');
    const folderGrid = document.getElementById('folders-grid');
    if (!grid || !folderGrid) return;
    grid.innerHTML = '';
    folderGrid.innerHTML = '';

    // Se la cartella corrente non è accessibile, torna alla root
    if (!canAccessFolder(window.currentFolderId)) {
        window.currentFolderId = 'root';
    }
    
    // 1. Calculate & Render Breadcrumbs
    let crumbs = [{id: 'root', name: 'Home'}];
    let curr = window.currentFolderId;
    while(curr !== 'root') {
        const f = (appData.files || []).find(x => String(x.id) === String(curr));
        if(f) {
            crumbs.unshift({id: f.id, name: f.title});
            curr = f.parentId || 'root';
        } else break; 
    }
    const bcContainer = document.getElementById('files-breadcrumbs');
    if(bcContainer) {
        bcContainer.innerHTML = crumbs.map((c, i) => {
            const isHome = c.id === 'root';
            const isLast = i === crumbs.length - 1;
            if (isLast && !isHome) return `<span class="crumb active">${c.name}</span>`;
            return `<span class="crumb" onclick="navigateToFolder('${c.id}')" style="cursor:pointer;">${c.name}</span>`;
        }).join('<span class="crumb-sep"> / </span>');
    }

    if (!appData.files) appData.files = [];
    if (!appData.folderNotes) appData.folderNotes = {};

    // Render note area
    const noteArea = document.getElementById('folder-note-area');
    if (noteArea) {
        const fid = window.currentFolderId;
        const noteText = appData.folderNotes[fid] || '';
        const isAdmin = currentRole === 'admin';
        if (noteText || isAdmin) {
            noteArea.innerHTML = `
                <div class="folder-note-block" id="folder-note-block-${fid}">
                    ${noteText
                        ? `<div class="folder-note-text">${noteText.replace(/\n/g, '<br>')}</div>`
                        : `<div class="folder-note-empty">Nessuna nota per questa pagina.</div>`
                    }
                    ${isAdmin ? `<button class="btn-icon folder-note-edit" onclick="openNoteModal('${fid}')" title="Modifica nota"><span class="material-symbols-outlined">edit_note</span></button>` : ''}
                </div>`;
        } else {
            noteArea.innerHTML = '';
        }
    }

    wireFilesSearch();
    const filesQ    = (window.searchState.files.q || '').toLowerCase().trim();
    const filesType = window.searchState.files.type || '';

    // 2. Filter files for current directory (and hide inaccessible folders)
    const currentItems = (appData.files || []).filter(f => {
        const parent = f.parentId || 'root';
        if (String(parent) !== String(window.currentFolderId)) return false;
        if (f.isFolder && !canAccessFolder(f.id)) return false;
        if (filesQ && !(f.title || '').toLowerCase().includes(filesQ)) return false;
        if (filesType === 'folder' && !f.isFolder) return false;
        if (filesType && filesType !== 'folder' && f.isFolder) return false;
        if (filesType && filesType !== 'folder' && !f.isFolder && f.type !== filesType) return false;
        return true;
    });

    const folderItems = currentItems.filter(f => f.isFolder);
    const fileItems   = currentItems.filter(f => !f.isFolder);
    const isAdmin = currentRole === 'admin';

    if (currentItems.length === 0) {
        grid.innerHTML = `
            <div class="empty-state">
                <span class="material-symbols-outlined" style="font-size:48px; opacity:0.5; margin-bottom:12px;">folder_open</span>
                <p>Nessun elemento in questa cartella.</p>
            </div>
        `;
        return;
    }

    if (fileItems.length > 0 && folderItems.length > 0) {
        const label = document.createElement('p');
        label.className = 'files-section-label';
        label.textContent = 'File';
        grid.appendChild(label);
    }

    folderItems.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'doc-card';
        card.setAttribute('data-type', 'folder');
        card.setAttribute('data-folder-icon', item.icon || 'folder');

        const icon = item.icon || 'folder';
        const delBtn = isAdmin
            ? `<button class="btn-icon danger doc-delete" onclick="deleteFile(event,'${item.id}')" title="Elimina"><span class="material-symbols-outlined">delete</span></button>`
            : '';
        const renameBtn = isAdmin
            ? `<button class="btn-icon" onclick="openRenameModal(event,'${item.id}')" title="Rinomina" style="padding:4px;"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>`
            : '';
        const accessBadge = isAdmin && item.visibleTo && item.visibleTo !== 'all'
            ? `<span class="folder-access-badge">🔒 ${
                item.visibleTo === 'responsabile' ? 'Resp.' :
                item.visibleTo === 'animatore'    ? 'Anim.' :
                item.visibleTo === 'specific'     ? (item.allowedStaff && item.allowedStaff.length ? item.allowedStaff.join(', ') : 'Nessuno') : ''
              }</span>`
            : '';

        card.innerHTML = `
            ${delBtn}
            <div class="folder-tile-icon" onclick="navigateToFolder('${item.id}')">
                <span class="material-symbols-outlined">${icon}</span>
            </div>
            <div class="folder-tile-name" onclick="navigateToFolder('${item.id}')">
                <span>${item.title}</span>
                ${accessBadge}
            </div>
            ${isAdmin ? `<div class="folder-tile-actions">${renameBtn}</div>` : ''}
        `;

        // Drag-and-drop reordering (tutti i ruoli possono vedere, solo admin riordina)
        card.setAttribute('draggable', isAdmin ? 'true' : 'false');
        card.addEventListener('dragstart', (e) => {
            window._dragFolderId = item.id;
            card.classList.add('folder-dragging');
            e.dataTransfer.effectAllowed = 'move';
        });
        card.addEventListener('dragend', () => {
            card.classList.remove('folder-dragging');
            document.querySelectorAll('.folder-drag-over').forEach(c => c.classList.remove('folder-drag-over'));
        });
        card.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (String(window._dragFolderId) !== String(item.id)) card.classList.add('folder-drag-over');
        });
        card.addEventListener('dragleave', () => card.classList.remove('folder-drag-over'));
        card.addEventListener('drop', (e) => {
            e.preventDefault();
            card.classList.remove('folder-drag-over');
            const srcId = window._dragFolderId;
            if (!srcId || String(srcId) === String(item.id)) return;
            const i1 = (appData.files || []).findIndex(f => String(f.id) === String(srcId));
            const i2 = (appData.files || []).findIndex(f => String(f.id) === String(item.id));
            if (i1 === -1 || i2 === -1) return;
            [appData.files[i1], appData.files[i2]] = [appData.files[i2], appData.files[i1]];
            saveData();
            renderFiles();
        });

        folderGrid.appendChild(card);
    });

    fileItems.forEach((item, index) => {
        const card = document.createElement('div');
        card.className = 'doc-card';
        card.setAttribute('data-type', item.type);

        const delBtn    = isAdmin ? `<button class="btn-icon danger doc-delete admin-only" onclick="deleteFile(event, '${item.id}')" title="Elimina"><span class="material-symbols-outlined">delete</span></button>` : '';
        const renameBtn = isAdmin ? `<button class="btn-icon admin-only" onclick="openRenameModal(event, '${item.id}')" title="Rinomina" style="padding:4px;"><span class="material-symbols-outlined" style="font-size:18px;">edit</span></button>` : '';
        const moveBtn   = isAdmin ? `<button class="btn-icon admin-only" onclick="openMoveModal(event, '${item.id}')" title="Sposta in cartella" style="padding:4px;"><span class="material-symbols-outlined" style="font-size:18px;">drive_file_move</span></button>` : '';
        const upBtn     = isAdmin ? `<button class="btn-icon admin-only" onclick="moveFileItem(event,'${item.id}',-1)" title="Sposta su" style="padding:4px;" ${index === 0 ? 'disabled style="padding:4px;opacity:0.3;"' : ''}><span class="material-symbols-outlined" style="font-size:18px;">arrow_upward</span></button>` : '';
        const downBtn   = isAdmin ? `<button class="btn-icon admin-only" onclick="moveFileItem(event,'${item.id}',1)" title="Sposta giù" style="padding:4px;" ${index === fileItems.length - 1 ? 'disabled style="padding:4px;opacity:0.3;"' : ''}><span class="material-symbols-outlined" style="font-size:18px;">arrow_downward</span></button>` : '';

        let actionBtn = '';
        if (item.isGDrive) {
            actionBtn = `<a href="${item.url}" target="_blank" class="btn-icon" title="Apri su Google Drive" onclick="event.stopPropagation()" style="color:#4285f4;"><span class="material-symbols-outlined">open_in_new</span></a>`;
        } else if (item.isDropbox) {
            actionBtn = `<a href="${item.url}" target="_blank" class="btn-icon" title="Apri su Dropbox" onclick="event.stopPropagation()" style="color:#0061fe;"><span class="material-symbols-outlined">open_in_new</span></a>`;
        } else if (currentRole === 'admin' || currentRole === 'responsabile') {
            actionBtn = `<a href="${item.url}" target="_blank" class="btn-icon" title="Apri/Scarica" onclick="event.stopPropagation()"><span class="material-symbols-outlined">download</span></a>`;
        } else {
            actionBtn = `<a href="${item.url}" target="_blank" class="btn-icon" title="Apri (Sola Lettura)" onclick="event.stopPropagation()"><span class="material-symbols-outlined">visibility</span></a>`;
        }

        const iconColor = item.isGDrive ? 'color:#4285f4;' : item.isDropbox ? 'color:#0061fe;' : '';
        const metaLabel = item.isGDrive
            ? `<span style="color:#4285f4; font-weight:500;">Google Drive</span> · ${item.date}`
            : item.isDropbox
            ? `<span style="color:#0061fe; font-weight:500;">Dropbox</span> · ${item.date}`
            : `Caricato il: ${item.date}`;

        card.innerHTML = `
            ${delBtn}
            <div class="doc-icon"><span class="material-symbols-outlined" style="${iconColor}">${getFileIcon(item.type)}</span></div>
            <div class="doc-info">
                <h4>${item.title}</h4>
                <div class="doc-meta">${metaLabel}</div>
            </div>
            <div class="doc-actions">
                ${upBtn}${downBtn}${renameBtn}${moveBtn}${actionBtn}
            </div>
        `;
        grid.appendChild(card);
    });
}

// ── PAGE NOTES (dashboard, inventory, staff, events) ──
function renderPageNote(pageId) {
    const container = document.getElementById(`page-note-${pageId}`);
    if (!container) return;
    if (!appData.pageNotes) appData.pageNotes = {};
    const text = appData.pageNotes[pageId] || '';
    const isAdmin = currentRole === 'admin';
    if (!text && !isAdmin) { container.innerHTML = ''; return; }
    container.innerHTML = `
        <div class="folder-note-block" style="margin-bottom:18px;">
            ${text
                ? `<div class="folder-note-text">${text.replace(/\n/g, '<br>')}</div>`
                : `<div class="folder-note-empty">Nessuna nota per questa sezione.</div>`
            }
            ${isAdmin ? `<button class="btn-icon folder-note-edit" onclick="openPageNoteModal('${pageId}')" title="Modifica nota"><span class="material-symbols-outlined">edit_note</span></button>` : ''}
        </div>`;
}

window.openPageNoteModal = function(pageId) {
    if (!appData.pageNotes) appData.pageNotes = {};
    const current = appData.pageNotes[pageId] || '';
    const labels = { dashboard: 'Dashboard', inventory: 'Richiesta Materiali', staff: 'Team Staff', events: 'Planning Eventi' };
    openModal(`Nota — ${labels[pageId] || pageId}`, `
        <div class="form-group">
            <label>Indicazioni / Raccomandazioni</label>
            <textarea id="page-note-textarea" class="form-control" rows="6" placeholder="Scrivi qui le indicazioni per questa sezione…" style="resize:vertical;">${current}</textarea>
        </div>
        <div style="display:flex; gap:8px; margin-top:4px;">
            <button class="btn primary" onclick="savePageNote('${pageId}')" style="flex:1; justify-content:center;">
                <span class="material-symbols-outlined" style="font-size:16px;">save</span> Salva
            </button>
            ${current ? `<button class="btn" onclick="deletePageNote('${pageId}')" style="background:transparent; border:1px solid var(--danger); color:var(--danger);">
                <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
            </button>` : ''}
        </div>
    `);
    setTimeout(() => { const t = document.getElementById('page-note-textarea'); if(t) t.focus(); }, 100);
}

window.savePageNote = function(pageId) {
    const text = (document.getElementById('page-note-textarea').value || '').trim();
    if (!appData.pageNotes) appData.pageNotes = {};
    if (text) appData.pageNotes[pageId] = text;
    else delete appData.pageNotes[pageId];
    saveData();
    modal.classList.add('hidden');
    renderPageNote(pageId);
}

window.deletePageNote = function(pageId) {
    if (!confirm('Eliminare la nota?')) return;
    if (appData.pageNotes) delete appData.pageNotes[pageId];
    saveData();
    modal.classList.add('hidden');
    renderPageNote(pageId);
}

// ── FOLDER NOTES (Informazioni e Documenti) ──
window.openNoteModal = function(folderId) {
    if (!appData.folderNotes) appData.folderNotes = {};
    const current = appData.folderNotes[folderId] || '';
    openModal('Nota / Indicazioni', `
        <div class="form-group">
            <label>Testo (indicazioni, raccomandazioni…)</label>
            <textarea id="note-textarea" class="form-control" rows="6" placeholder="Scrivi qui le indicazioni per questa pagina…" style="resize:vertical;">${current}</textarea>
        </div>
        <div style="display:flex; gap:8px; margin-top:4px;">
            <button class="btn primary" onclick="saveNote('${folderId}')" style="flex:1; justify-content:center;">
                <span class="material-symbols-outlined" style="font-size:16px;">save</span> Salva
            </button>
            ${current ? `<button class="btn" onclick="deleteNote('${folderId}')" style="background:transparent; border:1px solid var(--danger); color:var(--danger);">
                <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
            </button>` : ''}
        </div>
    `);
    setTimeout(() => { const t = document.getElementById('note-textarea'); if(t) t.focus(); }, 100);
}

window.saveNote = function(folderId) {
    const text = (document.getElementById('note-textarea').value || '').trim();
    if (!appData.folderNotes) appData.folderNotes = {};
    if (text) {
        appData.folderNotes[folderId] = text;
    } else {
        delete appData.folderNotes[folderId];
    }
    saveData();
    modal.classList.add('hidden');
    renderFiles();
}

window.deleteNote = function(folderId) {
    if (!confirm('Eliminare la nota?')) return;
    if (appData.folderNotes) delete appData.folderNotes[folderId];
    saveData();
    modal.classList.add('hidden');
    renderFiles();
}

window.openFolderModal = function() {
    openModal("Nuova Cartella", `
        <div class="form-group">
            <label>Nome Cartella</label>
            <input type="text" id="folder-title" class="form-control" placeholder="Es. Spettacoli 2026">
        </div>
        <div class="form-group">
            <label>Tipo icona</label>
            <div class="folder-icon-picker">
                <div class="fip-option selected" data-icon="folder" onclick="selectFolderIcon(this)">
                    <span class="material-symbols-outlined">folder</span>
                    <span>Generale</span>
                </div>
                <div class="fip-option" data-icon="folder_special" onclick="selectFolderIcon(this)">
                    <span class="material-symbols-outlined">folder_special</span>
                    <span>Importante</span>
                </div>
                <div class="fip-option" data-icon="rule_folder" onclick="selectFolderIcon(this)">
                    <span class="material-symbols-outlined">rule_folder</span>
                    <span>Regole</span>
                </div>
            </div>
        </div>
        <div class="form-group">
            <label>Visibile a</label>
            <select id="folder-access" class="form-control" onchange="updateStaffVisibility()">
                <option value="all">Tutti</option>
                <option value="responsabile">Solo Responsabili</option>
                <option value="animatore">Solo Animatori</option>
                <option value="specific">Utenti Specifici</option>
            </select>
        </div>
        <div id="staff-visibility-container" style="display:none; margin-bottom:12px;"></div>
        <button class="btn primary" onclick="addFolder()" style="width:100%; justify-content:center;">Crea Cartella</button>
    `);
}

window.selectFolderIcon = function(el) {
    document.querySelectorAll('.fip-option').forEach(o => o.classList.remove('selected'));
    el.classList.add('selected');
}

window.addFolder = function() {
    const title = document.getElementById('folder-title').value.trim();
    if (!title) { showToast('Inserisci un nome per la cartella.', 'error'); return; }
    const access = document.getElementById('folder-access').value;
    const iconEl = document.querySelector('.fip-option.selected');
    const icon = iconEl ? iconEl.dataset.icon : 'folder';
    let allowedStaff = [];
    if (access === 'specific') {
        document.querySelectorAll('.staff-vis-check:checked').forEach(cb => allowedStaff.push(cb.value));
        if (allowedStaff.length === 0) { showToast('Seleziona almeno un responsabile.', 'error'); return; }
    }
    if(!appData.files) appData.files = [];
    appData.files.push({
        id: generateId(), title, isFolder: true,
        parentId: window.currentFolderId,
        icon, visibleTo: access, allowedStaff
    });
    saveData();
    modal.classList.add('hidden');
    renderFiles();
}

window.openUploadModal = function() {
    openModal("Carica nel Cloud", `
        <div class="upload-area" id="upload-drop-area" onclick="document.getElementById('file-input').click()">
            <span class="material-symbols-outlined" style="font-size:36px; color:var(--primary); margin-bottom:10px;">cloud_upload</span>
            <p style="font-size:0.95rem; font-weight:500; color:var(--text-main);">Trascina qui i file oppure clicca per selezionarli</p>
            <p style="font-size:0.8rem; color:var(--text-muted); margin-top:4px;">Qualsiasi tipo di file — puoi selezionare più file</p>
            <input type="file" id="file-input" class="hidden" multiple>
        </div>
        <div id="selected-files-list" style="margin-bottom:15px; font-size:0.8rem; font-weight:500; color:var(--text-main); text-align:center;">Nessun file selezionato</div>
        <div id="upload-progress-container" class="hidden">
            <div class="upload-progress"><div class="upload-progress-bar" id="upload-progress-bar"></div></div>
            <p id="upload-status-text" style="font-size:0.8rem; color:var(--text-muted); text-align:center; margin-top:5px;">Caricamento 0%</p>
        </div>
        <button class="btn primary" id="btn-confirm-upload" style="width:100%; justify-content:center;" disabled onclick="uploadMultipleFiles()">Inizia Caricamento</button>
    `);

    const fileInput = document.getElementById('file-input');
    const btnConfirm = document.getElementById('btn-confirm-upload');
    const listDisplay = document.getElementById('selected-files-list');
    const dropArea = document.getElementById('upload-drop-area');
    window.selectedFilesToUpload = null;

    function handleFiles(files) {
        if (files && files.length > 0) {
            window.selectedFilesToUpload = files;
            const names = Array.from(files).map(f => f.name).join(', ');
            listDisplay.innerHTML = `<strong>${files.length} file pronti:</strong><br><span style="color:var(--text-muted);font-size:0.75rem;">${names}</span>`;
            btnConfirm.disabled = false;
        } else {
            listDisplay.textContent = 'Nessun file selezionato';
            btnConfirm.disabled = true;
        }
    }

    fileInput.addEventListener('change', function() {
        handleFiles(this.files);
    });

    dropArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.style.borderColor = 'var(--primary)';
        dropArea.style.background = 'rgba(99,102,241,0.12)';
    });
    dropArea.addEventListener('dragleave', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.style.borderColor = '';
        dropArea.style.background = '';
    });
    dropArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        dropArea.style.borderColor = '';
        dropArea.style.background = '';
        handleFiles(e.dataTransfer.files);
    });
}

window.uploadMultipleFiles = async function() {
    const uploadBtn = document.getElementById('btn-confirm-upload');
    if (uploadBtn) {
        uploadBtn.innerHTML = "⏳ Caricamento in corso...";
        uploadBtn.disabled = true;
    }
    
    if (!storage) {
        alert("ERRORE: Firebase Storage non è inizializzato correttamente.");
        return;
    }

    if (!window.selectedFilesToUpload || window.selectedFilesToUpload.length === 0) {
        return;
    }
    
    const files = Array.from(window.selectedFilesToUpload);
    
    const progressContainer = document.getElementById('upload-progress-container');
    const progressBar = document.getElementById('upload-progress-bar');
    const progressText = document.getElementById('upload-status-text');

    if (progressContainer) {
        progressContainer.classList.remove('hidden');
    }
    
    let totalBytes = files.reduce((acc, f) => acc + f.size, 0);
    let bytesTransferredArray = new Array(files.length).fill(0);
    
    const d = new Date();
    const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;

    const uploadPromises = files.map((file, i) => {
        return new Promise((resolve, reject) => {
            const ext = file.name.split('.').pop().toLowerCase();
            let type = 'document';
            if (['pdf'].includes(ext)) type = 'pdf';
            if (['xls', 'xlsx', 'csv'].includes(ext)) type = 'excel';
            if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) type = 'image';
            if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) type = 'video';
            if (['mp3', 'wav', 'ogg', 'aac', 'flac'].includes(ext)) type = 'audio';
            if (['doc', 'docx', 'odt', 'rtf', 'txt'].includes(ext)) type = 'word';
            if (['ppt', 'pptx', 'odp'].includes(ext)) type = 'powerpoint';
            if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) type = 'archive';

            const path = `logistic_files/${Date.now()}_${i}_${file.name}`;
            const fileRef = storage.ref(path);
            const uploadTask = fileRef.put(file);
            
            uploadTask.on('state_changed', 
                (snapshot) => {
                    bytesTransferredArray[i] = snapshot.bytesTransferred;
                    let currentTotalTransferred = bytesTransferredArray.reduce((a,b)=>a+b, 0);
                    let progress = (currentTotalTransferred / totalBytes) * 100;
                    if (progressBar) progressBar.style.width = progress + '%';
                    if (progressText) progressText.textContent = `Caricamento file... ${Math.round(progress)}% (${files.length} elem.)`;
                }, 
                (error) => { reject(error); }, 
                () => {
                    uploadTask.snapshot.ref.getDownloadURL().then((downloadURL) => {
                        resolve({
                            id: generateId(),
                            title: file.name,
                            fileName: file.name,
                            url: downloadURL,
                            type: type,
                            date: dateStr,
                            parentId: window.currentFolderId,
                            isFolder: false
                        });
                    }).catch(reject);
                }
            );
        });
    });

    try {
        const uploadedFilesData = await Promise.all(uploadPromises);
        if(!appData.files) appData.files = [];
        appData.files.push(...uploadedFilesData);
        saveData();
        modal.classList.add('hidden');
        renderFiles();
    } catch (error) {
        if (uploadBtn) {
            uploadBtn.innerHTML = "Inizia Caricamento";
            uploadBtn.disabled = false;
        }
        console.error("Upload error:", error);
        let errMsg = "Errore durante l'upload.";
        if (error.code === 'storage/unauthorized') {
            errMsg = "❌ Accesso negato da Firebase Storage.\n\nDevi aggiornare le regole di sicurezza su Firebase Console:\n1. Vai su console.firebase.google.com\n2. Seleziona il progetto 'logistic-torreserena'\n3. Storage → Regole\n4. Imposta: allow read, write: if true;";
        } else if (error.code === 'storage/canceled') {
            errMsg = "Upload annullato.";
        } else if (error.code === 'storage/unknown') {
            errMsg = "Errore sconosciuto. Controlla la connessione internet.";
        } else {
            errMsg = "Errore: " + (error.message || error.code || error);
        }
        alert(errMsg);
        if (progressContainer) progressContainer.classList.add('hidden');
    }
}

window.openRenameModal = function(event, itemId) {
    event.stopPropagation();
    const item = (appData.files || []).find(f => String(f.id) === String(itemId));
    if (!item) return;
    const urlField = (item.isGDrive || item.isDropbox) ? `
        <div class="form-group">
            <label>Link <span style="color:${item.isGDrive ? '#4285f4' : '#0061fe'}; font-weight:600;">${item.isGDrive ? 'Google Drive' : 'Dropbox'}</span></label>
            <input type="url" id="rename-url" class="form-control" value="${escHtml(item.url)}">
        </div>` : '';
    const accessSelect = item.isFolder ? `
        <div class="form-group">
            <label>Visibile a</label>
            <select id="rename-access" class="form-control" onchange="updateStaffVisibility(${JSON.stringify(item.allowedStaff || [])})">
                <option value="all" ${(item.visibleTo || 'all') === 'all' ? 'selected' : ''}>Tutti gli utenti</option>
                <option value="responsabile" ${item.visibleTo === 'responsabile' ? 'selected' : ''}>Solo Responsabili</option>
                <option value="animatore" ${item.visibleTo === 'animatore' ? 'selected' : ''}>Solo Animatori</option>
                <option value="specific" ${item.visibleTo === 'specific' ? 'selected' : ''}>Utenti Specifici</option>
            </select>
        </div>
        <div id="staff-visibility-container" style="display:none; margin-bottom:12px;"></div>` : '';
    openModal(`Modifica ${item.isFolder ? 'Cartella' : 'File'}`, `
        <div class="form-group">
            <label>Nome</label>
            <input type="text" id="rename-input" class="form-control" value="${escHtml(item.title)}">
        </div>
        ${urlField}
        ${accessSelect}
        <button class="btn primary" onclick="saveRename('${itemId}')" style="width:100%; justify-content:center;">Salva</button>
    `);
    setTimeout(() => {
        const inp = document.getElementById('rename-input');
        if (inp) { inp.focus(); inp.select(); }
        if (item.isFolder && item.visibleTo === 'specific') updateStaffVisibility(item.allowedStaff || []);
    }, 50);
}

window.saveRename = function(itemId) {
    const item = (appData.files || []).find(f => String(f.id) === String(itemId));
    if (!item) return;
    const newName = document.getElementById('rename-input').value.trim();
    if (!newName) { showToast('Il nome non può essere vuoto.', 'error'); return; }
    item.title = newName;
    if (!item.isFolder) item.fileName = newName;
    const urlEl = document.getElementById('rename-url');
    if (urlEl && urlEl.value.trim()) item.url = urlEl.value.trim();
    if (item.isFolder) {
        const accessEl = document.getElementById('rename-access');
        if (accessEl) {
            item.visibleTo = accessEl.value;
            if (item.visibleTo === 'specific') {
                item.allowedStaff = [];
                document.querySelectorAll('.staff-vis-check:checked').forEach(cb => item.allowedStaff.push(cb.value));
                if (item.allowedStaff.length === 0) { showToast('Seleziona almeno un responsabile.', 'error'); return; }
            } else {
                item.allowedStaff = [];
            }
        }
    }
    saveData();
    modal.classList.add('hidden');
    renderFiles();
}

window.openMoveModal = function(event, itemId) {
    event.stopPropagation();
    const item = (appData.files || []).find(f => String(f.id) === String(itemId));
    if (!item) return;

    const getAllDescendantIds = (id) => {
        const children = (appData.files || []).filter(f => String(f.parentId) === String(id));
        let ids = [String(id)];
        children.forEach(c => { ids = ids.concat(getAllDescendantIds(c.id)); });
        return ids;
    };
    const excludeIds = item.isFolder ? getAllDescendantIds(item.id) : [];
    const availableFolders = (appData.files || []).filter(f => f.isFolder && !excludeIds.includes(String(f.id)));

    const currentParent = String(item.parentId || 'root');
    let opts = `<option value="root" ${currentParent === 'root' ? 'selected' : ''}>📁 Home (Radice)</option>`;
    availableFolders.forEach(f => {
        opts += `<option value="${f.id}" ${currentParent === String(f.id) ? 'selected' : ''}>${escHtml(f.title)}</option>`;
    });

    openModal(`Sposta "${escHtml(item.title)}"`, `
        <div class="form-group">
            <label>Cartella di Destinazione</label>
            <select id="move-target" class="form-control">${opts}</select>
        </div>
        <button class="btn primary" onclick="saveMove('${itemId}')" style="width:100%; justify-content:center;">Sposta</button>
    `);
}

window.saveMove = function(itemId) {
    const item = appData.files.find(f => String(f.id) === String(itemId));
    if (!item) return;
    item.parentId = document.getElementById('move-target').value;
    saveData();
    modal.classList.add('hidden');
    renderFiles();
    showToast('Elemento spostato con successo.', 'success');
}

window.deleteFile = function(event, itemId) {
    event.stopPropagation();
    if (confirm("Attenzione: Sei sicuro di voler eliminare questo elemento? (Se è una cartella, eliminerà automaticamente anche tutti i file e sottocartelle al suo interno).")) {
        let toDelete = [String(itemId)];
        let foundNew = true;
        while(foundNew) {
            foundNew = false;
            appData.files.forEach(f => {
                const parentStr = String(f.parentId || 'root');
                if (toDelete.includes(parentStr) && !toDelete.includes(String(f.id))) {
                    toDelete.push(String(f.id));
                    foundNew = true;
                }
            });
        }
        appData.files = appData.files.filter(f => !toDelete.includes(String(f.id)));
        saveData();
        renderFiles();
    }
}

window.moveFileItem = function(event, itemId, direction) {
    event.stopPropagation();
    const item = appData.files.find(f => String(f.id) === String(itemId));
    if (!item) return;
    // Lavora solo sui fratelli dello stesso tipo (cartelle vs file) nella stessa cartella
    const siblings = appData.files.filter(f =>
        String(f.parentId || 'root') === String(item.parentId || 'root') &&
        !!f.isFolder === !!item.isFolder
    );
    const idx = siblings.findIndex(f => String(f.id) === String(itemId));
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= siblings.length) return;
    const gi1 = appData.files.findIndex(f => String(f.id) === String(siblings[idx].id));
    const gi2 = appData.files.findIndex(f => String(f.id) === String(siblings[newIdx].id));
    [appData.files[gi1], appData.files[gi2]] = [appData.files[gi2], appData.files[gi1]];
    saveData();
    renderFiles();
}

// ==========================================
// GOOGLE DRIVE LINK FILES
// ==========================================
window.openGDriveModal = function() {
    openModal("Aggiungi da Google Drive", `
        <div class="form-group">
            <label>Nome File</label>
            <input type="text" id="gdrive-title" class="form-control" placeholder="Es. Programma Settimanale">
        </div>
        <div class="form-group">
            <label>Link di condivisione Google Drive</label>
            <input type="url" id="gdrive-url" class="form-control" placeholder="https://drive.google.com/...">
            <p style="font-size:0.78rem; color:var(--text-muted); margin-top:6px;">Su Drive: tasto destro sul file → <strong>Condividi</strong> → <strong>Chiunque abbia il link</strong> → copia il link.</p>
        </div>
        <p style="font-size:0.82rem; color:var(--text-muted); background:var(--bg-main); padding:10px 12px; border-radius:8px; border-left:3px solid #4285f4; margin-bottom:16px;">
            ✅ Il file rimarrà sempre aggiornato: ogni modifica su Google Drive sarà visibile immediatamente agli utenti.
        </p>
        <button class="btn primary" onclick="addGDriveFile()" style="width:100%; justify-content:center; background:#4285f4;">
            <span class="material-symbols-outlined" style="font-size:16px;">add_to_drive</span> Aggiungi file Drive
        </button>
    `);
    setTimeout(() => { const inp = document.getElementById('gdrive-title'); if(inp) inp.focus(); }, 50);
}

window.addGDriveFile = function() {
    const title = document.getElementById('gdrive-title').value.trim();
    const url = document.getElementById('gdrive-url').value.trim();
    if (!title) { showToast('Inserisci un nome per il file.', 'error'); return; }
    if (!url || (!url.includes('drive.google.com') && !url.includes('docs.google.com'))) {
        showToast('Inserisci un link Google Drive valido.', 'error'); return;
    }
    if (!appData.files) appData.files = [];
    const d = new Date();
    const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
    appData.files.push({
        id: generateId(),
        title: title,
        url: url,
        type: 'gdrive',
        isGDrive: true,
        date: dateStr,
        parentId: window.currentFolderId,
        isFolder: false
    });
    saveData();
    modal.classList.add('hidden');
    renderFiles();
    showToast('File Google Drive aggiunto.', 'success');
}

// ==========================================
// DROPBOX LINK FILES
// ==========================================
window.openDropboxModal = function() {
    openModal("Aggiungi da Dropbox", `
        <div class="form-group">
            <label>Nome File</label>
            <input type="text" id="dropbox-title" class="form-control" placeholder="Es. Scaletta Serata">
        </div>
        <div class="form-group">
            <label>Link di condivisione Dropbox</label>
            <input type="url" id="dropbox-url" class="form-control" placeholder="https://www.dropbox.com/...">
            <p style="font-size:0.78rem; color:var(--text-muted); margin-top:6px;">Su Dropbox: tasto destro sul file → <strong>Condividi</strong> → <strong>Copia link</strong>. Assicurati che sia impostato su "Chiunque abbia il link".</p>
        </div>
        <p style="font-size:0.82rem; color:var(--text-muted); background:var(--bg-main); padding:10px 12px; border-radius:8px; border-left:3px solid #0061fe; margin-bottom:16px;">
            ✅ Il file rimarrà sempre aggiornato: ogni modifica su Dropbox sarà visibile immediatamente.
        </p>
        <button class="btn primary" onclick="addDropboxFile()" style="width:100%; justify-content:center; background:#0061fe;">
            <span class="material-symbols-outlined" style="font-size:16px;">cloud</span> Aggiungi file Dropbox
        </button>
    `);
    setTimeout(() => { const inp = document.getElementById('dropbox-title'); if(inp) inp.focus(); }, 50);
}

window.addDropboxFile = function() {
    const title = document.getElementById('dropbox-title').value.trim();
    const url = document.getElementById('dropbox-url').value.trim();
    if (!title) { showToast('Inserisci un nome per il file.', 'error'); return; }
    if (!url || !url.includes('dropbox.com')) {
        showToast('Inserisci un link Dropbox valido.', 'error'); return;
    }
    if (!appData.files) appData.files = [];
    const d = new Date();
    const dateStr = `${d.getDate().toString().padStart(2,'0')}/${(d.getMonth()+1).toString().padStart(2,'0')}`;
    appData.files.push({
        id: generateId(),
        title, url,
        type: 'dropbox',
        isDropbox: true,
        date: dateStr,
        parentId: window.currentFolderId,
        isFolder: false
    });
    saveData();
    modal.classList.add('hidden');
    renderFiles();
    showToast('File Dropbox aggiunto.', 'success');
}

// ==========================================
// SPETTACOLI & SCALETTE
// ==========================================
let spettFilterAttivo = 'tutti';

function renderSpettacoli() {
    const el = document.getElementById('spettacoli-list');
    if (!el) return;
    const lista = (appData.spettacoli || []).slice().sort((a, b) => (a.data || '') > (b.data || '') ? 1 : -1);
    const filtrati = spettFilterAttivo === 'tutti' ? lista : lista.filter(s => s.stato === spettFilterAttivo);

    if (filtrati.length === 0) {
        el.innerHTML = `<div class="empty-state"><span class="material-symbols-outlined">theater_comedy</span><p>${spettFilterAttivo === 'tutti' ? 'Nessuno spettacolo. Aggiungine uno!' : 'Nessuno spettacolo in questa categoria.'}</p></div>`;
        return;
    }

    const statoLabels = { bozza: 'Bozza', confermato: 'Confermato', completato: 'Completato' };
    const statoColors = { bozza: '#f59e0b', confermato: '#3b82f6', completato: '#10b981' };
    const tipoIcons  = { cabaret:'comedy_mask', musica:'music_note', show:'star', disco:'nightlife', giochi:'sports_esports', altro:'event' };

    el.innerHTML = filtrati.map(s => {
        const scaletta = s.scaletta || [];
        const durataTot = scaletta.reduce((acc, n) => acc + (parseInt(n.durata) || 0), 0);
        const stato = s.stato || 'bozza';
        const isAdmin = currentRole === 'admin';
        return `<div class="spett-card" onclick="openSpettacoloDetail('${s.id}')">
            <div class="spett-card-header">
                <div style="display:flex; align-items:center; gap:10px;">
                    <span class="material-symbols-outlined spett-tipo-icon">${tipoIcons[s.tipo] || 'event'}</span>
                    <div>
                        <div class="spett-title">${escHtml(s.titolo)}</div>
                        <div class="spett-meta">
                            <span class="material-symbols-outlined" style="font-size:13px;">calendar_today</span> ${s.data ? formatDateIT(s.data) : '—'}
                            &nbsp;·&nbsp;
                            <span class="material-symbols-outlined" style="font-size:13px;">schedule</span> ${s.orario || '—'}
                            &nbsp;·&nbsp;
                            <span class="material-symbols-outlined" style="font-size:13px;">location_on</span> ${escHtml(s.luogo || '—')}
                        </div>
                    </div>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                    <span class="spett-stato-badge" style="background:${statoColors[stato]}22; color:${statoColors[stato]}; border:1px solid ${statoColors[stato]}44;">${statoLabels[stato]}</span>
                    ${isAdmin ? `<button class="btn-icon" onclick="event.stopPropagation(); deleteSpettacolo('${s.id}')" title="Elimina" style="color:var(--danger);"><span class="material-symbols-outlined" style="font-size:18px;">delete</span></button>` : ''}
                </div>
            </div>
            <div class="spett-card-body">
                <div class="spett-stat"><span class="material-symbols-outlined" style="font-size:15px;">format_list_numbered</span> ${scaletta.length} numeri</div>
                <div class="spett-stat"><span class="material-symbols-outlined" style="font-size:15px;">timer</span> ${durataTot > 0 ? durataTot + ' min totali' : 'Durata n.d.'}</div>
                ${s.note ? `<div class="spett-stat" style="color:var(--text-muted);font-style:italic;"><span class="material-symbols-outlined" style="font-size:15px;">sticky_note_2</span> ${escHtml(s.note)}</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function formatDateIT(dateStr) {
    if (!dateStr) return '—';
    const [y, m, d] = dateStr.split('-');
    return `${d}/${m}/${y}`;
}

window.filterSpettacoli = function(filtro) {
    spettFilterAttivo = filtro;
    document.querySelectorAll('[data-spett-filter]').forEach(b => b.classList.toggle('active', b.dataset.spettFilter === filtro));
    renderSpettacoli();
}

window.openSpettacoloDetail = function(id) {
    const s = (appData.spettacoli || []).find(x => x.id === id);
    if (!s) return;
    const scaletta = s.scaletta || [];
    const isAdmin = currentRole === 'admin';
    const statoOpts = ['bozza','confermato','completato'].map(v =>
        `<option value="${v}" ${s.stato===v?'selected':''}>${v.charAt(0).toUpperCase()+v.slice(1)}</option>`).join('');

    const scalettaHTML = scaletta.length === 0
        ? `<p style="color:var(--text-muted); font-size:0.85rem; text-align:center; padding:16px 0;">Nessun numero in scaletta.</p>`
        : scaletta.map((n, i) => `
            <div class="scaletta-row">
                <span class="scaletta-num">${i + 1}</span>
                <div class="scaletta-info">
                    <div class="scaletta-titolo">${escHtml(n.titolo)}</div>
                    <div class="scaletta-sub">
                        ${n.performer ? `<span><span class="material-symbols-outlined" style="font-size:12px;">person</span> ${escHtml(n.performer)}</span>` : ''}
                        ${n.durata ? `<span><span class="material-symbols-outlined" style="font-size:12px;">timer</span> ${n.durata} min</span>` : ''}
                        ${n.tipo ? `<span><span class="material-symbols-outlined" style="font-size:12px;">label</span> ${escHtml(n.tipo)}</span>` : ''}
                    </div>
                    ${n.note ? `<div style="font-size:0.78rem; color:var(--text-muted); margin-top:2px; font-style:italic;">${escHtml(n.note)}</div>` : ''}
                </div>
                ${isAdmin ? `<div style="display:flex; gap:4px;">
                    <button class="btn-icon" onclick="openEditNumeroModal('${s.id}','${n.id}')" title="Modifica"><span class="material-symbols-outlined" style="font-size:16px;">edit</span></button>
                    <button class="btn-icon" onclick="deleteNumero('${s.id}','${n.id}')" title="Elimina" style="color:var(--danger);"><span class="material-symbols-outlined" style="font-size:16px;">delete</span></button>
                </div>` : ''}
            </div>`).join('');

    openModal(escHtml(s.titolo), `
        <div class="spett-detail">
            ${isAdmin ? `<div style="display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap;">
                <button class="btn primary" onclick="openEditSpettacoloModal('${s.id}')" style="flex:1; justify-content:center; font-size:0.82rem;">
                    <span class="material-symbols-outlined" style="font-size:16px;">edit</span> Modifica
                </button>
                <select class="form-control" onchange="cambiaStatoSpettacolo('${s.id}', this.value)" style="flex:1; font-size:0.82rem;">${statoOpts}</select>
            </div>` : ''}
            <div class="spett-detail-info">
                <div class="event-detail-row"><span class="material-symbols-outlined">calendar_today</span><div><strong>Data</strong><p>${formatDateIT(s.data)}</p></div></div>
                <div class="event-detail-row"><span class="material-symbols-outlined">schedule</span><div><strong>Orario</strong><p>${s.orario || '—'}</p></div></div>
                <div class="event-detail-row"><span class="material-symbols-outlined">location_on</span><div><strong>Luogo</strong><p>${escHtml(s.luogo || '—')}</p></div></div>
                ${s.note ? `<div class="event-detail-row"><span class="material-symbols-outlined">sticky_note_2</span><div><strong>Note</strong><p>${escHtml(s.note)}</p></div></div>` : ''}
            </div>
            <div style="display:flex; align-items:center; justify-content:space-between; margin:20px 0 10px;">
                <h4 style="margin:0; font-size:0.95rem; font-weight:600;">Scaletta</h4>
                ${isAdmin ? `<button class="btn primary" onclick="openAddNumeroModal('${s.id}')" style="padding:5px 12px; font-size:0.8rem; gap:4px;">
                    <span class="material-symbols-outlined" style="font-size:15px;">add</span> Numero
                </button>` : ''}
            </div>
            <div id="scaletta-container-${s.id}">${scalettaHTML}</div>
        </div>
    `);
}

window.openAddSpettacoloModal = function() {
    openModal('Nuovo Spettacolo', `
        <div class="form-group"><label>Titolo *</label><input type="text" id="sp-titolo" class="form-control" placeholder="Es. Serata Cabaret"></div>
        <div class="form-group"><label>Data</label><input type="date" id="sp-data" class="form-control"></div>
        <div class="form-group"><label>Orario</label><input type="time" id="sp-orario" class="form-control"></div>
        <div class="form-group"><label>Luogo</label><input type="text" id="sp-luogo" class="form-control" placeholder="Es. Teatro, Spiaggia, Piscina"></div>
        <div class="form-group"><label>Tipo</label>
            <select id="sp-tipo" class="form-control">
                <option value="cabaret">Cabaret</option>
                <option value="musica">Musica Live</option>
                <option value="show">Show</option>
                <option value="disco">Discoteca</option>
                <option value="giochi">Giochi & Gare</option>
                <option value="altro">Altro</option>
            </select>
        </div>
        <div class="form-group"><label>Note</label><textarea id="sp-note" class="form-control" rows="2" placeholder="Informazioni utili per il team..."></textarea></div>
        <button class="btn primary" onclick="addSpettacolo()" style="width:100%; justify-content:center;">Crea Spettacolo</button>
    `);
    setTimeout(() => document.getElementById('sp-titolo')?.focus(), 50);
}

window.addSpettacolo = function() {
    const titolo = document.getElementById('sp-titolo').value.trim();
    if (!titolo) { showToast('Il titolo è obbligatorio.', 'error'); return; }
    if (!appData.spettacoli) appData.spettacoli = [];
    appData.spettacoli.push({
        id: 'sp' + generateId(),
        titolo,
        data:   document.getElementById('sp-data').value,
        orario: document.getElementById('sp-orario').value,
        luogo:  document.getElementById('sp-luogo').value.trim(),
        tipo:   document.getElementById('sp-tipo').value,
        note:   document.getElementById('sp-note').value.trim(),
        stato:  'bozza',
        scaletta: []
    });
    saveData(); renderSpettacoli(); modal.classList.add('hidden');
    showToast('Spettacolo creato!', 'success');
}

window.openEditSpettacoloModal = function(id) {
    const s = (appData.spettacoli || []).find(x => x.id === id);
    if (!s) return;
    modal.classList.add('hidden');
    setTimeout(() => {
        openModal('Modifica Spettacolo', `
            <div class="form-group"><label>Titolo *</label><input type="text" id="sp-titolo" class="form-control" value="${escHtml(s.titolo)}"></div>
            <div class="form-group"><label>Data</label><input type="date" id="sp-data" class="form-control" value="${s.data || ''}"></div>
            <div class="form-group"><label>Orario</label><input type="time" id="sp-orario" class="form-control" value="${s.orario || ''}"></div>
            <div class="form-group"><label>Luogo</label><input type="text" id="sp-luogo" class="form-control" value="${escHtml(s.luogo || '')}"></div>
            <div class="form-group"><label>Tipo</label>
                <select id="sp-tipo" class="form-control">
                    ${['cabaret','musica','show','disco','giochi','altro'].map(t => `<option value="${t}" ${s.tipo===t?'selected':''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Note</label><textarea id="sp-note" class="form-control" rows="2">${escHtml(s.note || '')}</textarea></div>
            <button class="btn primary" onclick="saveSpettacolo('${id}')" style="width:100%; justify-content:center;">Salva Modifiche</button>
        `);
    }, 150);
}

window.saveSpettacolo = function(id) {
    const s = (appData.spettacoli || []).find(x => x.id === id);
    if (!s) return;
    const titolo = document.getElementById('sp-titolo').value.trim();
    if (!titolo) { showToast('Il titolo è obbligatorio.', 'error'); return; }
    s.titolo  = titolo;
    s.data    = document.getElementById('sp-data').value;
    s.orario  = document.getElementById('sp-orario').value;
    s.luogo   = document.getElementById('sp-luogo').value.trim();
    s.tipo    = document.getElementById('sp-tipo').value;
    s.note    = document.getElementById('sp-note').value.trim();
    saveData(); renderSpettacoli(); modal.classList.add('hidden');
    showToast('Spettacolo aggiornato.', 'success');
}

window.cambiaStatoSpettacolo = function(id, stato) {
    const s = (appData.spettacoli || []).find(x => x.id === id);
    if (!s) return;
    s.stato = stato;
    saveData(); renderSpettacoli();
    showToast('Stato aggiornato.', 'success');
}

window.deleteSpettacolo = function(id) {
    if (!confirm('Eliminare questo spettacolo e tutta la scaletta?')) return;
    appData.spettacoli = (appData.spettacoli || []).filter(x => x.id !== id);
    saveData(); renderSpettacoli();
    showToast('Spettacolo eliminato.', 'success');
}

window.openAddNumeroModal = function(spId) {
    const staffList = (appData.staff || []).map(p => `<option value="${escHtml(p.name)}">${escHtml(p.name)}</option>`).join('');
    modal.classList.add('hidden');
    setTimeout(() => {
        openModal('Aggiungi Numero', `
            <div class="form-group"><label>Titolo numero *</label><input type="text" id="num-titolo" class="form-control" placeholder="Es. Apertura con danza"></div>
            <div class="form-group"><label>Tipo</label>
                <select id="num-tipo" class="form-control">
                    <option value="">— Seleziona —</option>
                    <option>Danza</option><option>Canto</option><option>Comicità</option>
                    <option>Giochi</option><option>Musica Live</option><option>Presentazione</option>
                    <option>Fuochi/Effetti</option><option>Ospite</option><option>Altro</option>
                </select>
            </div>
            <div class="form-group"><label>Performer / Staff</label>
                <input type="text" id="num-performer" class="form-control" list="staff-datalist" placeholder="Nome o nomi del team">
                <datalist id="staff-datalist">${staffList}</datalist>
            </div>
            <div class="form-group"><label>Durata (minuti)</label><input type="number" id="num-durata" class="form-control" min="1" max="120" placeholder="Es. 10"></div>
            <div class="form-group"><label>Note</label><input type="text" id="num-note" class="form-control" placeholder="Costume, musica, props..."></div>
            <button class="btn primary" onclick="addNumero('${spId}')" style="width:100%; justify-content:center;">Aggiungi alla Scaletta</button>
        `);
        setTimeout(() => document.getElementById('num-titolo')?.focus(), 50);
    }, 150);
}

window.addNumero = function(spId) {
    const titolo = document.getElementById('num-titolo').value.trim();
    if (!titolo) { showToast('Il titolo è obbligatorio.', 'error'); return; }
    const s = (appData.spettacoli || []).find(x => x.id === spId);
    if (!s) return;
    if (!s.scaletta) s.scaletta = [];
    s.scaletta.push({
        id: 'n' + generateId(),
        titolo,
        tipo:      document.getElementById('num-tipo').value,
        performer: document.getElementById('num-performer').value.trim(),
        durata:    document.getElementById('num-durata').value,
        note:      document.getElementById('num-note').value.trim()
    });
    saveData(); modal.classList.add('hidden');
    showToast('Numero aggiunto!', 'success');
    setTimeout(() => openSpettacoloDetail(spId), 200);
}

window.openEditNumeroModal = function(spId, numId) {
    const s = (appData.spettacoli || []).find(x => x.id === spId);
    const n = (s?.scaletta || []).find(x => x.id === numId);
    if (!n) return;
    const staffList = (appData.staff || []).map(p => `<option value="${escHtml(p.name)}">${escHtml(p.name)}</option>`).join('');
    modal.classList.add('hidden');
    setTimeout(() => {
        openModal('Modifica Numero', `
            <div class="form-group"><label>Titolo *</label><input type="text" id="num-titolo" class="form-control" value="${escHtml(n.titolo)}"></div>
            <div class="form-group"><label>Tipo</label>
                <select id="num-tipo" class="form-control">
                    <option value="">— Seleziona —</option>
                    ${['Danza','Canto','Comicità','Giochi','Musica Live','Presentazione','Fuochi/Effetti','Ospite','Altro'].map(t => `<option ${n.tipo===t?'selected':''}>${t}</option>`).join('')}
                </select>
            </div>
            <div class="form-group"><label>Performer / Staff</label>
                <input type="text" id="num-performer" class="form-control" list="staff-datalist2" value="${escHtml(n.performer || '')}">
                <datalist id="staff-datalist2">${staffList}</datalist>
            </div>
            <div class="form-group"><label>Durata (min)</label><input type="number" id="num-durata" class="form-control" value="${n.durata || ''}" min="1" max="120"></div>
            <div class="form-group"><label>Note</label><input type="text" id="num-note" class="form-control" value="${escHtml(n.note || '')}"></div>
            <button class="btn primary" onclick="saveNumero('${spId}','${numId}')" style="width:100%; justify-content:center;">Salva Modifiche</button>
        `);
    }, 150);
}

window.saveNumero = function(spId, numId) {
    const s = (appData.spettacoli || []).find(x => x.id === spId);
    const n = (s?.scaletta || []).find(x => x.id === numId);
    if (!n) return;
    const titolo = document.getElementById('num-titolo').value.trim();
    if (!titolo) { showToast('Il titolo è obbligatorio.', 'error'); return; }
    n.titolo    = titolo;
    n.tipo      = document.getElementById('num-tipo').value;
    n.performer = document.getElementById('num-performer').value.trim();
    n.durata    = document.getElementById('num-durata').value;
    n.note      = document.getElementById('num-note').value.trim();
    saveData(); modal.classList.add('hidden');
    showToast('Numero aggiornato.', 'success');
    setTimeout(() => openSpettacoloDetail(spId), 200);
}

window.deleteNumero = function(spId, numId) {
    if (!confirm('Eliminare questo numero dalla scaletta?')) return;
    const s = (appData.spettacoli || []).find(x => x.id === spId);
    if (!s) return;
    s.scaletta = (s.scaletta || []).filter(x => x.id !== numId);
    saveData(); modal.classList.add('hidden');
    showToast('Numero rimosso.', 'success');
    setTimeout(() => openSpettacoloDetail(spId), 200);
}

// ==========================================
// CHAT TEAM
// ==========================================
let chatListener = null;
let lastSeenChatTimestamp = parseInt(localStorage.getItem('chat_last_seen') || '0');
let chatInitialized = false;

function canWriteInChat() {
    if (currentRole === 'admin') return true;
    const myEmail = localStorage.getItem('logistic_torre_email') || '';
    const allowed = (appData.chatSettings && appData.chatSettings.allowedWriters) || [];
    return allowed.includes(myEmail);
}

function renderChatInputBar() {
    const bar  = document.getElementById('chat-input-bar');
    const noPerm = document.getElementById('chat-no-permission');
    if (!bar || !noPerm) return;
    if (canWriteInChat()) {
        bar.classList.remove('hidden');
        noPerm.classList.add('hidden');
    } else {
        bar.classList.add('hidden');
        noPerm.classList.remove('hidden');
    }
}

function renderChatPermissionsPanel() {
    const el = document.getElementById('chat-permissions-list');
    if (!el || currentRole !== 'admin') return;
    const allowed  = (appData.chatSettings && appData.chatSettings.allowedWriters) || [];
    const users    = (appData.registeredUsers || []).filter(u => u.email);
    if (users.length === 0) {
        el.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;">Nessun utente registrato.</p>';
        return;
    }
    el.innerHTML = users.map(u => {
        const isAllowed = allowed.includes(u.email);
        const fullName  = `${u.firstName || ''} ${u.lastName || ''}`.trim();
        return `<div class="chat-perm-row">
            <div class="chat-perm-info">
                <span class="chat-perm-name">${escHtml(fullName)}</span>
                <span class="chat-perm-role">${escHtml(u.role || 'animatore')}</span>
            </div>
            <label class="toggle-switch">
                <input type="checkbox" ${isAllowed ? 'checked' : ''} onchange="toggleChatPermission('${escHtml(u.email)}', this.checked)">
                <span class="toggle-slider"></span>
            </label>
        </div>`;
    }).join('');
}

window.toggleChatPermissionsPanel = function() {
    const panel = document.getElementById('chat-permissions-panel');
    if (!panel) return;
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) renderChatPermissionsPanel();
}

window.toggleChatPermissionsBody = function() {
    const body  = document.getElementById('chat-permissions-body');
    const arrow = document.getElementById('chat-perm-arrow');
    if (!body) return;
    const collapsed = body.style.display === 'none';
    body.style.display  = collapsed ? '' : 'none';
    if (arrow) arrow.style.transform = collapsed ? 'rotate(0deg)' : 'rotate(-90deg)';
}

window.toggleChatPermission = function(email, enabled) {
    if (!appData.chatSettings) appData.chatSettings = {};
    if (!appData.chatSettings.allowedWriters) appData.chatSettings.allowedWriters = [];
    if (enabled) {
        if (!appData.chatSettings.allowedWriters.includes(email)) appData.chatSettings.allowedWriters.push(email);
    } else {
        appData.chatSettings.allowedWriters = appData.chatSettings.allowedWriters.filter(e => e !== email);
    }
    saveData();
    showToast(enabled ? 'Permesso concesso.' : 'Permesso revocato.', enabled ? 'success' : 'info');
}

function initChat() {
    if (chatInitialized) return;
    chatInitialized = true;
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    renderChatInputBar();
    renderChatPermissionsPanel();

    const chatRef = db.ref('chatMessages');
    chatListener = chatRef.limitToLast(200).on('value', (snap) => {
        const data = snap.val();
        const messages = data ? Object.entries(data).map(([k, v]) => ({ _key: k, ...v })) : [];
        messages.sort((a, b) => a.timestamp - b.timestamp);
        renderChatMessages(messages);
        updateChatBadge(messages);
        renderChatInputBar();
    });
}

function renderChatMessages(messages) {
    const el = document.getElementById('chat-messages');
    if (!el) return;
    const myEmail = localStorage.getItem('logistic_torre_email') || '';
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;

    if (messages.length === 0) {
        el.innerHTML = `<div class="chat-empty"><span class="material-symbols-outlined">chat_bubble_outline</span><p>Nessun messaggio. Inizia la conversazione!</p></div>`;
        return;
    }

    let html = '';
    let lastDate = '';
    messages.forEach(msg => {
        const d = new Date(msg.timestamp);
        const dateStr = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });
        if (dateStr !== lastDate) {
            html += `<div class="chat-date-divider"><span>${dateStr}</span></div>`;
            lastDate = dateStr;
        }
        const isMine = msg.email === myEmail;
        const time = d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        const initial = (msg.author || '?')[0].toUpperCase();
        const isAdminMsg = msg.role === 'admin';
        const roleLabel = isAdminMsg ? '<span class="chat-role-badge admin">Capo</span>' : '';
        const canEdit   = isMine || currentRole === 'admin';
        const canDelete = isMine || currentRole === 'admin';
        const editedLabel = msg.edited ? '<span style="font-size:0.68rem;color:var(--text-muted);font-style:italic;margin-left:4px;">(modificato)</span>' : '';
        html += `<div class="chat-message ${isMine ? 'mine' : 'theirs'}" data-msg-key="${msg._key}">
            ${!isMine ? `<div class="chat-avatar">${initial}</div>` : ''}
            <div class="chat-bubble-wrap">
                ${!isMine ? `<div class="chat-author">${escHtml(msg.author)} ${roleLabel}</div>` : ''}
                <div class="chat-bubble">${escHtml(msg.text)}</div>
                <div class="chat-time">${time}${editedLabel}
                    ${canEdit   ? `<button class="chat-delete-btn" onclick="editChatMessage('${msg._key}',\`${escHtml(msg.text).replace(/`/g,'\\`')}\`)" title="Modifica"><span class="material-symbols-outlined" style="font-size:13px;">edit</span></button>` : ''}
                    ${canDelete ? `<button class="chat-delete-btn" onclick="deleteChatMessage('${msg._key}','${escHtml(msg.email)}')" title="Elimina" style="color:var(--danger);"><span class="material-symbols-outlined" style="font-size:13px;">delete</span></button>` : ''}
                </div>
            </div>
        </div>`;
    });
    el.innerHTML = html;
    if (isAtBottom || document.getElementById('view-chat')?.classList.contains('hidden') === false) {
        setTimeout(() => { el.scrollTop = el.scrollHeight; }, 50);
    }
}

function updateChatBadge(messages) {
    if (!document.getElementById('view-chat')?.classList.contains('hidden')) {
        markChatSeen();
        return;
    }
    const myEmail = localStorage.getItem('logistic_torre_email') || '';
    const unseen = messages.filter(m => m.timestamp > lastSeenChatTimestamp && m.email !== myEmail).length;
    const badge = document.getElementById('chat-badge');
    if (!badge) return;
    if (unseen > 0) {
        badge.textContent = unseen > 9 ? '9+' : unseen;
        badge.classList.remove('hidden');
        setAppBadge(unseen);
    } else {
        badge.classList.add('hidden');
        setAppBadge(0);
    }
}

function markChatSeen() {
    const now = Date.now();
    lastSeenChatTimestamp = now;
    localStorage.setItem('chat_last_seen', now);
    const badge = document.getElementById('chat-badge');
    if (badge) badge.classList.add('hidden');
    setAppBadge(0);
}

function handleViewFromUrl() {
    // Controlla hash (#view=chat) — più affidabile con PWA e OneSignal
    let view = null;
    const hash = window.location.hash;
    if (hash && hash.startsWith('#view=')) {
        view = hash.replace('#view=', '');
        window.history.replaceState({}, '', '/');
    }
    // Controlla URL param (?view=chat) come fallback
    if (!view) {
        const params = new URLSearchParams(window.location.search);
        view = params.get('view');
        if (view) window.history.replaceState({}, '', '/');
    }
    // Controlla localStorage come ultimo fallback
    if (!view) {
        view = localStorage.getItem('pending_nav_view');
        if (view) localStorage.removeItem('pending_nav_view');
    }
    if (!view) return;
    setTimeout(() => navigateTo(view), 1000);
}

// Messaggio dal Service Worker (click su notifica)
if (navigator.serviceWorker) {
    navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NAVIGATE_TO' && event.data.view) {
            setTimeout(() => navigateTo(event.data.view), 300);
        }
    });
}

// Hash change (notifica apre app con #view=chat) — Android + iOS background
window.addEventListener('hashchange', () => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#view=')) {
        const view = hash.replace('#view=', '');
        window.history.replaceState({}, '', '/');
        setTimeout(() => navigateTo(view), 300);
    }
});

// App torna in primo piano — controlla hash + localStorage (iOS + Android)
document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    // Controlla hash aggiornato
    const hash = window.location.hash;
    if (hash && hash.startsWith('#view=')) {
        const view = hash.replace('#view=', '');
        window.history.replaceState({}, '', '/');
        setTimeout(() => navigateTo(view), 300);
        return;
    }
    // Controlla localStorage
    const view = localStorage.getItem('pending_nav_view');
    if (view) {
        localStorage.removeItem('pending_nav_view');
        setTimeout(() => navigateTo(view), 400);
    }
});

// Fallback: focus della finestra (alcuni browser iOS usano questo invece di visibilitychange)
window.addEventListener('focus', () => {
    const hash = window.location.hash;
    if (hash && hash.startsWith('#view=')) {
        const view = hash.replace('#view=', '');
        window.history.replaceState({}, '', '/');
        setTimeout(() => navigateTo(view), 300);
    }
});

function setAppBadge(count) {
    if (!navigator.setAppBadge) return;
    if (count > 0) {
        navigator.setAppBadge(count).catch(() => {});
    } else {
        navigator.clearAppBadge().catch(() => {});
    }
}

window.sendChatMessage = function() {
    if (!canWriteInChat()) { showToast('Non hai il permesso di scrivere in chat.', 'error'); return; }
    const input = document.getElementById('chat-input');
    const text = (input?.value || '').trim();
    if (!text) return;
    const author = localStorage.getItem('logistic_torre_username') || currentUsername || 'Anonimo';
    const email  = localStorage.getItem('logistic_torre_email') || '';
    const role   = localStorage.getItem('logistic_torre_role') || currentRole || 'animatore';
    db.ref('chatMessages').push({ text, author, email, role, timestamp: Date.now() });
    sendPushNotification(`💬 ${author}`, text, email, 'chat');
    input.value = '';
    input.focus();
}

window.deleteChatMessage = function(key, msgEmail) {
    const myEmail = localStorage.getItem('logistic_torre_email') || '';
    if (currentRole !== 'admin' && msgEmail !== myEmail) {
        showToast('Puoi eliminare solo i tuoi messaggi.', 'error'); return;
    }
    if (!confirm('Eliminare questo messaggio?')) return;
    db.ref('chatMessages/' + key).remove();
}

window.editChatMessage = function(key, currentText) {
    const msgEl  = document.querySelector(`[data-msg-key="${key}"]`);
    const bubble = msgEl?.querySelector('.chat-bubble');
    if (!bubble) return;
    bubble.innerHTML = `<textarea class="chat-edit-input" id="chat-edit-${key}">${currentText}</textarea>
        <div class="chat-edit-actions">
            <button class="btn-small" onclick="cancelChatEdit('${key}',\`${currentText.replace(/`/g,'\\`')}\`)">Annulla</button>
            <button class="btn-small primary" onclick="saveChatEdit('${key}')">Salva</button>
        </div>`;
    const ta = document.getElementById(`chat-edit-${key}`);
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
}

window.cancelChatEdit = function(key, originalText) {
    const msgEl  = document.querySelector(`[data-msg-key="${key}"]`);
    const bubble = msgEl?.querySelector('.chat-bubble');
    if (bubble) bubble.innerHTML = escHtml(originalText);
}

window.saveChatEdit = function(key) {
    const ta = document.getElementById(`chat-edit-${key}`);
    if (!ta) return;
    const newText = ta.value.trim();
    if (!newText) { showToast('Il messaggio non può essere vuoto.', 'error'); return; }
    db.ref('chatMessages/' + key).update({ text: newText, edited: true });
    showToast('Messaggio modificato.', 'success');
}

// Invio con Enter nella chat
const chatInputEl = document.getElementById('chat-input');
if (chatInputEl) {
    chatInputEl.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });
}

init();
