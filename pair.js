import express from 'express';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import {makeWASocket,useMultiFileAuthState,delay,makeCacheableSignalKeyStore,Browsers,jidNormalizedUser,fetchLatestBaileysVersion} from '@whiskeysockets/baileys';
import pn from 'awesome-phonenumber';
import SubBotSession from './models/SubBotSession.js';
const router=express.Router();
function removeFile(FilePath){try{if(!fs.existsSync(FilePath))return false;fs.rmSync(FilePath,{recursive:true,force:true});}catch(e){console.error('Error:',e);}}
router.get('/',async(req,res)=>{
let num=req.query.number;
let dirs='./sessions/pair_'+Date.now();
if(!fs.existsSync('./sessions'))fs.mkdirSync('./sessions');
num=num.replace(/[^0-9]/g,'');
const phone=pn('+'+num);
if(!phone.isValid()){return res.status(400).send({code:'رقم الهاتف غير صالح، تأكد من كتابة الكود الدولي.'});}
num=phone.getNumber('e164').replace('+','');
async function initiateSession(){
const{state,saveCreds}=await useMultiFileAuthState(dirs);
try{
const{version}=await fetchLatestBaileysVersion();
let sock=makeWASocket({
version,auth:{creds:state.creds,keys:makeCacheableSignalKeyStore(state.keys,pino({level:"fatal"}).child({level:"fatal"}))},
printQRInTerminal:false,logger:pino({level:"silent"}),browser:Browsers.windows('Chrome'),
markOnlineOnConnect:false,generateHighQualityLinkPreview:false,defaultQueryTimeoutMs:60000,connectTimeoutMs:60000,keepAliveIntervalMs:30000
});
sock.ev.on('connection.update',async(update)=>{
const{connection,lastDisconnect}=update;
if(connection==='open'){
const userJid=jidNormalizedUser(sock.user.id);
const credsPath=path.join(dirs,'creds.json');
const credsData=JSON.parse(fs.readFileSync(credsPath,'utf-8'));
await SubBotSession.findOneAndUpdate({jid:userJid},{jid:userJid,creds:credsData,owner:num},{upsert:true,new:true});
console.log(`✅ [MONGO] تم حفظ جلسة ${userJid} في قاعدة البيانات.`);
try{
const sessionBuffer=fs.readFileSync(credsPath);
await sock.sendMessage(userJid,{document:sessionBuffer,mimetype:'application/json',fileName:'creds.json'});
await sock.sendMessage(userJid,{text:`🕸 *تم ربطك بنجاح في منصة سوكونا!*\n\nتم حفظ جلستك في قاعدة البيانات المركزية.\nالبوت الرئيسي سيقوم بتشغيلك تلقائياً كـ Sub-Bot.\n\n⚠️ لا تشارك هذا الملف مع أي شخص.`});
}catch(e){console.error('فشل إرسال الرسالة:',e);}
setTimeout(()=>{removeFile(dirs);},5000);
if(!res.headersSent)res.send({success:true,message:'تم الربط وحفظ الجلسة بنجاح!'});
}
if(connection==='close'){
const statusCode=lastDisconnect?.error?.output?.statusCode;
if(statusCode===401){if(!res.headersSent)res.status(401).send({code:'تم تسجيل الخروج، يرجى المحاولة مرة أخرى.'});}
else{initiateSession();}
}
});
if(!sock.authState.creds.registered){
await delay(3000);
try{
let code=await sock.requestPairingCode(num);
code=code?.match(/.{1,4}/g)?.join('-')||code;
if(!res.headersSent)res.send({code});
}catch(error){
if(!res.headersSent)res.status(503).send({code:'فشل طلب كود الربط، تأكد من الرقم.'});
}
}
sock.ev.on('creds.update',saveCreds);
}catch(err){
if(!res.headersSent)res.status(503).send({code:'Service Unavailable'});
removeFile(dirs);
}
}
await initiateSession();
});
export default router;
