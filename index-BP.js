const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3434;
const LOG_FILE_PATH = path.join(__dirname, 'flow_log.json');
const VERIFY_TOKEN = 'vKNBCwMlL53EHYi2vltgWaW3eqNYT85r';

const VIDEO_PATH = '/usr/src/node/whatsapp/saludo.mp4';
const VIDEO_MIME_TYPE = 'video/mp4';
let currentMediaId = '1823635935221587'; // media_id actual en uso

const FormData = require('form-data');

app.use(express.json());

const now = () => new Date().toISOString();

// Verificación del webhook (GET)
app.get('/whatsapp/messages', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === VERIFY_TOKEN) {
        return res.status(200).send(challenge);
    } else {
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
        const from = message.from;
        const id = message.id;
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const rawResponse = message.interactive.nfm_reply.response_json;

        let parsed;
        try {
            parsed = JSON.parse(rawResponse);
        } catch (err) {
            console.error(`[${now()}] ❌ Error al parsear JSON:`, err.message);
            return res.status(200).send("OK");
        }

        const nombre = parsed["screen_0_Nombre_0"] || "";
        const rif = parsed["screen_0_RIF_1"] || "";
        const telefono = parsed["screen_0_Telfono_2"] || "";
        const correo = parsed["screen_0_Correo_electrnico_3"] || "";

        const DATOS = { nombre, rif, telefono, correo, from, timestamp: now() };
        guardarEnLog(DATOS);

        const mensajeConfirmacion = `{ "nombre": "${nombre}", "rif": "${rif}", "telefono": "${telefono}", "correo": "${correo}" }`;

        const reenviarMensaje = {
            object: "whatsapp_business_account",
            entry: [
                {
                    id: "103756925806690",
                    changes: [
                        {
                            value: {
                                messaging_product: "whatsapp",
                                metadata: {
                                    display_phone_number: "584126532271",
                                    phone_number_id: "121618807517432"
                                },
                                contacts: [
                                    {
                                        profile: {
                                            name: "Flow Bot"
                                        },
                                        wa_id: from
                                    }
                                ],
                                messages: [
                                    {
                                        from: from,
                                        id: id,
                                        timestamp: timestamp,
                                        text: {
                                            body: mensajeConfirmacion
                                        },
                                        type: "text"
                                    }
                                ]
                            },
                            field: "messages"
                        }
                    ]
                }
            ]
        };

        try {
            const response = await axios.post(
                "https://cx.oltpsys.com/whatsapp/messages",
                reenviarMensaje,
                {
                    headers: {
                        "accept": "*/*",
                        "Content-Type": "application/json"
                    }
                }
            );
            console.log(`[${now()}] ✅ Respuesta del servidor:\n`, JSON.stringify(response.data, null, 2));
            //console.log(`[${now()}] 🌐 Respuesta completa de axios:\n`, JSON.stringify(response, null, 2));
        } catch (err) {
            console.error(`[${now()}] ❌ Error al reenviar Flow:\n`, err.response?.data || err.message);
        }

        return res.status(200).send("Flow recibido");
    } else {
        try {
            await axios.post(
                "https://cx.oltpsys.com/api/whatsapp/accounts/1/notify?token=vKNBCwMlL53EHYi2vltgWaW3eqNYT85r",
                req.body,
                {
                    headers: {
                        "accept": "*/*",
                        "Content-Type": "application/json"
                    }
                }
            );
            return res.status(200).send("Mensaje reenviado");
        } catch (err) {
            console.error(`[${now()}] ❌ Error al reenviar mensaje estándar:`, err.message);
            return res.status(200).send("OK");
        }
    }
});

app.post("/botifyJSONner", (req, res) => {
    console.log(req.body.clientData)
    res.set('Content-Type', 'application/json').send(JSON.parse(req.body.clientData));
})

// Enviar el video de saludo
app.post('/enviar-video', async (req, res) => {
    const telefono = req.body?.telefono;
    const archivoVideo = '/usr/src/node/whatsapp/saludo.mp4';
    const mediaTxt = '/usr/src/node/whatsapp/media_saludo_id.txt';
    const caption = "¡Hola! Soy *Clara POS*, tu asistente virtual de Banco Plaza, y es un gusto saludarte.";

    if (!telefono) {
        return res.status(400).send({ error: 'Debes enviar el campo "telefono" en el body.' });
    }

    let mediaId = null;

    // Intentar leer el media_id previamente guardado
    if (fs.existsSync(mediaTxt)) {
        try {
            mediaId = fs.readFileSync(mediaTxt, 'utf-8').trim();
            // Validar si aún es válido
            const check = await axios.get(`https://graph.facebook.com/v18.0/${mediaId}`, {
                headers: {
                    Authorization: `Bearer EAAHFc9M0dvsBOzwn5He8N9dMNgCMTDwmN954qsaQozB4PBGZAc4fDuUwO288Cv14VYLfy7hNrh5fyxkZCgT164p4LGPDZCh76kySnebcZAvCCgfLAlr6NlpSZBVlpIko5YdstYCJaIY37c0EKOPC4QK4ucZBfDzzxSXoZC7wIUPAMQnTtRGV3z0mY91bMAavzdd3wZDZD`
                }
            });
        } catch {
            mediaId = null;
        }
    }

    // Si no hay media válido, subir el archivo
    if (!mediaId) {
        try {
            const form = new FormData();
            form.append('file', fs.createReadStream(archivoVideo), {
                contentType: 'video/mp4'
            });
            form.append('messaging_product', 'whatsapp');

            const upload = await axios.post(
                'https://graph.facebook.com/v18.0/121618807517432/media',
                form,
                {
                    headers: {
                        Authorization: `Bearer EAAHFc9M0dvsBOzwn5He8N9dMNgCMTDwmN954qsaQozB4PBGZAc4fDuUwO288Cv14VYLfy7hNrh5fyxkZCgT164p4LGPDZCh76kySnebcZAvCCgfLAlr6NlpSZBVlpIko5YdstYCJaIY37c0EKOPC4QK4ucZBfDzzxSXoZC7wIUPAMQnTtRGV3z0mY91bMAavzdd3wZDZD`,
                        ...form.getHeaders()
                    }
                }
            );

            mediaId = upload.data.id;
            fs.writeFileSync(mediaTxt, mediaId);
        } catch (err) {
            console.error(`[${now()}] ❌ Error al subir saludo.mp4:\n`, err.response?.data || err.message);
            return res.status(500).send({ error: 'Error al subir el video.' });
        }
    }

    try {
        const enviarVideo = await axios.post(
            'https://graph.facebook.com/v18.0/121618807517432/messages',
            {
                messaging_product: 'whatsapp',
                to: telefono,
                type: 'video',
                video: {
                    id: mediaId,
                    caption: caption
                }
            },
            {
                headers: {
                    Authorization: `Bearer EAAHFc9M0dvsBOzwn5He8N9dMNgCMTDwmN954qsaQozB4PBGZAc4fDuUwO288Cv14VYLfy7hNrh5fyxkZCgT164p4LGPDZCh76kySnebcZAvCCgfLAlr6NlpSZBVlpIko5YdstYCJaIY37c0EKOPC4QK4ucZBfDzzxSXoZC7wIUPAMQnTtRGV3z0mY91bMAavzdd3wZDZD`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.status(200).send({
            mensaje: '✅ Video de saludo enviado correctamente',
            id: enviarVideo.data.messages?.[0]?.id || null
        });
    } catch (error) {
        console.error(`[${now()}] ❌ Error al enviar video de saludo:\n`, error.response?.data || error.message);
        res.status(500).send({ error: 'No se pudo enviar el video' });
    }
});

// Enviar video despido
app.post('/enviar-video-despido', async (req, res) => {
    const telefono = req.body?.telefono;
    const videoPath = '/usr/src/node/whatsapp/despido.mp4';
    const caption = "¡Gracias por usar nuestros servicios! Siempre estamos listos para ayudarte, si tienes más preguntas no dudes en contactarnos. En Banco Plaza, ¡tu cuentas!";
    const pageId = "121618807517432";
    const accessToken = "EAAHFc9M0dvsBOzwn5He8N9dMNgCMTDwmN954qsaQozB4PBGZAc4fDuUwO288Cv14VYLfy7hNrh5fyxkZCgT164p4LGPDZCh76kySnebcZAvCCgfLAlr6NlpSZBVlpIko5YdstYCJaIY37c0EKOPC4QK4ucZBfDzzxSXoZC7wIUPAMQnTtRGV3z0mY91bMAavzdd3wZDZD";

    let mediaId = null;

    // Paso 1: Revisar si ya existe un media_id guardado localmente
    const MEDIA_TRACK_FILE = path.join(__dirname, 'media_despido_id.txt');
    if (fs.existsSync(MEDIA_TRACK_FILE)) {
        const idGuardado = fs.readFileSync(MEDIA_TRACK_FILE, 'utf-8');
        try {
            const check = await axios.get(`https://graph.facebook.com/v18.0/${idGuardado}`, {
                headers: {
                    Authorization: `Bearer ${accessToken}`
                }
            });
            mediaId = check.data?.id;
        } catch (err) {
            console.warn(`[${now()}] ⚠️ Media ID de despido vencido o inválido, subiendo de nuevo...`);
        }
    }

    // Paso 2: Si no hay mediaId válido, subir el video
    if (!mediaId) {
        try {
            const form = new (require('form-data'))();
            form.append('file', fs.createReadStream(videoPath), { contentType: 'video/mp4' });
            form.append('messaging_product', 'whatsapp');

            const upload = await axios.post(
                `https://graph.facebook.com/v18.0/${pageId}/media`,
                form,
                {
                    headers: {
                        Authorization: `Bearer ${accessToken}`,
                        ...form.getHeaders()
                    }
                }
            );
            mediaId = upload.data.id;
            fs.writeFileSync(MEDIA_TRACK_FILE, mediaId);
            console.log(`[${now()}] ✅ Video de despido subido, media_id: ${mediaId}`);
        } catch (err) {
            console.error(`[${now()}] ❌ Error al subir video de despido:`, err.response?.data || err.message);
            return res.status(500).send({ error: 'No se pudo subir el video de despido' });
        }
    }

    // Paso 3: Enviar el video con mediaId
    try {
        const enviar = await axios.post(
            `https://graph.facebook.com/v18.0/${pageId}/messages`,
            {
                messaging_product: "whatsapp",
                to: telefono,
                type: "video",
                video: {
                    id: mediaId,
                    caption: caption
                }
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        res.status(200).send({
            mensaje: '✅ Video de despedida enviado correctamente',
            id: enviar.data.messages?.[0]?.id || null
        });
    } catch (err) {
        console.error(`[${now()}] ❌ Error al enviar video de despedida:\n`, err.response?.data || err.message);
        res.status(500).send({ error: 'No se pudo enviar el video de despedida' });
    }
});


function guardarEnLog(datos) {
    let contenido = [];
    if (fs.existsSync(LOG_FILE_PATH)) {
        try {
            contenido = JSON.parse(fs.readFileSync(LOG_FILE_PATH, 'utf-8'));
        } catch {}
    }
    contenido.push(datos);
    fs.writeFileSync(LOG_FILE_PATH, JSON.stringify(contenido, null, 2));
}

app.listen(PORT, () => {
    console.log(`🚀 Servidor escuchando en http://localhost:${PORT}`);
});
