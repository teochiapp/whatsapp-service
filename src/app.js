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

app.post('/api/clear-auth', async (req, res) => {
    try {
        await whatsappService.disconnect();
        const fs = require('fs');
        const path = require('path');
        if (fs.existsSync('baileys_auth_info')) {
            const files = fs.readdirSync('baileys_auth_info');
            for (const file of files) {
                fs.rmSync(path.join('baileys_auth_info', file), { recursive: true, force: true });
            }
        }
        res.json({ success: true, message: 'Auth info cleared successfully' });
        // Restart after clearing
        setTimeout(() => {
            whatsappService.initWhatsApp();
        }, 2000);
    } catch (err) {
        res.status(500).json({ error: 'Failed to clear auth info: ' + err.message });
    }
});

app.get('/api/qr', (req, res) => {
    const status = whatsappService.getStatus();
    if (status.connected) {
        return res.status(400).json({ error: 'WhatsApp is already connected.' });
    }
    
    const { qrCodeData, qrGeneratedAt } = whatsappService.getQrCode();
    if (!qrCodeData) {
        return res.status(404).json({ error: 'QR Code not available yet. Please try again in a few seconds.' });
    }

    // qrGeneratedAt: timestamp en ms del momento en que Baileys generó este QR.
    // El cliente puede usarlo para mostrar un countdown (~20s de vida útil).
    res.json({ qr: qrCodeData, qrGeneratedAt });
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
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`WhatsApp Autoservice running on port ${PORT}`);
});

// Graceful shutdown para evitar corrupción en volúmenes de Coolify
const shutdown = async () => {
    console.log('Cerrando servidor (Graceful Shutdown)... Desconectando WhatsApp.');
    await whatsappService.disconnect();
    server.close(() => {
        console.log('Servidor finalizado.');
        process.exit(0);
    });
};

process.on('SIGTERM', shutdown); // Coolify usa SIGTERM al detener/replegar
process.on('SIGINT', shutdown);  // Ctrl+C en local
