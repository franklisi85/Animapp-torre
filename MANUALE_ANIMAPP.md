# ANIMAPP — Manuale Tecnico Completo
**Versione attuale:** app.js v4.22 · style.css v16 · SW animapp-v32  
**URL produzione:** https://torreserenalogistic26.netlify.app  
**Data:** Aprile 2026

---

## 1. COS'È ANIMAPP

AnimApp è una **Progressive Web App (PWA)** gestionale per il team di animazione di Torre Serena. Permette di:

- Gestire il **magazzino materiali** diviso in Settori e Reparti
- Monitorare le **richieste di rifornimento** con approvazione admin
- Pubblicare **avvisi** e un **ordine del giorno** con allegati
- Gestire il **calendario eventi** settimanale (2 settimane)
- Archiviare **file** in cartelle con anteprime
- Gestire lo **staff** con assegnazione ai Reparti
- Controllare gli **utenti registrati** con blocco/promozione di ruolo
- Ricevere **notifiche Telegram** su richieste e nuovi eventi

L'app funziona **offline** dopo il primo caricamento grazie al Service Worker. Non richiede backend proprio: tutto gira su Firebase e Netlify.

---

## 2. STRUTTURA DEI FILE

```
LOGISTIC TORRE/
├── index.html       640 righe  — HTML dell'intera app (unica pagina)
├── app.js          3386 righe  — Tutta la logica JavaScript
├── style.css       1465 righe  — Tutti gli stili
├── sw.js             52 righe  — Service Worker (cache PWA)
├── manifest.json     31 righe  — Configurazione PWA
├── cors.json          9 righe  — Regole CORS per Firebase Storage
└── icona-animapp.png           — Icona app (192×512 px)
```

**Non esiste backend.** Non ci sono cartelle `node_modules`, build step, né framework. Tutto è statico e viene servito direttamente da Netlify.

---

## 3. STACK TECNOLOGICO

| Componente | Tecnologia | Perché |
|---|---|---|
| Hosting | Netlify (piano Free) | Deploy drag & drop, HTTPS gratuito, CDN globale |
| Database | Firebase Realtime Database | Sync in tempo reale su tutti i client connessi |
| Storage file | Firebase Storage | File allegati (avvisi, ODG, cartelle) fuori da Netlify |
| Autenticazione | Nessuna (custom password) | Semplicità — non servono account Firebase Auth |
| Notifiche | Telegram Bot API | Gratuito, nessun server push necessario |
| Font | Google Fonts (Inter + Outfit) | CDN, zero peso locale |
| Icone | Material Symbols Outlined | CDN Google, icone vettoriali |
| PWA | Service Worker + manifest.json | App installabile, funziona offline |
| Lingua | HTML/CSS/JS vanilla | Nessuna dipendenza, nessun build |

---

## 4. AUTENTICAZIONE E RUOLI

### 4.1 Come funziona il login

Il login è **a 3 step**, gestito interamente in `app.js`:

1. **Step 1 — Identità**: nome, cognome, email + consenso privacy
   - Se l'email è nella lista `blockedEmails` → vai a step bloccato
   - Se l'email esiste già in `registeredUsers` → bentornato
   - Se è nuova → registrazione automatica con ruolo `animatore`

2. **Step 2 — Password team**: `TeamStaff2026`
   - Consente l'accesso come `animatore` o con il ruolo già assegnato

3. **Step Admin** (pulsante separato): password `Torre2026`
   - Accede come `admin` senza lasciare traccia in `registeredUsers`

Lo stato di login è salvato in `localStorage`:
```
logistic_torre_auth    = "true"
logistic_torre_role    = "admin" | "responsabile" | "animatore" | "operatore"
logistic_torre_username = "Nome Cognome"
logistic_torre_email   = "email@esempio.com"
```

### 4.2 I 4 ruoli

| Ruolo | Chi è | Cosa può fare |
|---|---|---|
| `admin` (Capo Equipe) | Tu | Tutto: creare/eliminare Settori, Reparti, materiali, avvisi con allegati, ODG con allegati, eventi, staff, promozione utenti, blocco email, rinominare sezioni dashboard, esportare CSV |
| `responsabile` | Capo reparto | Richiedere rifornimento materiali, aggiungere materiali al proprio reparto |
| `animatore` | Staff generico | Richiedere rifornimento materiali, aggiungere materiali |
| `operatore` | Personale operativo | Come animatore (stesse restrizioni) |

**Regola fondamentale**: `responsabile` e `operatore` **non possono** creare Settori, creare Reparti, eliminare materiali, accedere a staff/utenti/file. Possono **solo** richiedere e aggiungere materiali.

### 4.3 Visibilità elementi per ruolo

In CSS e HTML, gli elementi sensibili usano queste classi:
```css
.admin-only        → visibile solo se body ha classe .view-as-admin
.role-animatore-hide → nascosto per animatore
```

L'app applica la classe `view-as-{ruolo}` sul `body` a ogni cambio ruolo, in `applyRole()`.

---

## 5. FIREBASE — DATABASE E STORAGE

### 5.1 Configurazione Firebase

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyA1jGqWbQ_YYXVMMZSlqCvDAyhpiyDXO94",
  authDomain: "logistic-torreserena.firebaseapp.com",
  databaseURL: "https://logistic-torreserena-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "logistic-torreserena",
  storageBucket: "logistic-torreserena.firebasestorage.app",
  ...
};
```

Il progetto Firebase si chiama **logistic-torreserena** ed è in regione `europe-west1`.

### 5.2 Struttura dati in Firebase (nodo radice: `appData`)

```
appData/
├── sectors[]               — Settori del magazzino
│   ├── id, name, manager
│   └── materials[]         — Materiali (FLAT, senza attività intermedie)
│       └── id, name, total, available
├── sectorGroups[]          — Settori (raggruppamenti visivi sopra i Reparti)
│   └── id, name
├── staff[]                 — Schede staff
│   └── id, name, role, sectorIds[], bio, phone, email
├── events[]                — Calendario eventi
│   └── id, title, time, location, day, week, type, color
├── notifications[]         — Richieste in entrata (per admin)
│   └── id, secId, matId, matName, sectorName, qty, requester, timestamp
├── avvisi[]                — Post bacheca Dashboard
│   └── id, testo, autore, data, [fileUrl, fileName]
├── ordineGiorno[]          — Punti ODG Dashboard
│   └── id, testo, autore, data, type(image|file|text), [fileUrl, fileName, imageUrl]
├── files[]                 — File/cartelle sezione File
│   └── id, name, type(folder|file|image), parentId, [url, fileType, size]
├── registeredUsers[]       — Utenti che hanno fatto login
│   └── id, firstName, lastName, email, role, registeredAt, lastLogin, privacyConsentAt
├── blockedEmails[]         — Email bloccate dall'admin
├── operatori[]             — Operatori assegnabili ai Reparti
├── folderNotes{}           — Note per cartella (chiave = folderId)
├── pageNotes{}             — Note per pagina (chiave = pageName)
├── settings{}
│   └── blockRequests: bool — Blocca/sblocca richieste globali
└── dashboardSectionNames{} — Nomi personalizzati delle sezioni dashboard
    ├── avvisi: "Avvisi"
    ├── odg: "Ordine del Giorno"
    └── richieste: "Le Mie Richieste"
```

### 5.3 Come si leggono/scrivono i dati

**Lettura in tempo reale** (auto-aggiornamento su tutti i client):
```javascript
db.ref('appData').on('value', (snapshot) => {
    appData = snapshot.val();
    // ... normalizzazione e re-render
});
```

**Scrittura** (sostituisce l'intero nodo `appData`):
```javascript
window.saveData = function() {
    db.ref('appData').set(appData);
}
```

Ogni modifica chiama `saveData()` + la funzione `render*()` corrispondente per aggiornare la UI.

### 5.4 Firebase Storage (file allegati)

I file caricati dall'utente (avvisi, ODG, sezione File) vanno in **Firebase Storage**, non su Netlify. Questo è fondamentale per non consumare banda Netlify.

Percorsi Storage usati:
```
avvisi/{fileId}/{nomeFile}       — allegati agli avvisi
ordinegiorno/{fileId}/{nomeFile} — allegati all'ODG
files/{fileId}/{nomeFile}        — sezione File
```

Upload pattern:
```javascript
const fileRef = storage.ref(`avvisi/${fileId}/${file.name}`);
await fileRef.put(file);
const url = await fileRef.getDownloadURL();
```

Cancellazione file (chiamata anche al delete dell'avviso):
```javascript
storage.refFromURL(item.fileUrl).delete().catch(() => {});
```

### 5.5 CORS per Firebase Storage

Il file `cors.json` configura quali origini possono accedere allo Storage. Per applicarlo (solo se necessario, si fa da terminale con Google Cloud SDK):
```bash
gsutil cors set cors.json gs://logistic-torreserena.firebasestorage.app
```

Le origini autorizzate sono:
- `https://torreserenalogistic26.netlify.app` (produzione)
- `http://localhost:3000` e `http://localhost:5500` (sviluppo locale)

### 5.6 Migrazione automatica dati legacy

Nella lettura Firebase è integrata una migrazione automatica per chi aveva dati con la vecchia struttura (Settori → Attività → Materiali). La struttura attuale è **piatta**: Reparto → Materiali direttamente.

```javascript
appData.sectors.forEach(sec => {
    if (sec.activities) {
        if (!sec.materials) sec.materials = [];
        sec.activities.forEach(act => {
            (act.materials || []).forEach(mat => sec.materials.push(mat));
        });
        delete sec.activities;
        _migrated = true;
    }
});
if (_migrated) saveData(); // salva la struttura migrata, non ripete mai più
```

---

## 6. NOTIFICHE TELEGRAM

L'app usa **2 bot Telegram separati**:

| Bot | Token | Uso |
|---|---|---|
| Bot Magazzino | `8508370432:AAH9vv94...` | Richieste materiali (chi richiede, cosa, quanto) |
| Bot Eventi | `8387692912:AAFoXwjg...` | Nuovi eventi aggiunti al calendario |

**Chat ID configurati:**
- `843013302` — chat privata admin
- `-5217486033` — gruppo Telegram del team

Le notifiche usano `parse_mode: 'HTML'` per testo in grassetto/corsivo. La funzione base è:
```javascript
async function sendTelegramNotification(message, token, targetChatId) { ... }
```

Se il token è vuoto o invalido, la funzione fallisce silenziosamente (no errori bloccanti).

---

## 7. SEZIONI DELL'APP

### 7.1 Dashboard

Pagina iniziale. Contiene 3 sezioni riordinabili via drag & drop:

| Sezione | ID HTML | Contenuto |
|---|---|---|
| Avvisi | `dash-sec-avvisi` | Post testuali + allegato opzionale (qualsiasi file) |
| Ordine del Giorno | `dash-sec-odg` | Punti ODG con immagini o file allegati |
| Le Mie Richieste | `dash-sec-richieste` | Richieste fatte dall'utente loggato |

**Drag & drop sezioni**: le sezioni sono riordinabili trascinando l'icona `drag_indicator`. L'ordine è salvato in `localStorage`:
```
animapp_dash_order = ["dash-sec-avvisi","dash-sec-odg","dash-sec-richieste"]
```

**Rinomina sezioni (solo admin)**: accanto al titolo di ogni sezione appare un pulsante matita. I nomi personalizzati sono salvati in Firebase in `dashboardSectionNames`.

**Avvisi**: l'admin può aggiungere un post con testo + file opzionale (PDF, immagine, video, ZIP, ecc.). Il file va in Firebase Storage → `avvisi/{id}/`. Quando si cancella un avviso, il file relativo viene cancellato anche dallo Storage.

**ODG**: l'admin può aggiungere punti testo, immagini o qualsiasi file. Le immagini mostrano un'anteprima; gli altri file mostrano l'icona appropriata tramite la funzione `getFileIcon(fileName)`.

### 7.2 Magazzino (Inventory)

Struttura gerarchica a 2 livelli:
```
Settori (sectorGroups) → raggruppamenti
    └── Reparti (sectors) → ognuno con:
            └── Materiali (materials) — FLAT, senza livelli intermedi
```

**Solo admin può:**
- Creare/eliminare Settori e Reparti
- Eliminare materiali
- Approvare richieste rifornimento

**Tutti i ruoli possono:**
- Aggiungere materiali a un Reparto
- Richiedere rifornimento di un materiale

**Flusso rifornimento:**
1. Utente clicca "Richiedi" su un materiale → modal con quantità
2. Viene creata una notifica in `appData.notifications`
3. L'admin vede il badge rosso sul campanello
4. L'admin clicca "Approva" → `available` del materiale aumenta
5. Viene inviato messaggio Telegram al bot Magazzino

**Blocco richieste**: l'admin può bloccare tutte le richieste con un pulsante. Se attivo, il pulsante "Richiedi" mostra "Bloccato" e non è cliccabile (tranne per l'admin).

**Ricerca e filtri**: barra di ricerca live per nome materiale/reparto + chip filtro per Settore.

**Export CSV**: l'admin può esportare tutto il magazzino in formato CSV con colonne `Settore, Reparto, Materiale, Totale, Disponibili`.

### 7.3 Staff

Schede membro del team con:
- Nome, ruolo testuale, bio, telefono, email
- Assegnazione ai Reparti (array `sectorIds`)
- QR Code generato dinamicamente (link alla pagina prodotti del reparto)

L'admin può aggiungere, modificare, eliminare schede staff.

### 7.4 Calendario (Events)

Griglia settimanale su 2 settimane (Settimana 1 e Settimana 2).

Ogni evento ha:
- Titolo, orario, location, giorno (`mon`–`sun`), settimana (`1` o `2`)
- Tipo: evento normale o "Riposo"
- Colore personalizzabile

L'admin aggiunge/elimina eventi. All'aggiunta viene inviato messaggio Telegram al bot Eventi.

Filtri: per settimana, per tipo (eventi / riposo), ricerca testuale.

### 7.5 File

Sistema di cartelle e file con:
- Cartelle navigabili (breadcrumb)
- Upload immagini (anteprima) e file generici (icona)
- Note per cartella (admin)
- Condivisione singolo file (Web Share API)
- Ricerca e filtri per tipo

Tutti i file sono in Firebase Storage → `files/{id}/`.

### 7.6 Utenti (solo admin)

Tabella di tutti gli utenti registrati con:
- Cambio ruolo (animatore / responsabile / operatore)
- Blocco email (impedisce login)
- Visualizzazione data registrazione e ultimo accesso

---

## 8. PWA — PROGRESSIVE WEB APP

### 8.1 Cosa significa "PWA"

L'app può essere **installata sul telefono** come se fosse un'app nativa. Su iOS: Safari → Condividi → Aggiungi a schermata Home. Su Android: Chrome → "Installa app".

Una volta installata, si apre in modalità standalone (senza barra del browser), funziona offline e ha la propria icona nella schermata home.

### 8.2 manifest.json

Dice al browser come trattare l'app come PWA:
```json
{
  "name": "AnimApp",
  "short_name": "AnimApp",
  "start_url": "/",
  "display": "standalone",
  "orientation": "any",
  "theme_color": "#3b82f6",
  "background_color": "#1e293b",
  "icons": [{ "src": "icona-animapp.png", "sizes": "192x192" }],
  "share_target": { "action": "/", "method": "GET", "params": {...} }
}
```

Il `share_target` permette all'app di **ricevere link condivisi** da altre app (es. copia link da Safari, condividi ad AnimApp → apre modal richiesta rapida con quel link).

### 8.3 Service Worker (sw.js)

Gestisce la cache offline con strategia **Cache First pura**:

1. All'**installazione**: pre-carica in cache tutti i file statici (index.html, app.js, style.css, sw.js, manifest.json, icona)
2. Ad ogni **richiesta fetch**: risponde prima dalla cache, poi dalla rete
3. All'**attivazione**: elimina le cache vecchie e ricarica tutti i client aperti

```javascript
const CACHE_NAME = 'animapp-v32';  // ← incrementare ad ogni deploy
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/app.js?v=4.22',
    '/style.css?v=16',
    '/sw.js',
    '/manifest.json',
    '/icona-animapp.png'
];
```

**Perché questo approccio risparmia banda Netlify**: dopo il primo caricamento, il browser non contatta più Netlify per i file statici. Arriva tutto dalla cache locale. Ogni deploy invalida la cache (cambio `CACHE_NAME`) e il ciclo riparte.

---

## 9. DEPLOY SU NETLIFY

### 9.1 Procedura di deploy (drag & drop)

1. Apri **https://app.netlify.com**
2. Vai sul sito `torreserenalogistic26`
3. Trascina la **cartella `LOGISTIC TORRE`** nell'area "Deploys" (o clicca "Deploy manually")
4. Netlify carica tutti i file e pubblica in ~30 secondi
5. La nuova versione è immediatamente live

### 9.2 Cosa fare PRIMA di ogni deploy (checklist)

Ogni volta che modifichi `app.js` e/o `style.css`, devi:

- [ ] Incrementare la versione in `app.js` (es. `v=4.22` → `v=4.23`) — aggiornare anche il `<script src>` in `index.html`
- [ ] Incrementare la versione in `style.css` (es. `v=16` → `v=17`) — aggiornare anche il `<link href>` in `index.html`
- [ ] Aggiornare `CACHE_NAME` in `sw.js` (es. `animapp-v32` → `animapp-v33`)
- [ ] Aggiornare l'array `STATIC_ASSETS` in `sw.js` con le nuove versioni

**Perché è obbligatorio**: se il `CACHE_NAME` non cambia, i vecchi client continuano a usare la cache precedente e non vedono gli aggiornamenti. Cambiare `CACHE_NAME` è l'unico modo per forzare l'aggiornamento su tutti i dispositivi.

### 9.3 Versionamento attuale

```
app.js        → ?v=4.22   (in index.html riga 12 e in sw.js)
style.css     → ?v=16     (in index.html riga 11 e in sw.js)
sw.js         → animapp-v32 (CACHE_NAME in sw.js riga 1)
```

---

## 10. LAYOUT E MOBILE

### 10.1 Struttura HTML principale

```
#login-gate           — Schermata di login (nascosta dopo auth)
#app-container        — Tutta l'app
  .sidebar            — Menu laterale (icone + label)
  .main-content
    .topbar           — Barra superiore (titolo + notifiche + avatar)
    .content-wrapper  — Contenuto della pagina attiva
      .view#dashboard-view
      .view#inventory-view
      .view#staff-view
      .view#events-view
      .view#files-view
      .view#users-view
```

La navigazione avviene tramite `navigateTo(viewName)` che mostra/nasconde le `.view`.

### 10.2 Responsive: come funziona

L'app ha 3 breakpoint in `style.css` + stili inline in `index.html`:

| Breakpoint | Cosa cambia |
|---|---|
| `≤768px` (mobile) | Sidebar stretta 72px, topbar compatta, content-wrapper scrollabile |
| `≤768px portrait` | Calendario a colonna singola |
| `≤900px landscape` | Sidebar collassata a 56px, altezze in `dvh` |
| `≤600px` | Modal come bottom-sheet, notifiche come pannello slide-up |

### 10.3 iOS Safari — problema `100vh`

iOS Safari calcola `100vh` **includendo** la barra del browser (URL bar + barra bassa). Quando la barra si nasconde scrollando, il contenuto viene tagliato in basso.

**Soluzione applicata**: usare `100dvh` (dynamic viewport height) che si aggiorna dinamicamente, con `100vh` come fallback per browser vecchi.

```css
/* Doppia dichiarazione: il browser usa l'ultima che capisce */
.app-container { height: 100vh; height: 100dvh; }
.modal-content { max-height: 92vh; max-height: 92dvh; }
.notifications-dropdown { max-height: 75vh; max-height: 75dvh; }
```

### 10.4 Safe area per iPhone con notch/home indicator

Sui modelli iPhone con home indicator (X in poi), la barra inferiore occupa spazio. La variabile CSS `env(safe-area-inset-bottom)` la compensa:

```css
/* In index.html, @media (max-width: 768px) */
.content-wrapper {
    padding: 12px;
    padding-bottom: calc(12px + env(safe-area-inset-bottom, 0px));
}
```

Per funzionare, il `<meta name="viewport">` deve avere `viewport-fit=cover` (già impostato):
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=yes, viewport-fit=cover">
```

### 10.5 Drag & drop Dashboard (solo desktop/tablet)

Le 3 sezioni della Dashboard si possono riordinare trascinando l'icona `≡`. Implementato con HTML5 Drag & Drop API. L'ordine viene salvato in `localStorage`:

```javascript
localStorage.setItem('animapp_dash_order', JSON.stringify(['dash-sec-avvisi', 'dash-sec-richieste', 'dash-sec-odg']));
```

---

## 11. FUNZIONI CHIAVE IN app.js

| Funzione | Cosa fa |
|---|---|
| `finalizeLogin(role, name, email)` | Completa il login, salva in localStorage, chiama `applyRole()` |
| `applyRole()` | Aggiorna classe body, avatar, pulsante admin, ri-renderizza tutto |
| `saveData()` | Scrive `appData` in Firebase (`db.ref('appData').set(appData)`) |
| `renderDashboard()` | Ridisegna avvisi, ODG, richieste + titoli sezioni + pulsanti rename |
| `renderInventory()` | Ridisegna schede Settori → Reparti → Materiali |
| `renderStaff()` | Ridisegna schede staff |
| `renderEvents()` | Ridisegna griglia calendario |
| `renderFiles()` | Ridisegna sistema file/cartelle |
| `renderRegisteredUsers()` | Ridisegna tabella utenti (solo admin) |
| `showToast(msg, type)` | Mostra notifica visiva temporanea (3.5 sec) |
| `openModal(title, body)` | Apre il modal generico con titolo e corpo HTML |
| `generateId()` | Genera ID numerico univoco (timestamp + random) |
| `getFileIcon(fileName)` | Restituisce nome icona Material Symbol in base all'estensione |
| `initDashboardDrag()` | Inizializza drag & drop sezioni dashboard (chiamata una volta) |

---

## 12. SICUREZZA E ACCESSO

### 12.1 Cosa è protetto

- **Admin**: password `Torre2026` — richiesta ogni volta (non persistita tra sessioni refresh)
- **Team**: password `TeamStaff2026` — un'unica password per tutti i non-admin
- **Email bloccate**: l'admin può bloccare singoli utenti. Al prossimo login o al prossimo aggiornamento Firebase, l'utente viene espulso
- **`logistic_torre_auth`** in localStorage: se rimosso, il login viene mostrato nuovamente

### 12.2 Cosa NON è protetto

- Le regole di Firebase Database in questo momento sono probabilmente aperte (no Firebase Auth). Chiunque con la `databaseURL` potrebbe accedere direttamente al DB via API
- Le password sono nel codice sorgente JavaScript — chiunque ispeziona il sorgente le vede. È accettabile per un'app interna team, non per un prodotto pubblico

---

## 13. COME AGGIUNGERE NUOVE FUNZIONALITÀ

### Aggiungere un campo a un materiale

1. In `openAddMaterialModal(secId)` → aggiungi input HTML al modal
2. In `addMaterial(secId)` → leggi il valore e aggiungilo all'oggetto
3. In `buildSectorCard(sec, ...)` → mostra il nuovo campo nella lista
4. Bumpa versioni e deploya

### Aggiungere una nuova sezione all'app

1. In `index.html` → aggiungi `<div class="view" id="nome-view">` nel `content-wrapper`
2. In `index.html` → aggiungi `<li>` nel menu `.nav-links` con `onclick="navigateTo('nome')"`
3. In `app.js` → scrivi la funzione `renderNome()`
4. In `app.js`, in `applyRole()` → chiama `renderNome()` dove opportuno
5. Bumpa versioni e deploya

### Aggiungere un campo a Firebase

1. Aggiungi il campo a `DEFAULT_DATA` in `app.js`
2. Aggiungi la normalizzazione nel listener Firebase (`if (!appData.nuovoCampo) appData.nuovoCampo = ...`)
3. Usa il campo nei `render*()` appropriati
4. Bumpa versioni e deploya

---

## 14. TROUBLESHOOTING COMUNE

| Problema | Causa | Soluzione |
|---|---|---|
| L'app non aggiorna dopo il deploy | Service Worker sta servendo la cache vecchia | Bumpa `CACHE_NAME` in sw.js → redeploya |
| Su iOS il contenuto è tagliato in basso | Browser chrome iOS | Già fixato con `dvh` + `safe-area-inset-bottom` |
| File non si carica (Storage) | CORS non configurato o bucket errato | Verifica `cors.json` e riesegui `gsutil cors set` |
| Utente non vede le modifiche in tempo reale | Firebase Realtime DB disconnesso | Controlla connessione e regole Firebase |
| Admin non riesce ad accedere | Password errata o logout automatico | Reinserire `Torre2026` dalla schermata login |
| Richiesta Telegram non arriva | Bot token errato o chat ID sbagliato | Verifica `TELEGRAM_CONFIG` in app.js |

---

## 15. RIEPILOGO VERSIONI CORRENTI

```
CACHE_NAME (sw.js)    : animapp-v32
app.js versione       : ?v=4.22
style.css versione    : ?v=16
Firebase progetto     : logistic-torreserena (europe-west1)
Netlify sito          : torreserenalogistic26.netlify.app
```

**La prossima volta che modifichi codice, le versioni da aggiornare diventano:**
- `app.js?v=4.23` (se modifichi app.js)
- `style.css?v=17` (se modifichi style.css)  
- `CACHE_NAME = 'animapp-v33'` (sempre, ad ogni deploy)
- Aggiorna anche `STATIC_ASSETS` in sw.js di conseguenza
