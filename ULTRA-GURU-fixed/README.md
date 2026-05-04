[![Typing SVG](https://readme-typing-svg.herokuapp.com?font=Rockstar-ExtraBold&color=00b8ff&lines=FORK+AND+STAR+THE+REPO+BEFORE+DEPLOYMENT)](https://git.io/typing-svg)

<p align="center">
  <a href="https://github.com/GuruhTech/ULTRA-GURU">
    <img src="https://files.catbox.moe/5evber.jpg" width="100%" alt="ULTRA GURU Banner">
  </a>
</p>

<h1 align="center">🎖️ ULTRA GURU MD 🎖️</h1>

<p align="center">
  <a href="https://github.com/GuruhTech"><img title="Author" src="https://img.shields.io/badge/AUTHOR-GURUTECH+LAB-00b8ff?style=for-the-badge&logo=github"></a>
  <a href="https://github.com/GuruhTech/ULTRA-GURU/stargazers/"><img title="Stars" src="https://img.shields.io/github/stars/GuruhTech/ULTRA-GURU?style=social"></a>
  <a href="https://github.com/GuruhTech/ULTRA-GURU/network/members"><img title="Forks" src="https://img.shields.io/github/forks/GuruhTech/ULTRA-GURU?style=social"></a>
  <img src="https://komarev.com/ghpvc/?username=GuruhTech&label=PROFILE+VIEWS&color=00b8ff&style=for-the-badge" alt="Profile Views">
</p>

---

## 📸 Screenshots

### 🖥️ Bot Running on VPS / Panel (KataBump)

![VPS Console](https://files.catbox.moe/vps_screenshot_placeholder.jpg)

The screenshot above shows the bot fully initialised on a VPS/Panel deployment:
- ✅ Session file loaded (Direct Base64)
- ✅ Server running on port 5000
- ✅ Database synchronised
- ✅ ULTRA GURU settings initialised
- ✅ LID store initialised with 6948 mappings from 22 groups
- ✅ Auto-followed 2 channel(s)
- ✅ Bot connected to WhatsApp (Active)
- ✅ Auto-update check passed

> **To add your own screenshot:** Replace the URL above with a link to your hosted image (e.g. upload to [Catbox](https://catbox.moe) or [Imgur](https://imgur.com)).

---

### 💬 Bot in Action — WhatsApp (`.play` command)

![WhatsApp Demo](https://files.catbox.moe/wa_screenshot_placeholder.jpg)

The screenshot above shows the `.play helplessly` command in action:
1. User sends `.play helplessly`
2. Bot fetches **Helplessly | Tatiana Manaois** (Official Music Video, 3:17)
3. Bot presents download options: **Audio 🎵** or **Document 📄**, plus a YouTube link
4. User selects Audio — bot delivers a 3.1 MB audio file directly in chat

> **To add your own screenshot:** Replace the URL above with a link to your hosted image.

---

## 🛠️ QUICK SETUP

**1. FORK THE REPO**
<p align="left">
  <a href="https://github.com/GuruhTech/ULTRA-GURU/fork">
    <img src="https://img.shields.io/badge/FORK%20REPO-1E90FF?style=for-the-badge&logo=github&logoColor=white" alt="Fork Repo">
  </a>
</p>

**2. DOWNLOAD ZIP (For Panel Users)**
<p align="left">
  <a href="https://github.com/GuruhTech/ULTRA-GURU/archive/refs/heads/main.zip">
    <img src="https://img.shields.io/badge/DOWNLOAD%20ZIP-4169E1?style=for-the-badge&logo=github&logoColor=white" alt="Download ZIP">
  </a>
</p>

**3. GET SESSION ID**
<p align="left">
  <a href="https://ultra-guru-pair-1.onrender.com/pair">
    <img src="https://img.shields.io/badge/PAIR%20CODE-00b8ff?style=for-the-badge&logo=link&logoColor=white" alt="Pair Code">
  </a>
  <a href="https://ultra-guru-pair-1.onrender.com/qr">
    <img src="https://img.shields.io/badge/SCAN%20QR%20CODE-1E90FF?style=for-the-badge&logo=qrcode&logoColor=white" alt="QR Code">
  </a>
</p>

---

## 🚀 DEPLOYMENT METHODS

#### ☁️ Heroku
<p align="left">
  <a href="https://dashboard.heroku.com/new?template=https://github.com/GuruhTech/ULTRA-GURU">
    <img src="https://img.shields.io/badge/DEPLOY%20TO%20HEROKU-430098?style=for-the-badge&logo=heroku&logoColor=white" alt="Deploy to Heroku">
  </a>
</p>

#### ☁️ KataBump
<p align="left">
  <a href="https://dashboard.katabump.com/auth/login#f98658">
    <img src="https://img.shields.io/badge/DEPLOY%20ON%20KATABUMP-4169E1?style=for-the-badge&logo=rocket&logoColor=white" alt="Deploy on KataBump">
  </a>
</p>

#### 🐧 VPS / Termux
```bash
git clone https://github.com/GuruhTech/ULTRA-GURU.git
cd ULTRA-GURU
npm install
npm start
```

---

## 🐛 Bug Fixes — WhatsApp Hanging & Missing Messages

> **Issue:** Users reported WhatsApp freezing/hanging and the bot not receiving messages, especially on deployments active in 20+ groups.

### Root Cause Analysis

Three separate bugs combined to produce the symptoms:

---

### Bug 1 — `guru/connection/groupCache.js`: Metadata Fetch Storm

**Problem:** Every message in a group that wasn't cached triggered a live `Gifted.groupMetadata(jid)` API call to WhatsApp. With 22+ groups sending messages simultaneously, this spawned dozens of parallel WA socket requests, saturating the connection and causing the bot to appear "hung" with no new messages arriving.

**Fix:** Added a `_pendingFetches` Map to deduplicate in-flight fetches. If a fetch for a group is already in progress, all other callers await the same Promise instead of firing duplicate requests.

```js
// guru/connection/groupCache.js — key change
const _pendingFetches = new Map();

const getGroupMetadata = async (Gifted, jid) => {
    const cached = groupCache.get(jid);
    if (cached) return cached;

    // Return existing in-flight promise — no duplicate API calls
    if (_pendingFetches.has(jid)) return _pendingFetches.get(jid);

    const fetchPromise = Gifted.groupMetadata(jid)
        .then(metadata => {
            if (metadata) groupCache.set(jid, metadata);
            _pendingFetches.delete(jid);
            return metadata;
        })
        .catch(err => { _pendingFetches.delete(jid); return null; });

    _pendingFetches.set(jid, fetchPromise);
    return fetchPromise;
};
```

---

### Bug 2 — `guru/connection/connectionHandler.js`: Newsletter Listener Blocking All Messages

**Problem:** The newsletter reaction listener ran async code for **every single** `messages.upsert` event — including group messages, DMs, and status updates — before checking whether the JID was actually a newsletter. Under high message load this created a growing async backlog that delayed or dropped message processing entirely.

**Fix:** Filter for newsletter JIDs at the very top of the handler, returning immediately for all other message types.

```js
// guru/connection/connectionHandler.js — key change
Gifted.ev.on("messages.upsert", async ({ messages }) => {
    // Skip ALL non-newsletter messages before any async work
    const newsletterMsgs = messages.filter(m => m?.key?.remoteJid?.endsWith("@newsletter"));
    if (newsletterMsgs.length === 0) return;
    // ... rest only runs for newsletter messages
});
```

---

### Bug 3 — `guru/database/messageStore.js`: Duplicate Listener on Reconnect

**Problem:** `SQLiteStore.bind(ev)` registered a fresh `messages.upsert` listener each time it was called. After a reconnect, the old listener was never removed, so every message was saved twice (or more after multiple reconnects). This caused memory growth and redundant SQLite writes that eventually lagged the event loop enough to miss messages.

**Fix:** Detach any previously registered handler before attaching a new one.

```js
// guru/database/messageStore.js — key change
bind(ev) {
    if (this._handler) {
        ev.off('messages.upsert', this._handler); // Remove stale listener
    }
    this._handler = ({ messages }) => { /* ... */ };
    ev.on('messages.upsert', this._handler);
}
```

---

### Summary of Changed Files

| File | What Changed |
|------|-------------|
| `guru/connection/groupCache.js` | Added `_pendingFetches` deduplication for concurrent group metadata fetches |
| `guru/connection/connectionHandler.js` | Early-exit newsletter listener for non-newsletter JIDs |
| `guru/database/messageStore.js` | Remove stale listener before re-binding after reconnect |

---

## 📋 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `SESSION_ID` | WhatsApp session ID from the pairing site | ✅ |
| `OWNER_NUMBER` | Bot owner's phone number (country code, no `+`) | ✅ |
| `BOT_NAME` | Display name for the bot | Optional |
| `PREFIX` | Command prefix (default: `.`) | Optional |
| `MODE` | `public` or `private` | Optional |

---

## 📞 Support

<p align="left">
  <a href="https://whatsapp.com/channel/0029VagQ91T6xCSuMCQGrE2T">
    <img src="https://img.shields.io/badge/JOIN%20CHANNEL-25D366?style=for-the-badge&logo=whatsapp&logoColor=white" alt="WhatsApp Channel">
  </a>
</p>

---

<p align="center">Made with ❤️ by <strong>GuruTech Lab</strong></p>
