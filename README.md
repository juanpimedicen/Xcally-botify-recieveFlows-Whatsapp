# 📬 WhatsApp Flow Webhook Handler

Este proyecto permite recibir y reenviar mensajes de WhatsApp (Business API), incluyendo respuestas interactivas de tipo *Flow* (usualmente generadas por formularios dinámicos), hacia un endpoint central de procesamiento. También guarda un log de las respuestas Flow parseadas.

---

## 🚀 ¿Qué hace este webhook?

- Verifica el token para conectar con el webhook de WhatsApp.
- Escucha mensajes entrantes en la ruta `/whatsapp/messages`.
- Identifica si el mensaje recibido es estándar o una respuesta Flow.
- Si es un Flow, **parsea los datos, los guarda en un log JSON y los reenvía en formato estructurado**.
- Si es un mensaje estándar, simplemente lo reenvía tal cual.
- Todo esto se reenvía al sistema central `https://cx.oltpsys.com`.

---

## 🔧 Estructura y funcionamiento del `index.js`

```js
app.post('/whatsapp/messages', async (req, res) => { ... });
```

### ✅ Si el mensaje recibido es un Flow:
- Se identifica con `interactive.type === 'nfm_reply'`.
- Se extrae `response_json` y se parsea para obtener:
  - `nombre`
  - `rif`
  - `teléfono`
  - `correo`
- Se guarda en `flow_log.json` para fines de auditoría.
- Se arma un JSON con el siguiente formato:

```json
{
  "object": "whatsapp_business_account",
  "entry": [
    {
      "id": "...",
      "changes": [
        {
          "value": {
            "messages": [
              {
                "from": "584120941727",
                "id": "wamid.XXXX",
                "timestamp": "1234567890",
                "text": {
                  "body": "{\"nombre\":\"Juan\",\"rif\":\"J123456\",\"telefono\":\"04121234567\",\"correo\":\"juan@mail.com\"}"
                },
                "type": "text"
              }
            ]
          },
          "field": "messages"
        }
      ]
    }
  ]
}
```

Este JSON es enviado mediante `axios.post()` al endpoint oficial de WhatsApp de tu servidor.

### 📨 Si es un mensaje estándar (texto, imagen, etc.)
- Se reenvía el cuerpo `req.body` tal como llega a:
  ```
  https://cx.oltpsys.com/api/whatsapp/accounts/1/notify?token=...
  ```

---

## 📁 Log de respuestas Flow

Todas las respuestas del tipo Flow son guardadas en el archivo `flow_log.json` con esta estructura:

```json
[
  {
    "nombre": "Juan",
    "rif": "J123456",
    "telefono": "04121234567",
    "correo": "juan@mail.com",
    "from": "584120941727",
    "timestamp": "2025-07-10T20:00:00.000Z"
  }
]
```

---

## 🧩 Configuración de NGINX (motion.conf)

Es necesario redirigir el tráfico entrante desde el dominio público hacia el puerto del webhook interno (por ejemplo, `localhost:3434`).

### Ruta del archivo:
```
/etc/nginx/conf.d/motion.conf
```

### Fragmento del bloque configurado:
```nginx
location /whatsapp/messages/ {
    proxy_pass http://127.0.0.1:3434;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_intercept_errors off;
}
```

Este bloque permite que todas las peticiones entrantes a `https://cx.oltpsys.com/whatsapp/messages` se redirijan correctamente al webhook que corre en el servidor en el puerto 3434.

### ¿Para qué sirve esto?
- Permite exponer el servidor local (Node.js) al exterior, sin exponer directamente el puerto 3434.
- Hace de puente seguro entre WhatsApp/Facebook y tu servidor.
- Es compatible con WebSocket y timeout extendido.
- Permite validar correctamente el webhook desde la consola de Meta.

---

## 🛠️ Requisitos

- Node.js 14+
- NGINX (con proxy configurado)
- Un dominio HTTPS válido
- Certificado SSL si usas HTTPS
- API de WhatsApp Business activada y webhook configurado con `https://cx.oltpsys.com/whatsapp/messages`

---

## ▶️ Cómo ejecutar

```bash
node /usr/src/node/whatsapp/index.js
```
o bien como usuario `motion`:

```bash
runuser -l motion -c 'node /usr/src/node/whatsapp/index.js'
```

El servidor quedará escuchando en `http://localhost:3434/whatsapp/messages`.

---
## 📁 Logs
Las respuestas tipo Flow se guardan automáticamente en:

```pgsql
flow_log.json
```

Formato:
```json
[
  {
    "nombre": "Juan",
    "rif": "J13455",
    "telefono": "842727340",
    "correo": "ja@jg.com",
    "from": "584120941727",
    "timestamp": "2025-07-10T20:48:25.165Z"
  }
]
```
---
## 🧠 Consideraciones
- El campo `timestamp` es convertido con `Date.now()` para mantener compatibilidad.
- El reenvío de mensajes respeta el mismo formato que WhatsApp envía originalmente.
- Si el JSON del Flow está mal formado, se atrapa con un try/catch para evitar caídas del servidor.
---
##🛟 ¿Preguntas?
Puedes escribir por WhatsApp al +584126532271 o revisar los logs para confirmar que el servidor está reenviando correctamente los mensajes al sistema `OLTPSYS`.

```arduino
🚀 Servidor escuchando en http://localhost:3434
```
---

## 🤝 Créditos

Desarrollado para integraciones avanzadas entre WhatsApp Business y plataformas tipo Botify.

