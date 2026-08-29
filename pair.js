import express from 'express';
import pino from 'pino';
import { makeWASocket, useMultiFileAuthState, delay, makeCacheableSignalKeyStore, Browsers, jidNormalizedUser, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';
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
let num = req.query.number;
if (!num) return res.status(400).send({ code: 'Phone number required' });
num = num.replace(/[^0-9]/g, '');
const phone = pn('+' + num);
if (!phone.isValid()) {
return res.status(400).send({ code: 'Invalid phone number' });
}
num = phone.getNumber('e164').replace('+', '');

const tempDir = path.join(os.tmpdir(), `sukuna_${uuidv4()}`);
fs.mkdirSync(tempDir, { recursive: true });

async function initiateSession() {
const { state, saveCreds } = await useMultiFileAuthState(tempDir);
try {
const { version } = await fetchLatestBaileysVersion();
let sock = makeWASocket({
version,
auth: {
creds: state.creds,
keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "fatal" }).child({ level: "fatal" })),
},
printQRInTerminal: false,
logger: pino({ level: "fatal" }).child({ level: "fatal" }),
browser: Browsers.windows('Chrome'),
markOnlineOnConnect: false,
generateHighQualityLinkPreview: false,
defaultQueryTimeoutMs: 60000,
connectTimeoutMs: 60000,
keepAliveIntervalMs: 30000,
retryRequestDelayMs: 250,
maxRetries: 5,
});

sock.ev.on('connection.update', async (update) => {
const { connection, lastDisconnect, isNewLogin } = update;
if (connection === 'open') {
console.log("✅ Connected successfully!");
try {
const credsData = fs.readFileSync(path.join(tempDir, 'creds.json'), 'utf-8');
const existing = await Session.findOne({ phoneNumber: num });
if (existing) {
existing.creds = credsData;
existing.status = 'active';
existing.updatedAt = new Date();
await existing.save();
} else {
await Session.create({ phoneNumber: num, creds: credsData, status: 'active' });
}
console.log("✅ Session saved to MongoDB");
} catch (err) { console.error("Error saving session:", err); }
removeFile(tempDir);
console.log("🧹 Temp session cleaned");
}
if (connection === 'close') {
const statusCode = lastDisconnect?.error?.output?.statusCode;
if (statusCode === 401) {
console.log("❌ Logged out");
removeFile(tempDir);
} else {
console.log("🔄 Reconnecting...");
initiateSession();
}
}
});

if (!sock.authState.creds.registered) {
await delay(3000);
try {
let code = await sock.requestPairingCode(num);
code = code?.match(/.{1,4}/g)?.join('-') || code;
if (!res.headersSent) {
console.log({ num, code });
res.send({ code });
}
} catch (error) {
console.error(error);
if (!res.headersSent) res.status(503).send({ code: 'Failed to get pairing code' });
}
}
sock.ev.on('creds.update', saveCreds);
} catch (err) {
console.error(err);
if (!res.headersSent) res.status(503).send({ code: 'Service Unavailable' });
removeFile(tempDir);
}
}
await initiateSession();
});

export default router;
