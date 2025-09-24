# Guía de Configuración para una Nueva Cuenta de WhatsApp

Esta guía explica cómo configurar una segunda instancia de la aplicación para manejar una nueva cuenta de WhatsApp en el mismo servidor. El método consiste en duplicar el proyecto y ejecutarlo como un proceso separado, robusto y gestionado por PM2.

**Prerrequisitos:**
* Tener la primera instancia de la aplicación ya instalada y funcionando correctamente.
* Tener acceso como `root` o un usuario con permisos `sudo`.
* Tener a la mano todos los datos de la nueva cuenta de WhatsApp (Phone Number ID, Account ID, Verify Token, Access Token, etc.).

---

### Paso 1: Duplicar el Proyecto

Vamos a crear una copia aislada de la aplicación para la nueva cuenta. Usaremos `whatsapp2` como el nombre para la nueva carpeta.

```bash
# Navega al directorio donde está tu proyecto original
cd /usr/src/scripts/node/

# Copia la carpeta recursivamente
cp -r whatsapp whatsapp2
```

### Paso 2: Preparar y Configurar el Proyecto

Ahora vamos a inicializar el nuevo proyecto, instalar sus dependencias y limpiar los archivos de la instancia anterior.

```bash
# Ingresa a la nueva carpeta del proyecto
cd whatsapp2

# Limpia los archivos de log y media_id anteriores para empezar de cero
rm -f flow_log.json media_*.txt

# Crea un archivo package.json con valores por defecto
npm init -y

# Instala los paquetes de Node necesarios para este proyecto
npm install express axios form-data
```

### Paso 3: Configurar el `index.js` para la Nueva Cuenta

Este es el paso de configuración principal. Abre el archivo `index.js` de la nueva aplicación para modificar el objeto `config` con los datos de tu nueva cuenta.

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

> **Prueba 1: Verificar el script `index.js`**
> Antes de continuar, vamos a asegurarnos de que el script se ejecuta sin errores.
> ```bash
> # Desde la carpeta /usr/src/scripts/node/whatsapp2/
> node index.js
> ```
> Deberías ver el mensaje: `🚀 Servidor escuchando en http://localhost:3444`. Si ves esto, detén el proceso con `Ctrl+C`. Si hay errores, revísalos antes de continuar.

### Paso 4: Crear el Archivo de Ecosistema para PM2

Para una mejor gestión, crearemos un archivo `ecosystem.config.js`. Esto le dice a PM2 exactamente cómo debe correr nuestra aplicación, incluyendo el directorio de trabajo (`cwd`).

1.  Crea el archivo en la carpeta `whatsapp2`:
    ```bash
    nano /usr/src/scripts/node/whatsapp2/ecosystem.config.js
    ```
2.  Pega el siguiente contenido:
    ```javascript
    module.exports = {
      apps : [{
        name   : "flow-whatsapp2",
        script : "index.js",
        cwd    : "/usr/src/scripts/node/whatsapp2/",
        watch  : true,
      }]
    }
    ```

### Paso 5: Configurar NGINX para el Nuevo Endpoint

Ahora, debemos decirle a NGINX que el tráfico que llegue a un nuevo endpoint (ej. `/whatsapp/messages2`) debe ser redirigido al nuevo puerto (`3444`).

1.  Abre tu archivo de configuración de NGINX:
    ```bash
    nano /etc/nginx/conf.d/motion.conf
    ```
2.  Copia el bloque `location /whatsapp/messages { ... }` existente y pégalo justo debajo.
3.  Modifica el bloque duplicado para que apunte al nuevo endpoint y puerto.

    ```nginx
    # Endpoint para la CUENTA 2
    location /whatsapp/messages2 {
        # El proxy_pass ahora apunta al puerto 3444, pero la ruta interna sigue siendo la misma
        proxy_pass [http://12.0.0.1:3444/whatsapp/messages](http://12.0.0.1:3444/whatsapp/messages);
        
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

> **Prueba 2: Verificar el endpoint de NGINX con el desafío (curl)**
> Ahora que la app está lista (aunque no corriendo) y NGINX está configurado, vamos a lanzar la app manualmente y probar el endpoint desde fuera.
> 1. En una terminal, inicia la app: `cd /usr/src/scripts/node/whatsapp2/ && node index.js`
> 2. En **otra terminal**, ejecuta el `curl` al nuevo endpoint usando el **nuevo token de verificación**:
> ```bash
> # Reemplaza NUEVO_VERIFY_TOKEN_DE_LA_CUENTA_2 con el valor real
> curl -X GET '[https://serviciosxcally.bancoplaza.com/whatsapp/messages2?hub.mode=subscribe&hub.verify_token=NUEVO_VERIFY_TOKEN_DE_LA_CUENTA_2&hub.challenge=PruebaCuenta2](https://serviciosxcally.bancoplaza.com/whatsapp/messages2?hub.mode=subscribe&hub.verify_token=NUEVO_VERIFY_TOKEN_DE_LA_CUENTA_2&hub.challenge=PruebaCuenta2)'
> ```
> Deberías recibir como respuesta `PruebaCuenta2`. Si funciona, detén la app (`Ctrl+C`) en la primera terminal.

### Paso 6: Iniciar la Nueva Aplicación con PM2

Con todas las pruebas superadas, es hora de dejar que PM2 gestione la aplicación.

1.  Usa el nuevo `ecosystem.config.js` para iniciar el proceso a través del usuario `motion`:
    ```bash
    runuser -l motion -c 'pm2 start /usr/src/scripts/node/whatsapp2/ecosystem.config.js'
    ```
2.  Verifica que ambos procesos (`flow-whatsapp` y `flow-whatsapp2`) estén en línea:
    ```bash
    runuser -l motion -c 'pm2 list'
    ```
> **Prueba 3: Observar los logs en PM2**
> Puedes ver los logs en tiempo real de la nueva aplicación para asegurarte de que todo funciona como se espera.
> ```bash
> runuser -l motion -c 'pm2 logs flow-whatsapp2'
> ```

### Paso 7: Asegurar la Persistencia tras Reinicios

Para garantizar que PM2 inicie **ambas** aplicaciones si el servidor se reinicia, debes guardar la nueva lista de procesos.

1.  **Guardar la lista de procesos actual:**
    ```bash
    runuser -l motion -c 'pm2 save'
    ```
2.  **Configurar el inicio automático (si no lo has hecho antes):**
    Este comando se ejecuta una sola vez como `root` en el servidor para crear el servicio de inicio. Si ya lo hiciste para la primera app, no necesitas repetirlo.
    ```bash
    # Ejecutar solo si es la primera vez que configuras la persistencia en este servidor
    pm2 startup
    # Sigue las instrucciones que te devuelva el comando (copiar y pegar una línea)
    ```

### Paso 8: Gestionar la Versión de la Aplicación (Opcional)

Si quieres llevar un control de versiones para esta segunda aplicación, puedes usar `npm version`.

1.  Navega al directorio del proyecto:
    ```bash
    cd /usr/src/scripts/node/whatsapp2/
    ```
2.  Después de realizar cambios en el código, incrementa la versión:
    ```bash
    # Para un cambio menor o corrección de bug
    npm version patch
    ```
PM2, al estar en modo `--watch`, detectará los cambios y reiniciará la aplicación `flow-whatsapp2` automáticamente. Puedes verificar la nueva versión con `runuser -l motion -c 'pm2 info flow-whatsapp2'`.
