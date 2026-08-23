require('dotenv').config();

const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ error: 'No authorization header provided' });
    }

    const token = authHeader.split(' ')[1];
    if (token !== process.env.WHATSAPP_INTERNAL_TOKEN) {
        return res.status(403).json({ error: 'Invalid token' });
    }

    next();
};

module.exports = authMiddleware;
