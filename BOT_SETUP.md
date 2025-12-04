# 🤖 Configuración del Bot de Discord - Guía Completa

## 📋 Tabla de Contenidos
1. [Requisitos Previos](#requisitos-previos)
2. [Configuración en Discord Developer Portal](#configuración-en-discord-developer-portal)
3. [Configuración de Secretos en Replit](#configuración-de-secretos-en-replit)
4. [Invitar el Bot a Servidores](#invitar-el-bot-a-servidores)
5. [Hosting y Keep-Alive](#hosting-y-keep-alive)
6. [Verificación y Solución de Problemas](#verificación-y-solución-de-problemas)

---

## 🔧 Requisitos Previos

Necesitarás:
- Una cuenta de Discord
- Acceso al [Discord Developer Portal](https://discord.com/developers/applications)
- Tu proyecto de Replit abierto

---

## 🎯 Configuración en Discord Developer Portal

### Paso 1: Crear/Acceder a tu Aplicación

1. Ve a [Discord Developer Portal](https://discord.com/developers/applications)
2. Haz clic en **"New Application"** (o selecciona tu aplicación existente)
3. Dale un nombre a tu aplicación (ej: "Security Bot")
4. Acepta los términos y haz clic en **"Create"**

### Paso 2: Obtener el CLIENT ID

1. En la página de tu aplicación, ve a **"General Information"**
2. Copia el **"APPLICATION ID"** (este es tu CLIENT_ID)
3. Guárdalo - lo necesitarás más adelante

### Paso 3: Configurar el Bot

1. Ve a la sección **"Bot"** en el menú lateral
2. Si no has creado un bot, haz clic en **"Add Bot"**
3. Haz clic en **"Reset Token"** para generar un nuevo token
4. **⚠️ IMPORTANTE**: Copia el token inmediatamente - solo se muestra una vez
5. Guárdalo de forma segura - este es tu DISCORD_BOT_TOKEN

### Paso 4: Habilitar Privileged Gateway Intents (CRÍTICO)

**⚠️ SIN ESTOS INTENTS, EL BOT NO FUNCIONARÁ CORRECTAMENTE**

En la sección **"Bot"**, desplázate hasta **"Privileged Gateway Intents"** y habilita:

- ✅ **PRESENCE INTENT** (opcional)
- ✅ **SERVER MEMBERS INTENT** ⚠️ **OBLIGATORIO**
- ✅ **MESSAGE CONTENT INTENT** ⚠️ **OBLIGATORIO**

Haz clic en **"Save Changes"**

### Paso 5: Configurar Permisos del Bot

Tu bot necesita los siguientes permisos para funcionar correctamente:

#### Permisos Requeridos:
- ✅ **Administrator** (Recomendado - da todos los permisos)

**O si prefieres permisos granulares:**
- ✅ View Channels
- ✅ Manage Channels
- ✅ Manage Roles
- ✅ Manage Server
- ✅ Kick Members
- ✅ Ban Members
- ✅ Manage Messages
- ✅ Send Messages
- ✅ Embed Links
- ✅ Read Message History
- ✅ Moderate Members (Timeout)
- ✅ Manage Webhooks

**Valor de Permisos (Administrator)**: `8`
**Valor de Permisos (Granular)**: `1099780063318`

---

## 🔐 Configuración de Secretos en Replit

### Método 1: A través de la interfaz de Replit

1. En tu proyecto de Replit, haz clic en el icono de candado 🔒 (Secrets) en el panel izquierdo
2. Agrega los siguientes secretos:

   - **Nombre**: `DISCORD_BOT_TOKEN`
   - **Valor**: El token que copiaste en el Paso 3

   - **Nombre**: `DISCORD_CLIENT_ID`
   - **Valor**: El APPLICATION ID que copiaste en el Paso 2

3. Haz clic en **"Add Secret"** para cada uno

### Método 2: El sistema te pedirá los secretos

Si los secretos no están configurados, la aplicación te pedirá que los proporciones automáticamente.

---

## 🌐 Invitar el Bot a Servidores

### Generar URL de Invitación

Usa esta URL para invitar el bot a tus servidores (reemplaza `TU_CLIENT_ID`):

#### Con permisos de Administrador (Recomendado):
```
https://discord.com/api/oauth2/authorize?client_id=TU_CLIENT_ID&permissions=8&scope=bot%20applications.commands
```

#### Con permisos granulares:
```
https://discord.com/api/oauth2/authorize?client_id=TU_CLIENT_ID&permissions=1099780063318&scope=bot%20applications.commands
```

### Pasos para Invitar:

1. Reemplaza `TU_CLIENT_ID` con tu APPLICATION ID del Paso 2
2. Copia la URL completa y pégala en tu navegador
3. Selecciona el servidor al que quieres agregar el bot
4. Haz clic en **"Authorize"** (Autorizar)
5. Completa el captcha si aparece
6. ✅ ¡Listo! El bot ahora está en tu servidor

---

## 🚀 Hosting y Keep-Alive (24/7 Uptime)

### ✅ **Tu bot YA está 100% configurado para hosting!**

**Endpoints disponibles para keep-alive:**
- `GET /api/ping` - Health check simple (`{"ok": true, "timestamp": ...}`)
- `GET /api/status` - Estado detallado del bot (uptime, versión, conexión)

**💡 La interfaz web NO se elimina** - Sigue disponible en la raíz (`/`)

---

### Mantener el Bot Activo 24/7

Tu bot ya tiene endpoints de keep-alive configurados y listos para usar con servicios externos:

### Opciones de Hosting Gratuito:

#### 1. Replit (Más Fácil)
- El bot ya está configurado para funcionar en Replit
- El servidor se mantendrá activo mientras la app esté ejecutándose

#### 2. UptimeRobot (Recomendado para 24/7) ⭐

**🎯 Configuración Paso a Paso con UptimeRobot:**

##### Paso 1: Obtener la URL de tu Replit
1. En Replit, haz clic en el botón ▶️ **Run** para iniciar el bot
2. En el panel de la derecha, verás la interfaz web
3. Copia la URL (formato: `https://tu-proyecto.tu-usuario.repl.co`)

##### Paso 2: Crear cuenta en UptimeRobot
1. Ve a [UptimeRobot.com](https://uptimerobot.com)
2. Haz clic en **"Sign Up"** (Registro gratuito)
3. Verifica tu email y haz login

##### Paso 3: Crear Monitor
1. En tu dashboard, haz clic en **"+ Add New Monitor"**
2. Configura los siguientes campos:
   - **Monitor Type**: `HTTP(s)`
   - **Friendly Name**: `Discord Security Bot` (o el nombre que prefieras)
   - **URL (or IP)**: `https://tu-repl-url.replit.dev/api/ping`
   - **Monitoring Interval**: `5 minutes` (plan gratuito)
   - **Monitor Timeout**: `30 seconds`
   - **HTTP Method**: `GET`
3. Haz clic en **"Create Monitor"**

##### Paso 4: Verificar Funcionamiento
1. Espera 5 minutos
2. El monitor debería aparecer con estado **"Up"** (verde)
3. Si aparece **"Down"** (rojo), verifica:
   - Que el bot esté corriendo en Replit
   - Que la URL sea correcta
   - Que termines la URL con `/api/ping`

##### Paso 5: Configurar Alertas (Opcional)
1. En el monitor, haz clic en **"Alert Contacts"**
2. Agrega tu email para recibir notificaciones si el bot cae
3. Configura qué tipo de alertas quieres recibir

**✅ ¡Listo! UptimeRobot hará ping cada 5 minutos manteniendo tu bot activo 24/7**

**📊 Monitoreo:**
- Puedes ver estadísticas de uptime en el dashboard
- Historial de caídas y recuperaciones
- Tiempo de respuesta promedio

**💡 Tip Pro:** 
- Usa el endpoint `/api/status` si quieres monitorear más detalles
- UptimeRobot Free permite hasta 50 monitores (suficiente para varios bots)
- Puedes agregar múltiples métodos de notificación (email, Slack, Discord, etc.)

#### 3. Otras opciones gratuitas:
- **BetterUptime** - Similar a UptimeRobot
- **Koyeb** - Hosting gratuito con 512MB RAM
- **Railway** - $5 de crédito gratis mensual
- **Render.com** - Nivel gratuito disponible

---

## ✅ Verificación y Solución de Problemas

### Verificar que el Bot está Funcionando

1. **Verificar el Token**:
   - El bot debería aparecer en línea en Discord
   - Verifica los logs en Replit para confirmar: `Discord bot logged in as [nombre]`

2. **Verificar Endpoints**:
   - Visita: `https://tu-repl-url.replit.dev/api/ping`
   - Deberías ver: `{"ok":true,"timestamp":...}`

3. **Verificar Estado Completo**:
   - Visita: `https://tu-repl-url.replit.dev/api/status`
   - `botConnected` debería ser `true`

### Reconectar el Bot Manualmente

Si el bot se desconecta o actualizas el token:

```bash
POST https://tu-repl-url.replit.dev/api/bot/reconnect
```

O en el navegador/Postman:
- **Método**: POST
- **URL**: `https://tu-repl-url.replit.dev/api/bot/reconnect`

### Problemas Comunes

#### ❌ "Discord bot token not provided"
**Solución**: Verifica que `DISCORD_BOT_TOKEN` esté configurado en los secretos de Replit

#### ❌ El bot aparece offline
**Soluciones**:
1. Verifica que los **Privileged Intents** estén habilitados
2. Verifica que el token sea correcto
3. Usa el endpoint `/api/bot/reconnect` para reconectar

#### ❌ El bot no responde a comandos
**Soluciones**:
1. Verifica que `MESSAGE CONTENT INTENT` esté habilitado
2. Verifica que el bot tenga permisos en el servidor
3. Los comandos pueden tardar hasta 1 hora en sincronizarse globalmente

#### ❌ "Missing Permissions"
**Solución**: Re-invita el bot con los permisos correctos usando la URL de invitación

---

## 🔍 Información Adicional

### Intents Configurados en el Bot:
- `Guilds` - Información básica del servidor
- `GuildMessages` - Leer mensajes
- `GuildMembers` - Gestión de miembros (PRIVILEGED)
- `MessageContent` - Contenido de mensajes (PRIVILEGED)
- `GuildModeration` - Acciones de moderación

### Comandos Principales del Bot:
- `/ping` - Verifica el estado del bot
- `/status` - Estado completo del sistema
- `/automod` - Configurar auto-moderación
- `/lockdown` - Bloqueo de seguridad
- `/help` - Lista completa de comandos

---

## 📞 Soporte

Si tienes problemas:
1. Verifica los logs en la consola de Replit
2. Revisa esta guía paso por paso
3. Verifica que todos los Intents estén habilitados
4. Usa el endpoint `/api/status` para diagnosticar

---

**🎉 ¡Felicidades! Tu bot de seguridad de Discord está listo para usar.**
