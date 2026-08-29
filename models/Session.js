import mongoose from 'mongoose';
const SessionSchema = new mongoose.Schema({
phoneNumber: { type: String, required: true, unique: true },
creds: { type: String, required: true }, // JSON stringified creds
status: { type: String, enum: ['pending', 'active', 'expired'], default: 'pending' },
createdAt: { type: Date, default: Date.now },
updatedAt: { type: Date, default: Date.now }
});
export default mongoose.model('Session', SessionSchema);
