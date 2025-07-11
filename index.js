const express = require('express');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3434;
const LOG_FILE_PATH = path.join(__dirname, 'flow_log.json');
const VERIFY_TOKEN = 'vKNBCwMlL53EHYi2vltgWaW3eqNYT85r';

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

        const mensajeConfirmacion = `{nombre:"${nombre}",rif:"${rif}",teléfono:"${telefono}",correo_electrónico:"${correo}"}`;

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
