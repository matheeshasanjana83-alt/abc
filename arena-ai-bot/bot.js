/**
 * Arena AI — private WhatsApp bot:  .ai <question>  +  .download <link> [link2 ...]
 * Works only for YOU (messages you send). Others are ignored silently.
 */
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const pino = require('pino');
// Baileys v7 (ESM-only) — LID support. v6 could not decrypt LID-addressed messages (Bad MAC) and sent ACKs that WhatsApp bans.
let B = null;
const loadBaileys = async () => (B ||= await import('baileys'));
const { download, human, MAX_BYTES } = require('./downloader');
const ai = require('./ai');
const updater = require('./updater');

const AUTH = path.join(__dirname, 'auth');
const sentIds = new Set();
const msgStore = new Map();          // recent messages → getMessage() for retry requests ("Waiting for this message" fix)
const seen = new Set();              // processed message ids (dedupe notify/append)
const STARTED = Math.floor(Date.now() / 1000);
let announced = false;
const retryCache = (() => { const m = new Map(); return { get: (k) => m.get(k), set: (k, v) => { m.set(k, v); if (m.size > 1000) m.delete(m.keys().next().value); }, del: (k) => m.delete(k), flushAll: () => m.clear() }; })();
function remember(msg) {
    if (!msg?.key?.id || !msg.message) return;
    msgStore.set(msg.key.id, msg.message);
    if (msgStore.size > 500) msgStore.delete(msgStore.keys().next().value);
}
const log = (t) => console.log(`[${new Date().toLocaleTimeString('en-GB')}] ${t}`);
let pairingAsked = false;

function ask(q) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((r) => rl.question(q, (a) => { rl.close(); r(a); }));
}

function getText(m) {
    let x = m;
    for (let i = 0; i < 5 && x; i++) {
        const inner = x.deviceSentMessage?.message || x.ephemeralMessage?.message || x.viewOnceMessage?.message || x.viewOnceMessageV2?.message || x.documentWithCaptionMessage?.message || x.editedMessage?.message;
        if (!inner) break;
        x = inner;
    }
    return (x?.conversation || x?.extendedTextMessage?.text || x?.imageMessage?.caption || x?.documentMessage?.caption || '').trim();
}

const HELP = `🤖 *Arena AI*

*.ai <ප්‍රශ්නය>*  — AI එකෙන් අහන්න (සිංහල OK)
  • message එකකට reply කරලා *.ai* ගැහුවොත් ඒ message එක ගැන අහනවා
  • *.ai reset* — කතාව අලුතෙන් පටන් ගන්න
*.download <link>*  — file එක download කරලා එවනවා (*.dl*)
  • links කිහිපයක් එකට: .download link1 link2
*.setkey gemini <KEY>*  /  *.setkey groq <KEY>*  — free API key දාන්න
*.keys*  — keys තියෙනවද බලන්න
*.update*  — bot එක GitHub එකෙන් update කරන්න (pair කරන්න ඕනේ නෑ)
*.version*  — දැන් තියෙන version එක
*.ping*  — bot එක වැඩද බලන්න

📥 Download support: direct links, GitHub, Google Drive, MediaFire, MEGA, Dropbox, Pixeldrain, litterbox/catbox, x0.at, filebin...
📏 Max: ${human(MAX_BYTES)} per file`;

async function start() {
    const { default: makeWASocket, useMultiFileAuthState, DisconnectReason, Browsers, fetchLatestBaileysVersion, makeCacheableSignalKeyStore } = await loadBaileys();
    fs.mkdirSync(AUTH, { recursive: true });
    const { state, saveCreds } = await useMultiFileAuthState(AUTH);
    let version;
    try { version = (await fetchLatestBaileysVersion()).version; } catch { version = [2, 3000, 1043857760]; }
    const logger = pino({ level: 'silent' });

    const sock = makeWASocket({
        version, logger,
        browser: Browsers.macOS('Chrome'),
        auth: { creds: state.creds, keys: makeCacheableSignalKeyStore(state.keys, logger) },
        markOnlineOnConnect: false,
        syncFullHistory: false,
        shouldSyncHistoryMessage: () => false,
        msgRetryCounterCache: retryCache,
        getMessage: async (key) => msgStore.get(key?.id),
    });
    sock.ev.on('creds.update', saveCreds);

    const send = async (jid, content, opts) => {
        const s = await sock.sendMessage(jid, content, opts);
        if (s?.key?.id) { sentIds.add(s.key.id); if (sentIds.size > 500) sentIds.delete(sentIds.values().next().value); remember(s); }
        return s;
    };

    sock.ev.on('connection.update', async ({ connection, lastDisconnect, qr }) => {
        if (qr && !sock.authState.creds.registered && !pairingAsked) {
            pairingAsked = true;
            let num = String(process.env.WA_PHONE_NUMBER || '').replace(/\D/g, '');
            if (!num) num = String(await ask('📱 ඔයාගේ WhatsApp number එක (උදා 94771234567): ')).replace(/\D/g, '');
            if (num.startsWith('0')) num = '94' + num.slice(1);
            try {
                let code;
                for (let i = 0; i < 3 && !code; i++) {
                    try { code = await sock.requestPairingCode(num); }
                    catch (e) { if (i === 2) throw e; await new Promise(r => setTimeout(r, 3000)); }
                }
                code = code.match(/.{1,4}/g).join('-');
                console.log('\n════════════════════════════════════');
                console.log(`   🔢 PAIRING CODE:  ${code}`);
                console.log('════════════════════════════════════');
                console.log('WhatsApp → Linked devices → Link a device →');
                console.log('"Link with phone number instead" → මේ code එක ගහන්න\n');
            } catch (e) { log('❌ Pairing code fail: ' + e.message); pairingAsked = false; }
        }
        if (connection === 'open') {
            log('✅ WhatsApp Connected! "Message yourself" chat එකේ .ping ගහලා බලන්න');
            if (announced) return;
            announced = true;
            try { await send(sock.user.id.split(':')[0] + '@s.whatsapp.net', { text: '✅ *Arena AI online!*\n\n' + HELP }); } catch { }
        }
        if (connection === 'close') {
            const code = lastDisconnect?.error?.output?.statusCode;
            if (code === DisconnectReason.loggedOut) {
                log('❌ Logged out (device එක unlink කළා). Session එක මකලා නවත්තනවා — ආයෙත් npm start කරලා pair කරන්න.');
                fs.rmSync(AUTH, { recursive: true, force: true });
                process.exit(0);
            }
            log(`⚠️ Connection වැහුණා (${code ?? '?'}) — තත්පර 3 කින් ආයෙත් connect වෙනවා...`);
            pairingAsked = code === 515 ? pairingAsked : false;
            setTimeout(() => start().catch(e => log('start error: ' + e.message)), 3000);
        }
    });

    sock.ev.on('messages.upsert', (u) => onMessages(u, send, (key) => sock.sendMessage(key.remoteJid, { delete: key }).catch(() => { })));
}

async function onMessages({ messages, type }, send, del = async () => { }) {
        for (const msg of messages || []) {
            try {
                remember(msg);
                if (msg.key?.fromMe && !msg.message && msg.messageStubType) log(`⚠️ message එකක් decrypt කරගන්න බැරි වුණා (stub ${msg.messageStubType}) — phone එකෙන් ආයෙත් එවයි`);
                if (!msg.message || !msg.key?.fromMe) continue;        // 🔒 PRIVATE: only messages YOU send
                if (sentIds.has(msg.key.id) || seen.has(msg.key.id)) continue; // own replies / already handled
                const ts = Number(msg.messageTimestamp || 0);
                if (type !== 'notify' && ts && ts < STARTED - 60) continue;   // old history — don't re-run old commands
                seen.add(msg.key.id); if (seen.size > 1000) seen.delete(seen.values().next().value);
                const text = getText(msg.message);
                if (!text.startsWith('.')) continue;
                const jid = msg.key.remoteJid;
                log(`📩 command: ${text.slice(0, 60)}  (${type})`);
                const [cmd, ...rest] = text.split(/\s+/);
                const c = cmd.toLowerCase();

                if (c === '.ping') { await send(jid, { text: '🏓 Pong! Arena AI වැඩ ✅' }, { quoted: msg }); continue; }
                if (c === '.help' || c === '.menu') { await send(jid, { text: HELP }, { quoted: msg }); continue; }
                if (c === '.ai' || c === '.ask' || c === '.gpt') { await handleAI(send, jid, msg, rest.join(' ')); continue; }
                if (c === '.setkey' || c === '.delkey') { await handleKey(send, del, jid, msg, c, rest); continue; }
                if (c === '.update') { await handleUpdate(send, jid, msg, rest[0] === 'force'); continue; }
                if (c === '.version') {
                    const cur = updater.localInfo();
                    let t = `🤖 *Arena AI* v${cur.version}${cur.sha ? ' (' + cur.sha.slice(0, 7) + ')' : ''}`;
                    try { const ch = await updater.check(); t += ch.upToDate ? '\n✅ අලුත්ම version එක' : `\n🆕 Update එකක් තියෙනවා: v${ch.latest.manifest.version}\n➡️ *.update* ගහන්න`; } catch (e) { t += '\n(update check fail: ' + e.message + ')'; }
                    await send(jid, { text: t }, { quoted: msg }); continue;
                }
                if (c === '.keys') { const k = ai.getKeys(); await send(jid, { text: `🔑 *API keys*\nGemini: ${k.gemini ? '✅ ' + mask(k.gemini) : '❌ නෑ'}\nGroq: ${k.groq ? '✅ ' + mask(k.groq) : '❌ නෑ'}` }, { quoted: msg }); continue; }
                if (!['.download', '.dl', '.dn'].includes(c)) continue;

                const links = (text.match(/https?:\/\/\S+/g) || []).slice(0, 10);
                if (!links.length) { await send(jid, { text: HELP }, { quoted: msg }); continue; }
                for (const link of links) await handleDownload(send, jid, msg, link);
            } catch (e) { log('handler error: ' + e.message); }
        }
}

const mask = (k) => k.slice(0, 4) + '••••' + k.slice(-3);
const KEY_HELP = `🔑 *Free API key එකක් ගන්න:*

*Gemini (Google):*
1. https://aistudio.google.com/apikey open කරන්න (Google account එකෙන් login)
2. *Create API key* ඔබලා key එක copy කරන්න
3. මෙතන ගහන්න:  *.setkey gemini ඔයාගේ_key*

*Groq:*
1. https://console.groq.com/keys open කරන්න (login)
2. *Create API Key* → copy
3. *.setkey groq ඔයාගේ_key*

(දෙකම දැම්මොත් හොඳයි — එකක් fail වුණොත් අනිත් එක auto පාවිච්චි කරනවා)`;

async function handleKey(send, del, jid, msg, c, rest) {
    const provider = (rest[0] || '').toLowerCase();
    if (!['gemini', 'groq'].includes(provider)) return send(jid, { text: KEY_HELP }, { quoted: msg });
    if (c === '.delkey') { ai.setKey(provider, ''); return send(jid, { text: `🗑️ ${provider} key එක මැකුවා` }); }
    const key = (rest[1] || '').trim();
    if (key.length < 20) return send(jid, { text: KEY_HELP }, { quoted: msg });
    ai.setKey(provider, key);
    await del(msg.key); // key එක තියෙන message එක chat එකෙන් මකනවා (ආරක්ෂාවට)
    await send(jid, { text: `✅ ${provider} key එක save කළා (${mask(key)})\n🔒 key එක තිබ්බ message එක මැකුවා.\n\nදැන් test කරන්න: *.ai හායි*` });
}

function quotedText(msg) {
    const ctx = msg.message?.extendedTextMessage?.contextInfo;
    return ctx?.quotedMessage ? getText(ctx.quotedMessage) : '';
}

async function handleAI(send, jid, msg, question) {
    question = question.trim();
    if (/^(reset|new|clear)$/i.test(question)) { ai.reset(jid); return send(jid, { text: '🆕 කතාව reset කළා. අලුතෙන් අහන්න!' }, { quoted: msg }); }
    const q = quotedText(msg);
    if (q) question = question ? `${question}\n\n"""${q}"""` : `මේ message එක ගැන පැහැදිලි කරන්න:\n"""${q}"""`;
    if (!question) return send(jid, { text: '🤖 *.ai <ප්‍රශ්නය>*\nඋදා: .ai GTA SA වල cheats මොනවද?' }, { quoted: msg });
    const status = await send(jid, { text: '🤖 හිතනවා...' }, { quoted: msg });
    try {
        const { text, model } = await ai.ask(jid, question);
        const parts = ai.splitLong(text);
        await send(jid, { text: parts[0] + (parts.length === 1 ? `\n\n_— ${model}_` : ''), edit: status.key });
        for (let i = 1; i < parts.length; i++) await send(jid, { text: parts[i] + (i === parts.length - 1 ? `\n\n_— ${model}_` : '') });
        log(`🤖 ${model}: ${question.slice(0, 60)}`);
    } catch (e) {
        if (e.noKey) return send(jid, { text: '⚠️ AI key එකක් තවම දාලා නෑ.\n\n' + KEY_HELP, edit: status.key });
        await send(jid, { text: `❌ AI error:\n${String(e.message).slice(0, 400)}\n\n💡 Key එක හරිද බලන්න (*.keys*), නැත්නම් ටිකකින් ආයෙත් try කරන්න (free limit).`, edit: status.key });
        log('❌ AI: ' + e.message);
    }
}

let updating = false;
async function handleUpdate(send, jid, msg, force) {
    if (updating) return send(jid, { text: '⏳ Update එකක් දැනටමත් වෙනවා...' }, { quoted: msg });
    updating = true;
    const status = await send(jid, { text: '🔍 Update තියෙනවද බලනවා...' }, { quoted: msg });
    const edit = async (t) => { try { await send(jid, { text: t, edit: status.key }); } catch { } };
    try {
        const r = await updater.apply({ force, onStatus: edit });
        if (!r.updated) { updating = false; return edit(`✅ දැනටමත් අලුත්ම version එක (v${r.current.version})`); }
        await edit(`✅ *Update වුණා!*  v${r.from} → v${r.to}\n\n📝 ${r.notes}\n\n🔄 Restart වෙනවා... තත්පර 10 කින් *.ping* ගහලා බලන්න.\n(WhatsApp link එක / API keys වෙනස් වෙන්නේ නෑ)`);
        log(`🔄 Updated v${r.from} → v${r.to} — restarting`);
        if (!process.env.ARENA_LAUNCHER) await send(jid, { text: '⚠️ Bot එක *npm start* එකෙන් start කරලා නැති නිසා auto restart වෙන්නේ නෑ. Termux එකේ CTRL+C කරලා *npm start* ගහන්න.' });
        setTimeout(() => process.exit(100), 2500);
    } catch (e) {
        updating = false;
        await edit(`❌ Update fail වුණා:\n${String(e.message).slice(0, 300)}\n\n(පරණ version එක එහෙමම වැඩ)`);
        log('❌ update: ' + e.message);
    }
}

async function handleDownload(send, jid, msg, link) {
    const status = await send(jid, { text: `⏳ Download වෙනවා...\n${link}` }, { quoted: msg });
    let last = 0;
    const edit = async (t) => { try { await send(jid, { text: t, edit: status.key }); } catch { } };
    const onProgress = (loaded, total, speed) => {
        const now = Date.now();
        if (now - last < 4000) return;
        last = now;
        const pct = total ? Math.floor(loaded * 100 / total) : null;
        const bar = pct === null ? '' : '▰'.repeat(Math.round(pct / 10)) + '▱'.repeat(10 - Math.round(pct / 10)) + ` ${pct}%\n`;
        edit(`⬇️ Downloading...\n${bar}${human(loaded)} / ${human(total)}  •  ${human(speed)}/s`);
    };
    let files = [];
    try {
        files = await download(link, onProgress);
        for (const f of files) {
            await edit(`📤 WhatsApp එකට යවනවා... (${f.name}, ${human(f.size)})`);
            await send(jid, { document: { url: f.path }, fileName: f.name, mimetype: f.mime, caption: `✅ ${f.name}\n📦 ${human(f.size)}` }, { quoted: msg });
        }
        await edit(`✅ ඉවරයි — file ${files.length} ක් එව්වා`);
        log(`✅ ${link} → ${files.map(f => f.name + ' ' + human(f.size)).join(', ')}`);
    } catch (e) {
        await edit(`❌ Download fail වුණා\n${link}\n\n${String(e.message).slice(0, 300)}`);
        log(`❌ ${link}: ${e.message}`);
    } finally {
        for (const f of files) fs.rm(f.path, { force: true }, () => { });
    }
}

process.on('unhandledRejection', (e) => log('unhandled: ' + (e?.message || e)));
process.on('uncaughtException', (e) => log('uncaught: ' + e.message));
module.exports = { handleDownload, getText, onMessages };
if (require.main === module) {
    console.log('🚀 Arena AI starting...');
    start().catch((e) => { log('Startup fail: ' + e.message); process.exit(1); });
}
