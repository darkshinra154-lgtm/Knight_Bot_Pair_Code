import express from 'express';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import {makeWASocket,useMultiFileAuthState,makeCacheableSignalKeyStore,Browsers,jidNormalizedUser,fetchLatestBaileysVersion} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import SubBotSession from './models/SubBotSession.js';
const router=express.Router();
function removeFile(FilePath){try{if(!fs.existsSync(FilePath))return false;fs.rmSync(FilePath,{recursive:true,force:true});}catch(e){console.error('Error:',e);}}
router.get('/',async(req,res)=>{
const sessionId=Date.now().toString()+Math.random().toString(36).substr(2,9);
const dirs=`./sessions/qr_${sessionId}`;
if(!fs.existsSync('./sessions'))fs.mkdirSync('./sessions');
async function initiateSession(){
if(!fs.existsSync(dirs))fs.mkdirSync(dirs,{recursive:true});
const{state,saveCreds}=await useMultiFileAuthState(dirs);
try{
const{version}=await fetchLatestBaileysVersion();
let qrGenerated=false,responseSent=false;
const handleQRCode=async(qr)=>{
if(qrGenerated||responseSent)return;
qrGenerated=true;
try{
const qrDataURL=await QRCode.toDataURL(qr,{errorCorrectionLevel:'M',type:'image/png',quality:0.92,margin:1,color:{dark:'#8B0000',light:'#000000'}});
if(!responseSent){
responseSent=true;
res.send({qr:qrDataURL,message:'امسح الكود بكاميرا واتساب.'});
}
}catch(e){if(!responseSent){responseSent=true;res.status(500).send({code:'فشل توليد الكود'});}}
};
const sock=makeWASocket({
version,logger:pino({level:'silent'}),browser:Browsers.windows('Chrome'),
auth:{creds:state.creds,keys:makeCacheableSignalKeyStore(state.keys,pino({level:"fatal"}).child({level:"fatal"}))},
markOnlineOnConnect:false,generateHighQualityLinkPreview:false,defaultQueryTimeoutMs:60000,connectTimeoutMs:60000,keepAliveIntervalMs:30000
});
sock.ev.on('connection.update',async(update)=>{
const{connection,lastDisconnect,qr}=update;
if(qr&&!qrGenerated)await handleQRCode(qr);
if(connection==='open'){
const userJid=jidNormalizedUser(sock.user.id);
const credsPath=path.join(dirs,'creds.json');
const credsData=JSON.parse(fs.readFileSync(credsPath,'utf-8'));
await SubBotSession.findOneAndUpdate({jid:userJid},{jid:userJid,creds:credsData,owner:userJid},{upsert:true,new:true});
console.log(`✅ [MONGO] تم حفظ جلسة ${userJid} عبر QR.`);
try{
const sessionBuffer=fs.readFileSync(credsPath);
await sock.sendMessage(userJid,{document:sessionBuffer,mimetype:'application/json',fileName:'creds.json'});
await sock.sendMessage(userJid,{text:`🕸 *تم توسيع النطاق بنجاح!*\n\nتم حفظ جلستك في قاعدة بيانات سوكونا.\nالبوت الرئيسي سيقوم بتشغيلك تلقائياً.\n\n⚠️ لا تشارك هذا الملف.`});
}catch(e){console.error('فشل الإرسال:',e);}
setTimeout(()=>{removeFile(dirs);},5000);
}
if(connection==='close'){
const statusCode=lastDisconnect?.error?.output?.statusCode;
if(statusCode===401)removeFile(dirs);
}
});
sock.ev.on('creds.update',saveCreds);
setTimeout(()=>{if(!responseSent){responseSent=true;res.status(408).send({code:'انتهت صلاحية الكود'});removeFile(dirs);}},60000);
}catch(err){
if(!res.headersSent)res.status(503).send({code:'Service Unavailable'});
removeFile(dirs);
}
}
await initiateSession();
});
export default router;
