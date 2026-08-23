Implementación Fase 2: Backend NH Estética y Base de Datos
Este plan detalla los pasos para dotar al backend principal de la estructura necesaria para almacenar campañas masivas y comunicarse con el microservicio de WhatsApp, actuando como proxy de forma segura.

Goal Description
Implementar el registro en base de datos para campañas y mensajes programados, proveer endpoints CRUD y de control (pausar/reanudar/cancelar) transaccionales, y armar un proxy hacia el microservicio de WhatsApp para evitar que el frontend exponga la URL o configuración del microservicio directamente.

Proposed Changes
1. Base de Datos (Estructura Sólida para WhatsApp)
[NEW] migraciones/insert_whatsapp_tables.sql: Script SQL con soporte de IF NOT EXISTS para ser procesado por el backend sin fallos al reiniciar. Creará las siguientes tablas con sus índices correspondientes y trazabilidad:

sql

CREATE TABLE IF NOT EXISTS campanas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(255) NOT NULL,
    mensaje TEXT NOT NULL,
    estado ENUM('pending', 'in_progress', 'paused', 'completed', 'cancelled', 'failed') DEFAULT 'pending',
    total_mensajes INT NOT NULL DEFAULT 0,
    enviados INT NOT NULL DEFAULT 0,
    fallidos INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    started_at DATETIME NULL,
    completed_at DATETIME NULL
);
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id INT AUTO_INCREMENT PRIMARY KEY,
    campaign_id INT NOT NULL,
    phone VARCHAR(30) NOT NULL,
    message TEXT NOT NULL,
    scheduled_at DATETIME NOT NULL,
    status ENUM('pending', 'processing', 'sent', 'failed', 'cancelled') DEFAULT 'pending',
    attempts INT NOT NULL DEFAULT 0,
    last_error TEXT NULL,
    sent_at DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (campaign_id) REFERENCES campanas(id),
    INDEX idx_pending_messages (status, scheduled_at),
    INDEX idx_campaign (campaign_id)
);
[MODIFY] database.sql: Agregar la estructura de estas tablas para nuevas instalaciones completas.

No habrán borrados físicos de campañas (DELETE), se manejará todo mediante el cambio de estado a cancelled.

2. Endpoints de Campañas (CRUD y Control)
[NEW] controllers/campanas.controller.js:
createCampaign: Se ejecutará dentro de una transacción de BD. Insertará la campaña, buscará los destinatarios, insertará los cientos/miles de scheduled_messages y actualizará el total_mensajes. Si falla un insert, se hará ROLLBACK para evitar inconsistencias.
Lógica de Scheduling: Utilizará constantes del backend para el control de cadencia (ej. min_interval_seconds = 10, max_interval_seconds = 20) para asignar a cada mensaje un scheduled_at incremental, previniendo el envío masivo simultáneo.
Métodos para Listar y Ver detalle: getCampaigns, getCampaignById.
Métodos explícitos de Control:
pauseCampaign: Cambia estado de campaña a paused. Los mensajes quedan pending. El futuro Worker filtrará requiriendo que la campaña esté en in_progress.
resumeCampaign: Cambia estado de campaña a in_progress.
cancelCampaign: Cambia estado de campaña a cancelled y actualiza todos los scheduled_messages pendientes de esa campaña a status = 'cancelled'.
[NEW] routes/campanas.router.js:
POST /api/campanas
GET /api/campanas
GET /api/campanas/:id
POST /api/campanas/:id/pause
POST /api/campanas/:id/resume
POST /api/campanas/:id/cancel
3. Proxy de WhatsApp (Seguridad y Abstracción)
[NEW] controllers/whatsapp.controller.js:
Actuará de intermediario entre React y el VPS de Baileys.
Implementará getStatus, getQr, sendMessage, disconnect.
Todas las peticiones al microservicio incluirán Authorization: Bearer <WHATSAPP_INTERNAL_TOKEN>.
[NEW] routes/whatsapp.router.js:
GET /api/whatsapp/status
GET /api/whatsapp/qr
POST /api/whatsapp/send
POST /api/whatsapp/disconnect
4. Configuración General y Seguridad
[MODIFY] server.js:
Montar las rutas (/api/campanas y /api/whatsapp), ambas protegidas por authenticateToken con JWT.
Ejecutar el script insert_whatsapp_tables.sql en la fase de fullSetup() del arranque de DB (vía config/database.js).
[MODIFY] .env / .env.example:
Integrar WHATSAPP_MICROSERVICE_URL y el WHATSAPP_INTERNAL_TOKEN definido.
Verification Plan
Manual Verification
Comprobar que en el arranque, la DB ejecuta insert_whatsapp_tables.sql sin arrojar errores.
Hacer peticiones GET al proxy /api/whatsapp/status certificando que la llamada oculta la URL de origen y utiliza el Internal Token exitosamente.
Crear una campaña vía API (POST /api/campanas) y auditar la base de datos para confirmar que:
La inserción fue exitosa y transaccional.
Los scheduled_messages se insertaron con el scheduled_at correcto y el campaign_id asociado.
Pausar y cancelar una campaña verificando la alteración correspondiente de los estados tanto en la tabla madre como en los mensajes dependientes.