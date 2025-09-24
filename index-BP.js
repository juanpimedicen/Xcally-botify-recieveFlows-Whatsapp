const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const FormData = require('form-data');

// --- CONFIGURACIÓN DE LA CUENTA ---
// Todos los datos de configuración están aquí para fácil acceso y modificación.
const config = {
    PORT: 3443,
    VERIFY_TOKEN: 'RphzatzRPL77QEaqWFQHv7Kdr4AaKIyK',
    PHONE_NUMBER_ID: '580203515174837',
    ACCOUNT_ID: '516975364840394', // También conocido como WABA ID (WhatsApp Business Account ID)
    DISPLAY_PHONE_NUMBER: '584126077769',
    
    // Tu Access Token. ¡Trátalo como una contraseña!
    ACCESS_TOKEN: 'EAAPk1ejQ7mEBPbZCkgM3vDDrRPAjuoLqlZBNTXjxzc0BwNvkcHQhZAdYB1Mv5L1YZBLcKzHZBVzOIhBxb9DgPAo9ElYkXFniZCq9oagMcuEetIh1gxPxwYWLzvUUOD3oXV663eS5U4Sm1vA5wiiapKHwSKQZCtITBpcWtDbuK2b9qrYHKxjwtoZC3R4P50Xdzw7cFQZDZD',
    
    // URLs para reenviar los mensajes
    FORWARD_URL_FLOW: 'https://serviciosxcally.bancoplaza.com/whatsapp/messages',
    FORWARD_URL_NOTIFY: 'https://serviciosxcally.bancoplaza.com/api/whatsapp/accounts/4/notify',

    // Rutas a los archivos de video (confirmadas)
    VIDEO_PATH_SALUDO: '/usr/src/scripts/node/whatsapp/saludo.mp4',
    VIDEO_PATH_DESPIDO: '/usr/src/scripts/node/whatsapp/despido.mp4',

    // Archivos para guardar los media_id de los videos
    MEDIA_ID_FILE_SALUDO: path.join(__dirname, 'media_saludo_id_new.txt'),
    MEDIA_ID_FILE_DESPIDO: path.join(__dirname, 'media_despido_id_new.txt'),
    
    LOG_FILE_PATH: path.join(__dirname, 'flow_log.json')
};

// --- INICIALIZACIÓN DE LA APLICACIÓN EXPRESS ---
const app = express();
app.use(express.json());

const now = () => new Date().toISOString();

// --- WEBHOOK ENDPOINTS ---

// Verificación del webhook (GET)
app.get('/whatsapp/messages', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.VERIFY_TOKEN) {
        console.log(`[${now()}] ✅ Webhook verificado correctamente.`);
        return res.status(200).send(challenge);
    } else {
        console.error(`[${now()}] ❌ Fallo en la verificación del webhook.`);
        return res.sendStatus(403);
    }
});

// Recepción de mensajes (POST)
app.post('/whatsapp/messages', async (req, res) => {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0];
    const message = change?.value?.messages?.[0];

    if (!message) {
        return res.status(200).send("OK");
    }

    const isFlowResponse = message?.interactive?.type === 'nfm_reply' && message.interactive?.nfm_reply?.response_json;

    if (isFlowResponse) {
        // --- PROCESAMIENTO DE RESPUESTA DE FLOW ---
        const from = message.from;
        const id = message.id;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const rawResponse = message.interactive.nfm_reply.response_json;

        let parsed;
        try {
            parsed = JSON.parse(rawResponse);
        } catch (err) {
            console.error(`[${now()}] ❌ Error al parsear JSON de Flow:`, err.message);
            return res.status(200).send("OK");
        }

        const nombre = parsed["screen_0_Nombre_0"] || "";
        const rif = parsed["screen_0_RIF_1"] || "";
        const telefono = parsed["screen_0_Telfono_2"] || "";
        const correo = parsed["screen_0_Correo_electrnico_3"] || "";

        const DATOS = { nombre, rif, telefono, correo, from, timestamp: now() };
        guardarEnLog(DATOS);

        const mensajeConfirmacion = JSON.stringify({ nombre, rif, telefono, correo });

        const reenviarMensaje = {
            object: "whatsapp_business_account",
            entry: [{
                id: config.ACCOUNT_ID,
                changes: [{
                    value: {
                        messaging_product: "whatsapp",
                        metadata: {
                            display_phone_number: config.DISPLAY_PHONE_NUMBER,
                            phone_number_id: config.PHONE_NUMBER_ID
                        },
                        contacts: [{
                            profile: { name: "Flow Bot" },
                            wa_id: from
                        }],
                        messages: [{
                            from: from,
                            id: id,
                            timestamp: timestamp,
                            text: { body: mensajeConfirmacion },
                            type: "text"
                        }]
                    },
                    field: "messages"
                }]
            }]
        };

        try {
            await axios.post(config.FORWARD_URL_FLOW, reenviarMensaje, {
                headers: { "Content-Type": "application/json" }
            });
            console.log(`[${now()}] ✅ Respuesta de Flow reenviada correctamente a ${config.FORWARD_URL_FLOW}.`);
        } catch (err) {
            console.error(`[${now()}] ❌ Error al reenviar Flow:`, err.response?.data || err.message);
        }

        return res.status(200).send("Flow recibido");

    } else {
        // --- REENVÍO DE MENSAJE ESTÁNDAR ---
        try {
            await axios.post(config.FORWARD_URL_NOTIFY, req.body, {
                headers: { "Content-Type": "application/json" }
            });
             console.log(`[${now()}] ✅ Mensaje estándar reenviado a ${config.FORWARD_URL_NOTIFY}.`);
            return res.status(200).send("Mensaje reenviado");
        } catch (err) {
            console.error(`[${now()}] ❌ Error al reenviar mensaje estándar:`, err.response?.data || err.message);
            return res.status(200).send("OK");
        }
    }
});


// --- ENDPOINTS PARA ENVÍO DE VIDEOS ---

// Enviar el video de saludo
app.post('/enviar-video', async (req, res) => {
    const { telefono } = req.body;
    const caption = "¡Hola! Soy *Clara POS*, tu asistente virtual de Banco Plaza, y es un gusto saludarte.";

    if (!telefono) {
        return res.status(400).send({ error: 'Debes enviar el campo "telefono" en el body.' });
    }
    
    await enviarVideo(res, telefono, config.VIDEO_PATH_SALUDO, config.MEDIA_ID_FILE_SALUDO, caption, 'saludo');
});

// Enviar video despido
app.post('/enviar-video-despido', async (req, res) => {
    const { telefono } = req.body;
    const caption = "¡Gracias por usar nuestros servicios! Siempre estamos listos para ayudarte, si tienes más preguntas no dudes en contactarnos. En Banco Plaza, ¡tu cuentas!";

    if (!telefono) {
        return res.status(400).send({ error: 'Debes enviar el campo "telefono" en el body.' });
    }
    
    await enviarVideo(res, telefono, config.VIDEO_PATH_DESPIDO, config.MEDIA_ID_FILE_DESPIDO, caption, 'despido');
});


// --- FUNCIONES AUXILIARES ---

/**
 * Función reutilizable para subir y enviar un video.
 * Primero intenta usar un media_id guardado. Si no es válido, sube el video de nuevo.
 */
async function enviarVideo(res, telefono, videoPath, mediaIdFilePath, caption, tipo) {
    if (config.ACCESS_TOKEN === 'PEGAR_AQUI_EL_NUEVO_ACCESS_TOKEN') {
        console.error(`[${now()}] ❌ Error: El Access Token no ha sido configurado.`);
        return res.status(500).send({ error: 'El Access Token del servidor no está configurado.' });
    }
    
    let mediaId = await obtenerMediaIdValido(mediaIdFilePath);

    // Si no hay un mediaId válido, subir el archivo de nuevo
    if (!mediaId) {
        try {
            const form = new FormData();
            form.append('file', fs.createReadStream(videoPath), { contentType: 'video/mp4' });
            form.append('messaging_product', 'whatsapp');

            const upload = await axios.post(
                `https://graph.facebook.com/v18.0/${config.PHONE_NUMBER_ID}/media`,
                form,
                { headers: {
                    'Authorization': `Bearer ${config.ACCESS_TOKEN}`,
                    ...form.getHeaders()
                }}
            );
            mediaId = upload.data.id;
            fs.writeFileSync(mediaIdFilePath, mediaId); // Guardar el nuevo ID
            console.log(`[${now()}] ✅ Video de ${tipo} subido, nuevo media_id: ${mediaId}`);
        } catch (err) {
            console.error(`[${now()}] ❌ Error al subir video de ${tipo}:`, err.response?.data || err.message);
            return res.status(500).send({ error: `Error al subir el video de ${tipo}.` });
        }
    }

    // Enviar el video usando el mediaId
    try {
        const response = await axios.post(
            `https://graph.facebook.com/v18.0/${config.PHONE_NUMBER_ID}/messages`,
            {
                messaging_product: 'whatsapp',
                to: telefono,
                type: 'video',
                video: { id: mediaId, caption: caption }
            },
            { headers: {
                'Authorization': `Bearer ${config.ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }}
        );
        res.status(200).send({
            mensaje: `✅ Video de ${tipo} enviado correctamente`,
            id: response.data.messages?.[0]?.id || null
        });
    } catch (error) {
        console.error(`[${now()}] ❌ Error al enviar video de ${tipo}:`, error.response?.data || error.message);
        // Si el error es por media_id inválido, lo borramos para que se suba de nuevo la próxima vez
        if (error.response?.data?.error?.error_subcode === 131054) {
            fs.unlinkSync(mediaIdFilePath);
            console.log(`[${now()}] ℹ️ Media ID de ${tipo} inválido. Archivo de tracking eliminado. Se volverá a subir en el próximo intento.`);
        }
        res.status(500).send({ error: `No se pudo enviar el video de ${tipo}` });
    }
}

async function obtenerMediaIdValido(filePath) {
    if (!fs.existsSync(filePath)) return null;

    const mediaId = fs.readFileSync(filePath, 'utf-8').trim();
    try {
        await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
            headers: { 'Authorization': `Bearer ${config.ACCESS_TOKEN}` }
        });
        console.log(`[${now()}] ✅ Usando media_id existente: ${mediaId}`);
        return mediaId;
    } catch (error) {
        console.warn(`[${now()}] ⚠️ Media ID ${mediaId} vencido o inválido. Se subirá de nuevo.`);
        return null;
    }
}

function guardarEnLog(datos) {
    let contenido = [];
    if (fs.existsSync(config.LOG_FILE_PATH)) {
        try {
            contenido = JSON.parse(fs.readFileSync(config.LOG_FILE_PATH, 'utf-8'));
        } catch (e) {
            console.error(`[${now()}] ❌ Error al leer o parsear el archivo de log.`);
        }
    }
    contenido.push(datos);
    fs.writeFileSync(config.LOG_FILE_PATH, JSON.stringify(contenido, null, 2));
}

// --- INICIO DEL SERVIDOR ---
app.listen(config.PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${config.PORT}`);
});
