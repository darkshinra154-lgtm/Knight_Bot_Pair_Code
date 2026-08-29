import express from 'express';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import path from 'path';
import mongoose from 'mongoose';
import pairRouter from './pair.js';
import qrRouter from './qr.js';
import Session from './models/Session.js';

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 8000;

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/sukuna_bot';
await mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
console.log('✅ MongoDB connected');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname));

app.get('/', (req, res) => {
res.sendFile(path.join(__dirname, 'pair.html'));
});

app.use('/pair', pairRouter);
app.use('/qr', qrRouter);

// Health check
app.get('/health', (req, res) => res.send('OK'));

app.listen(PORT, () => {
console.log(`🚀 Sukuna Bot Session Generator running on port ${PORT}`);
});

export default app;
