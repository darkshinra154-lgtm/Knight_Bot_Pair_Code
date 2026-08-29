import mongoose from 'mongoose';
const SubBotSchema=new mongoose.Schema({
jid:{type:String,required:true,unique:true},
creds:{type:Object,required:true},
owner:{type:String,default:'Unknown'},
createdAt:{type:Date,default:Date.now}
});
export default mongoose.model('SubBotSession',SubBotSchema);
