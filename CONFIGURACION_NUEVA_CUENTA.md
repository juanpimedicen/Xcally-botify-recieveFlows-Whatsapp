# Guía de Configuración para una Nueva Cuenta de WhatsApp

Esta guía explica cómo configurar una segunda instancia de la aplicación para manejar una nueva cuenta de WhatsApp en el mismo servidor. El método consiste en duplicar el proyecto y ejecutarlo como un proceso separado con su propia configuración.

**Prerrequisitos:**
* Tener la primera instancia de la aplicación ya instalada y funcionando correctamente.
* Tener acceso como `root` o un usuario con permisos `sudo`.
* Tener a la mano todos los datos de la nueva cuenta de WhatsApp (Phone Number ID, Account ID, Verify Token, Access Token, etc.).

---

### Paso 1: Duplicar la Carpeta del Proyecto

Vamos a crear una copia de la aplicación para la nueva cuenta. Usaremos `whatsapp2` como el nombre para la nueva carpeta.

```bash
# Navega al directorio donde está tu proyecto original
cd /usr/src/scripts/node/

# Copia la carpeta recursivamente
cp -r whatsapp whatsapp2
```

### Paso 2: Preparar la Nueva Carpeta

Ingresa a la nueva carpeta y elimina los archivos de log y de `media_id` de la instancia anterior para evitar conflictos y empezar de cero.

```bash
cd whatsapp2
rm -f flow_log.json media_*.txt
```

### Paso 3: Instalar Dependencias

Asegúrate de que la nueva carpeta tenga todos los paquetes de Node necesarios.

```bash
npm install express axios form-data
```
Esto creará una nueva carpeta `node_modules` dentro de `whatsapp2`.

### Paso 4: Configurar `index.js` para la Nueva Cuenta

Este es el paso más importante. Abre el archivo `index.js` de la nueva aplicación y modifica el objeto `config` con los datos de tu nueva cuenta.

```bash
nano /usr/src/scripts/node/whatsapp2/index.js
```

Modifica las siguientes variables dentro del objeto `config` para que reflejen los datos de la **segunda cuenta**:

```javascript
const config = {
    // CAMBIAR: Asigna un puerto local único para esta nueva instancia.
    PORT: 3444, 
    
    // CAMBIAR: El Verify Token de tu nuevo webhook en la App de Meta.
    VERIFY_TOKEN: 'NUEVO_VERIFY_TOKEN_DE_LA_CUENTA_2',
    
    // CAMBIAR: Los IDs de tu nueva cuenta de WhatsApp.
    PHONE_NUMBER_ID: 'NUEVO_PHONE_NUMBER_ID',
    ACCOUNT_ID: 'NUEVO_ACCOUNT_ID',
    DISPLAY_PHONE_NUMBER: 'NUEVO_DISPLAY_PHONE_NUMBER',
    
    // CAMBIAR: El Access Token de la nueva App de Meta.
    ACCESS_TOKEN: 'NUEVO_ACCESS_TOKEN_DE_LA_CUENTA_2',
    
    // CAMBIAR (Opcional): Las URLs de reenvío si son diferentes para esta cuenta.
    FORWARD_URL_FLOW: '[https://serviciosxcally.bancoplaza.com/whatsapp/messages](https://serviciosxcally.bancoplaza.com/whatsapp/messages)',
    FORWARD_URL_NOTIFY: '[https://serviciosxcally.bancoplaza.com/api/whatsapp/accounts/5/notify](https://serviciosxcally.bancoplaza.com/api/whatsapp/accounts/5/notify)',

    // REUTILIZAR: Apuntamos a los videos de la carpeta original para no duplicarlos.
    VIDEO_PATH_SALUDO: '/usr/src/scripts/node/whatsapp/saludo.mp4',
    VIDEO_PATH_DESPIDO: '/usr/src/scripts/node/whatsapp/despido.mp4',

    // CAMBIAR: Nombres de archivo únicos para los media_id de esta cuenta.
    MEDIA_ID_FILE_SALUDO: path.join(__dirname, 'media_saludo_id_2.txt'),
    MEDIA_ID_FILE_DESPIDO: path.join(__dirname, 'media_despido_id_2.txt'),
    
    // CAMBIAR: Nombre de archivo de log único.
    LOG_FILE_PATH: path.join(__dirname, 'flow_log2.json')
};
```

### Paso 5: Configurar NGINX para el Nuevo Endpoint

Ahora, debemos decirle a NGINX que el tráfico que llegue a un nuevo endpoint (ej. `/whatsapp/messages2`) debe ser redirigido al nuevo puerto que configuramos (`3444`).

1.  Abre tu archivo de configuración de NGINX:
    ```bash
    nano /etc/nginx/conf.d/motion.conf
    ```
2.  Busca el bloque `location /whatsapp/messages { ... }` existente. Cópialo y pégalo justo debajo, creando un bloque duplicado.
3.  Modifica el bloque duplicado para que apunte al nuevo endpoint y al nuevo puerto.

```nginx
# Endpoint para la CUENTA 2
location /whatsapp/messages2 {
    # El proxy_pass ahora apunta al puerto 3444, pero la ruta interna sigue siendo la misma
    proxy_pass [http://127.0.0.1:3444/whatsapp/messages](http://127.0.0.1:3444/whatsapp/messages);
    
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Cambia los nombres de los archivos de log para esta cuenta
    access_log /var/log/nginx/whatsapp2_access.log;
    error_log /var/log/nginx/whatsapp2_error.log;
}
```

4.  Guarda el archivo, verifica la sintaxis de NGINX y recarga el servicio:
    ```bash
    nginx -t
    # Si la sintaxis es correcta (ok/successful), recarga:
    systemctl reload nginx
    ```

### Paso 6: Iniciar la Nueva Aplicación con PM2

Finalmente, inicia la segunda aplicación como un nuevo proceso en PM2, asegurándote de darle un nombre único.

1.  Ejecuta el comando de inicio usando `runuser` como hiciste con la primera aplicación:
    ```bash
    runuser -l motion -c 'pm2 start /usr/src/scripts/node/whatsapp2/index.js --name "flow-whatsapp2" --watch'
    ```
2.  Verifica que ambos procesos estén corriendo:
    ```bash
    runuser -l motion -c 'pm2 list'
    ```
    Deberías ver `flow-whatsapp` y `flow-whatsapp2` en la lista.

3.  Guarda la nueva lista de procesos de PM2 para que ambas aplicaciones se inicien automáticamente si el servidor se reinicia:
    ```bash
    runuser -l motion -c 'pm2 save'
    ```

¡Listo! Ahora tienes dos instancias independientes de la aplicación, cada una manejando una cuenta de WhatsApp diferente a través de su propio endpoint (`/whatsapp/messages` y `/whatsapp/messages2`).
