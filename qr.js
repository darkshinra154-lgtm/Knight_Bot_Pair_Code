import express from 'express';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import { delay } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { v4 as uuidv4 } from 'uuid';
import Session from './models/Session.js';

const router = express.Router();

function removeFile(FilePath) {
try {
if (!fs.existsSync(FilePath)) return false;
fs.rmSync(FilePath, { recursive: true, force: true });
return true;
} catch (e) { return false; }
}

router.get('/', async (req, res) => {
const sessionId = uuidv4();
const tempDir = path.join(os.tmpdir(), `sukuna_qr_${sessionId}`);
fs.mkdirSync(tempDir, { recursive: true });

let responseSent = false;

async function initiateSession() {
const { state, saveCreds } = await useMultiFileAuthState(tempDir);
try {
const { version } = await fetchLatestBaileysVersion();
let sock = makeWASocket({
version,
logger: pino({ level: 'silent' }),
browser: Browsers.windows('Chrome'),
auth: {
creds: state.creds,
keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
},
markOnlineOnConnect: false,
generateHighQualityLinkPreview: false,
defaultQueryTimeoutMs: 60000,
connectTimeoutMs: 60000,
keepAliveIntervalMs: 30000,
retryRequestDelayMs: 250,
maxRetries: 5,
});

sock.ev.on('connection.update', async (update) => {
const { connection, lastDisconnect, qr } = update;
if (qr && !responseSent) {
try {
const qrDataURL = await QRCode.toDataURL(qr);
if (!responseSent) {
responseSent = true;
res.send({ qr: qrDataURL, instructions: ['1. Open WhatsApp', '2. Settings > Linked Devices', '3. Tap "Link a Device"', '4. Scan QR'] });
}
} catch (err) { console.error(err); }
}
if (connection === 'open') {
console.log("✅ Connected!");
try {
const credsData = fs.readFileSync(path.join(tempDir, 'creds.json'), 'utf-8');
// Get phone from session
const phone = sock.authState.creds.me?.id?.split(':')[0] || 'unknown';
const existing = await Session.findOne({ phoneNumber: phone });
if (existing) {
existing.creds = credsData;
existing.status = 'active';
existing.updatedAt = new Date();
await existing.save();
} else {
await Session.create({ phoneNumber: phone, creds: credsData, status: 'active' });
}
console.log("✅ Session saved to MongoDB");
} catch (err) { console.error(err); }
removeFile(tempDir);
}
if (connection === 'close') {
const statusCode = lastDisconnect?.error?.output?.statusCode;
if (statusCode === 401) { removeFile(tempDir); }
else { initiateSession(); }
}
});
sock.ev.on('creds.update', saveCreds);
} catch (err) {
console.error(err);
if (!responseSent) { responseSent = true; res.status(503).send({ code: 'Service Unavailable' }); }
removeFile(tempDir);
}
}
await initiateSession();
setTimeout(() => {
if (!responseSent) {
responseSent = true;
res.status(408).send({ code: 'QR timeout' });
removeFile(tempDir);
}
}, 30000);
});

export default router;
