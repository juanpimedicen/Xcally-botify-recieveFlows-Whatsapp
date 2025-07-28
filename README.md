# 📬 WhatsApp Flow Webhook Handler

Este proyecto es un servidor Express que actúa como intermediario para manejar flujos automatizados y envíos de videos por WhatsApp usando la API de Meta, permite recibir y reenviar mensajes de WhatsApp (Business API), incluyendo respuestas interactivas de tipo *Flow* (usualmente generadas por formularios dinámicos), hacia un endpoint central de procesamiento. También guarda un log de las respuestas Flow parseadas.

---

## 🚀 ¿Qué hace este webhook?

- Verifica el token para conectar con el webhook de WhatsApp.
- Escucha mensajes entrantes en la ruta `/whatsapp/messages`.
- Identifica si el mensaje recibido es estándar o una respuesta Flow.
- Si es un Flow, **parsea los datos, los guarda en un log JSON y los reenvía en formato estructurado**.
- Si es un mensaje estándar, simplemente lo reenvía tal cual.
- Todo esto se reenvía al sistema central `https://cx.oltpsys.com`.
- Guardar datos estructurados en un log
- Reenviar confirmaciones
- Enviar videos pregrabados como mensajes automáticos (saludo o despedida)
- Administrar eficientemente los `media_id` de Facebook para no recargar archivos innecesariamente

---

## 🔧 Estructura y funcionamiento del `index.js` y endpoints disponibles
### 1. `POST /whatsapp/messages`
- **Función**: Recibe mensajes de WhatsApp, determina si es una respuesta a un flujo (`flow`) o un mensaje normal.
- **Comportamiento**:
  - Si es respuesta de un flow (formulario interactivo), extrae los campos (nombre, RIF, teléfono, correo) y los guarda en un log (`flow_log.json`)
  - Reenvía ese mensaje a otro servidor (`https://cx.oltpsys.com/whatsapp/messages`) como confirmación.
  - Si no es un formulario, reenvía el mensaje al endpoint de notificaciones estándar del sistema OLTP.
```js
app.post('/whatsapp/messages', async (req, res) => { ... });
```
---

### 2. `GET /whatsapp/messages`
- **Función**: Verificación del webhook con token.
- **Uso**: Necesario para que WhatsApp valide que este servidor puede recibir mensajes.
- **Parámetros**:
  - `hub.mode=subscribe`
  - `hub.verify_token=vKNBCwMlL53EHYi2vltgWaW3eqNYT85r`
  - `hub.challenge=XYZ`
```js
app.get('/whatsapp/messages', (req, res) => { ... });
```

---

### 3. `POST /enviar-video`
- **Función**: Envía un video de **saludo** por WhatsApp al número indicado.
- **Body esperado**:
```json
{
  "telefono": "+584120941727"
}
```
- **Comportamiento**:
  - Verifica si ya existe un `media_id` válido guardado en `media_saludo_id.txt`
  - Si no existe o ha expirado, lo sube a Facebook Graph API y guarda el nuevo ID
  - Luego lo envía al número especificado con el caption:
    > ¡Hola! Soy *Clara POS*, tu asistente virtual de Banco Plaza, y es un gusto saludarte.
```js
app.post('/enviar-video', async (req, res) => { ... });
```

---

### 4. `POST /enviar-video-despido`
- **Función**: Envía un video de **despedida** por WhatsApp al número indicado.
- **Body esperado**:
```json
{
  "telefono": "+584120941727"
}
```
- **Comportamiento**:
  - Verifica si ya existe un `media_id` válido en `media_despido_id.txt`
  - Si no existe o ha caducado, lo sube a Facebook Graph API y guarda el nuevo ID
  - Luego lo envía al número especificado con el caption:
    > ¡Gracias por usar nuestros servicios! Siempre estamos listos para ayudarte, si tienes más preguntas no dudes en contactarnos. En Banco Plaza, ¡tu cuentas!
```js
app.post('/enviar-video-despido', async (req, res) => { ... });
```

---
### 5. `POST /botifyJSONner`
- **Función**: Este endpoint permite que **Botify** pueda leer y devolver directamente al usuario lo que se responde a través de una plantilla.
- **Body esperado**:
```json
{
  "clientData": "{{DATOS}}"
}
```

- **Comportamiento**:
  - Recibe un string JSON dentro del campo `clientData`.
  - Lo convierte en objeto y lo devuelve como respuesta en formato `application/json`, de forma que **Botify lo interprete como un mensaje válido de respuesta.**
  - Utiliza el valor que se pasó a `{{DATOS}}` y lo estructura como un JSON real en la respuesta.

```js
app.post("/botifyJSONner", (req, res) => {
    console.log(req.body.clientData);
    res.set('Content-Type', 'application/json').send(JSON.parse(req.body.clientData));
});
```

- **Ejemplo de uso**:
```json
{
  "clientData": "{\"nombre\":\"Pedro\",\"rif\":\"J123456789\",\"telefono\":\"+584140000000\",\"correo\":\"pedro@correo.com\"}"
}
```

> Esto permitirá que plataformas como Botify lean correctamente el contenido enviado por WhatsApp y lo muestren como mensaje dinámico y personalizado al usuario.

---

### Ejecutar en el servidor desde root para que quede operativo como parte de `pm2`

```bash
runuser -l motion -c 'pm2 start /usr/src/node/whatsapp/index.js --name "Open-Whatsapp"'
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
- Variables ajustadas dentro del código (token, ID de página, rutas a los videos, etc.)
- Archivos de video ubicados en:
  - `/usr/src/node/whatsapp/saludo.mp4`
  - `/usr/src/node/whatsapp/despido.mp4`
  - 
---

## 🗃 Archivos importantes

- `media_saludo_id.txt`: Contiene el `media_id` actual para el video de saludo, para evitar subirlo múltiples veces a Facebook.
- `media_despido_id.txt`: Lo mismo, pero para el video de despedida.
- `flow_log.json`: Registra las respuestas a formularios de usuarios, incluyendo nombre, RIF, correo y número telefónico.

---

## ⚠️ Permisos y errores comunes

- Asegúrate de que el proceso de Node.js tiene permisos de escritura sobre el directorio `/usr/src/node/whatsapp/` para poder crear o escribir los archivos `media_*.txt`.
- Si ves errores tipo `EACCES`, ejecuta:
```bash
sudo chmod 777 /usr/src/node/whatsapp
```

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

### ✅ Ejemplos de uso para enviar videos

### Enviar saludo:
```bash
curl -X POST http://localhost:3434/enviar-video \
-H "Content-Type: application/json" \
-d '{"telefono":"+584120941727"}'
```

### Enviar despedida:
```bash
curl -X POST http://localhost:3434/enviar-video-despido \
-H "Content-Type: application/json" \
-d '{"telefono":"+584120941727"}'
```

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
## 🛟 ¿Preguntas?
Puedes escribir por WhatsApp al +584126532271 o revisar los logs para confirmar que el servidor está reenviando correctamente los mensajes al sistema `OLTPSYS`.

```arduino
🚀 Servidor escuchando en http://localhost:3434
```
---

## 🤝 Créditos

Desarrollado para integraciones avanzadas entre WhatsApp Business y plataformas tipo Botify.

Juan Guilarte
2025

