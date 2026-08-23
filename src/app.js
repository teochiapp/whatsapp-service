const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const authMiddleware = require('./middlewares/auth.middleware');
const whatsappService = require('./whatsapp/baileys');

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors());
app.use(express.json());

const fs = require('fs');

// Serve the test client on the root URL
app.get('/', (req, res) => {
    const htmlPath = path.join(__dirname, '../test-client.html');
    let html = fs.readFileSync(htmlPath, 'utf8');
    html = html.replace('REPLACE_WITH_YOUR_TOKEN', process.env.WHATSAPP_INTERNAL_TOKEN || '');
    res.send(html);
});

// Initialize WhatsApp on startup
whatsappService.initWhatsApp();

// --- PUBLIC ENDPOINTS (None for now, but health can be public if needed) ---
app.get('/health', (req, res) => {
    const status = whatsappService.getStatus();
    res.json({
        service: 'ok',
        whatsapp: status.connected ? 'connected' : 'disconnected'
    });
});

// --- PRIVATE ENDPOINTS ---
app.use('/api', authMiddleware);

app.get('/api/status', (req, res) => {
    const status = whatsappService.getStatus();
    res.json(status);
});

app.get('/api/qr', (req, res) => {
    const status = whatsappService.getStatus();
    if (status.connected) {
        return res.status(400).json({ error: 'WhatsApp is already connected.' });
    }
    
    const qrData = whatsappService.getQrCode();
    if (!qrData) {
        return res.status(404).json({ error: 'QR Code not available yet. Please try again in a few seconds.' });
    }

    res.json({ qr: qrData });
});

app.post('/api/send', async (req, res) => {
    const { phone, message, imagenes_urls } = req.body;
    
    console.log('===> /api/send payload:', { phone, hasMessage: !!message, imagenes_urls });

    if (!phone || !message) {
        return res.status(400).json({ error: 'phone and message are required' });
    }

    try {
        const result = await whatsappService.sendMessage(phone, message, imagenes_urls);
        res.json({
            success: true,
            messageId: result?.key?.id
        });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to send message'
        });
    }
});

app.post('/api/disconnect', async (req, res) => {
    try {
        await whatsappService.disconnect();
        res.json({ success: true, message: 'WhatsApp disconnected successfully.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to disconnect.' });
    }
});

// Start the server
app.listen(PORT, () => {
    console.log(`WhatsApp Autoservice running on port ${PORT}`);
});
