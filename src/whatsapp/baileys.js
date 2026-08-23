let makeWASocket, DisconnectReason, useMultiFileAuthState;

const loadBaileys = async () => {
    if (!makeWASocket) {
        const baileys = await import('@whiskeysockets/baileys');
        makeWASocket = baileys.default;
        DisconnectReason = baileys.DisconnectReason;
        useMultiFileAuthState = baileys.useMultiFileAuthState;
    }
};
const qrcode = require('qrcode');
const pino = require('pino');

let sock = null;
let qrCodeData = null;
let connectionState = 'connecting';
let userPhone = null;

const initWhatsApp = async () => {
    try {
        await loadBaileys();
        const { state, saveCreds } = await useMultiFileAuthState('baileys_auth_info');

        sock = makeWASocket({
            auth: state,
            printQRInTerminal: true,
            logger: pino({ level: 'silent' }), // Reduce logs
            browser: ['NH Estetica Campaigns', 'Chrome', '1.0.0']
        });

        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                try {
                    qrCodeData = await qrcode.toDataURL(qr, { scale: 8, margin: 4 });
                    connectionState = 'qr_ready';
                } catch (err) {
                    console.error('Error generating QR code base64:', err);
                }
            }

            if (connection === 'close') {
                const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
                console.log('connection closed due to ', lastDisconnect.error, ', reconnecting ', shouldReconnect);
                
                qrCodeData = null;
                connectionState = 'disconnected';
                userPhone = null;

                if (shouldReconnect) {
                    connectionState = 'reconnecting';
                    initWhatsApp();
                } else {
                    console.log('Logged out. Please scan QR again.');
                }
            } else if (connection === 'open') {
                console.log('WhatsApp connected successfully!');
                connectionState = 'connected';
                qrCodeData = null; // Clear QR code as it's no longer needed
                
                // Get the connected phone number
                const id = sock.user.id;
                userPhone = id.split(':')[0]; // Format: 54911...
            }
        });

        sock.ev.on('creds.update', saveCreds);

    } catch (error) {
        console.error('Error initializing WhatsApp:', error);
        connectionState = 'error';
    }
};

const getStatus = () => {
    return {
        connected: connectionState === 'connected',
        state: connectionState,
        phone: userPhone,
        qrAvailable: qrCodeData !== null
    };
};

const getQrCode = () => {
    return qrCodeData;
};

const sendMessage = async (phone, text) => {
    if (connectionState !== 'connected' || !sock) {
        throw new Error('WhatsApp is not connected');
    }

    // Ensure phone ends with @s.whatsapp.net
    let jid = phone;
    if (!jid.includes('@s.whatsapp.net')) {
        jid = `${jid}@s.whatsapp.net`;
    }

    const result = await sock.sendMessage(jid, { text });
    return result;
};

const disconnect = async () => {
    if (sock) {
        await sock.logout();
        sock = null;
        qrCodeData = null;
        connectionState = 'disconnected';
        userPhone = null;
    }
};

module.exports = {
    initWhatsApp,
    getStatus,
    getQrCode,
    sendMessage,
    disconnect
};
