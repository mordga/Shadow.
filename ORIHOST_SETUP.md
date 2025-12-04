# 🚀 Configuración del Bot en OriHost

Este bot está completamente optimizado para funcionar como un motor persistente en **OriHost.com**, un servicio de hosting gratuito 24/7 para Discord bots.

---

## ✅ Características Optimizadas para OriHost

Tu bot incluye las siguientes características para garantizar hosting persistente:

- ✅ **Servidor Express** en puerto configurable (PORT env variable)
- ✅ **Múltiples endpoints de keep-alive** (`/api/ping`, `/api/status`, `/api/keepalive`, `/health`)
- ✅ **Sistema de Heartbeat interno** que mantiene el proceso activo cada 60 segundos
- ✅ **Health Monitor** con auto-recuperación de servicios críticos
- ✅ **Reconexión automática** del bot de Discord en caso de desconexión
- ✅ **Métricas en tiempo real** de memoria, uptime y estado de servicios

---

## 📋 Pasos para Configurar en OriHost

### 1️⃣ Crear Cuenta en OriHost

1. Ve a [OriHost.com](https://orihost.com/)
2. Regístrate con tu email
3. Verifica tu cuenta

### 2️⃣ Crear un Servidor

1. Inicia sesión en tu panel de OriHost
2. Haz clic en **"Create Server"**
3. Selecciona las siguientes opciones:
   - **Tipo de servidor**: Node.js Bot
   - **Recursos**: Selecciona según disponibilidad
   - **Región**: Elige la más cercana a tus usuarios

### 3️⃣ Subir tu Proyecto

Tienes dos opciones:

#### Opción A: Desde GitHub (Recomendado)

1. Sube tu proyecto a un repositorio de GitHub
2. En OriHost, conecta tu repositorio
3. OriHost clonará automáticamente el proyecto

#### Opción B: Subida Manual (SFTP)

1. Accede por SFTP usando las credenciales del panel
2. Sube todos los archivos del proyecto
3. Asegúrate de incluir `node_modules` o instalar dependencias después

### 4️⃣ Configurar Variables de Entorno

En el panel de OriHost, configura las siguientes variables de entorno:

```bash
DISCORD_BOT_TOKEN=tu_token_aqui
ORIHOST_API_KEY=tu_api_key_aqui
PORT=5000
NODE_ENV=production
```

**⚠️ IMPORTANTE**: 
- El `DISCORD_BOT_TOKEN` es obligatorio para que el bot funcione
- El `ORIHOST_API_KEY` es opcional pero recomendado para funciones avanzadas de hosting

**Dónde obtener tu ORIHOST_API_KEY:**
1. Inicia sesión en tu panel de OriHost
2. Ve a la sección de configuración/ajustes de tu cuenta
3. Busca "API Keys" o "Developer Settings"
4. Genera una nueva API key si no tienes una
5. Copia la key y agrégala como variable de entorno

### 5️⃣ Instalar Dependencias

Si no subiste `node_modules`, ejecuta en la consola de OriHost:

```bash
npm install
```

### 6️⃣ Iniciar el Bot

En el panel de OriHost, configura el comando de inicio:

```bash
npm run dev
```

O directamente:

```bash
node server/index.ts
```

---

## 🔍 Endpoints de Keep-Alive

Tu bot expone múltiples endpoints que puedes usar con servicios de monitoreo:

### 1. `/api/ping` - Health Check Simple
**Respuesta:**
```json
{
  "ok": true,
  "timestamp": 1699901234567
}
```
**Uso**: Ideal para monitores básicos de uptime

---

### 2. `/api/status` - Estado del Bot
**Respuesta:**
```json
{
  "service": "Discord Security Bot",
  "status": "online",
  "uptime": 86400.5,
  "botConnected": true,
  "version": "1.0.0",
  "timestamp": 1699901234567
}
```
**Uso**: Verificar que el bot de Discord esté conectado

---

### 3. `/api/keepalive` - Estado Completo (Optimizado para OriHost)
**Respuesta:**
```json
{
  "alive": true,
  "service": "Discord Security Bot",
  "status": "healthy",
  "uptime": 86400,
  "uptimeFormatted": "1d 0h 0m 0s",
  "memory": {
    "used": 150,
    "total": 256,
    "unit": "MB"
  },
  "services": {
    "Discord Bot": "healthy",
    "Security Engine": "healthy",
    "Storage Service": "healthy"
  },
  "healthSummary": {
    "healthy": 6,
    "degraded": 0,
    "unhealthy": 0,
    "total": 6
  },
  "version": "1.0.0",
  "timestamp": 1699901234567,
  "host": "OriHost Compatible"
}
```
**Uso**: Monitoreo completo del sistema y todos los servicios

---

### 4. `/health` - Check Mínimo
**Respuesta:**
```
OK
```
**Uso**: Para monitores que solo necesitan HTTP 200

---

### 5. `/api/heartbeat` - Estado del Sistema de Heartbeat
**Respuesta:**
```json
{
  "isRunning": true,
  "beatCount": 1440,
  "uptime": 86400,
  "lastBeat": 1699901234567,
  "timeSinceLastBeat": 2,
  "intervalMs": 60000,
  "enabled": true,
  "message": "Heartbeat service active",
  "timestamp": 1699901234567
}
```
**Uso**: Verificar que el sistema interno de heartbeat esté funcionando

---

## 🌐 Configuración de Servicios Externos de Monitoreo

Aunque OriHost mantiene tu bot activo, puedes usar servicios externos para monitoreo adicional:

### UptimeRobot (Opcional)

1. Crea cuenta en [UptimeRobot.com](https://uptimerobot.com)
2. Agrega un nuevo monitor:
   - **Tipo**: HTTP(s)
   - **URL**: `https://tu-dominio.orihost.com/api/keepalive`
   - **Intervalo**: 5 minutos
   - **Método**: GET

### Otras Opciones

- **Koyeb** - Monitor de uptime gratuito
- **BetterStack** - Monitoreo avanzado con alertas
- **Freshping** - Alternativa a UptimeRobot

---

## ⚙️ Sistema de Heartbeat Interno

El bot incluye un sistema de heartbeat que:

✅ Ejecuta un "latido" cada 60 segundos  
✅ Registra actividad del proceso  
✅ Previene que OriHost considere el bot inactivo  
✅ Monitorea uso de memoria y uptime  
✅ Se integra con el Health Monitor

**No requiere configuración adicional** - Se activa automáticamente al iniciar.

---

## 🔧 Health Monitor y Auto-Recuperación

El bot incluye un sistema de monitoreo de salud que:

- ✅ Verifica el estado de todos los servicios críticos cada 30-60 segundos
- ✅ Detecta fallos y degradación de servicios
- ✅ **Reconecta automáticamente** el bot de Discord si se desconecta
- ✅ Registra incidentes y recuperaciones
- ✅ Emite eventos para tracking en tiempo real

### Servicios Monitoreados

1. **Discord Bot** - Conexión del bot a Discord
2. **Security Engine** - Motor de seguridad
3. **Storage Service** - Sistema de almacenamiento
4. **Recovery Engine** - Sistema de recuperación
5. **WebSocket Service** - Comunicación en tiempo real
6. **Distributed AI Service** - Servicio de IA
7. **Heartbeat Service** - Sistema de heartbeat

---

## 🐛 Solución de Problemas

### El bot no se inicia en OriHost

**Causas comunes:**
- ❌ `DISCORD_BOT_TOKEN` no configurado
- ❌ Puerto incorrecto (debe ser el que OriHost asigna)
- ❌ Dependencias no instaladas

**Solución:**
1. Verifica las variables de entorno
2. Revisa los logs en el panel de OriHost
3. Ejecuta `npm install` de nuevo

---

### El bot se desconecta constantemente

**Causas comunes:**
- ❌ Token de Discord inválido o expirado
- ❌ Límite de recursos en OriHost excedido
- ❌ Problemas de red temporales

**Solución:**
1. Verifica el token en el panel de Discord Developer
2. Revisa el uso de CPU/RAM en OriHost
3. El sistema de auto-recuperación debería reconectar automáticamente
4. Usa el endpoint `/api/bot/reconnect` (POST) para reconexión manual

---

### Los endpoints no responden

**Causas comunes:**
- ❌ Puerto incorrecto configurado
- ❌ Firewall o configuración de OriHost

**Solución:**
1. Verifica que el servidor esté escuchando en el puerto correcto
2. Revisa los logs para errores de inicio
3. Asegúrate de que OriHost permite conexiones HTTP/HTTPS

---

### Créditos de OriHost se agotan rápido

**Nota**: OriHost usa un sistema de créditos (3 créditos por minuto de idle).

**Soluciones:**
- El sistema de heartbeat ya minimiza el idle time
- Verifica que el bot esté procesando eventos activamente
- Considera el plan Premium de OriHost si necesitas más recursos

---

## 📊 Monitoreo del Bot

### Dashboard Web

Tu bot incluye un dashboard web en tiempo real accesible en:
```
https://tu-dominio.orihost.com/
```

Características del dashboard:
- 📈 Estadísticas en tiempo real
- 🔒 Monitor de amenazas
- ⚙️ Estado de todos los servicios
- 🔄 Panel de recuperación
- 📊 Gráficos de rendimiento

### API de Health Monitor

Consulta el estado de todos los servicios:
```bash
GET https://tu-dominio.orihost.com/api/health/monitor
```

Consulta un servicio específico:
```bash
GET https://tu-dominio.orihost.com/api/health/monitor/Discord%20Bot
```

---

## 🔐 Seguridad

### Variables de Entorno Sensibles

⚠️ **NUNCA** subas tu código con el `DISCORD_BOT_TOKEN` hardcodeado.

✅ **SIEMPRE** usa variables de entorno en OriHost.

### Endpoints Sin Autenticación

⚠️ Los siguientes endpoints no requieren autenticación:
- `/api/actions/*` - Acciones de emergencia
- `/api/bot/reconnect` - Reconexión del bot

**Recomendación**: Considera agregar autenticación si expones el bot públicamente.

---

## 📞 Soporte

### Soporte de OriHost

- **Discord**: [discord.gg/NbaeDx8kDN](https://discord.gg/NbaeDx8kDN)
- **Email**: support@orihost.com
- **Documentación**: [docs.orihost.com](https://docs.orihost.com/)

### Estado del Bot

Puedes verificar el estado del bot en cualquier momento:

1. **Dashboard Web**: `https://tu-dominio.orihost.com/`
2. **API Status**: `https://tu-dominio.orihost.com/api/status`
3. **Health Monitor**: `https://tu-dominio.orihost.com/api/health/monitor`

---

## ✨ Características Adicionales

### Reconexión Manual del Bot

Si necesitas reconectar el bot manualmente:

```bash
curl -X POST https://tu-dominio.orihost.com/api/bot/reconnect
```

### Generación de Reportes de Estado

```bash
curl -X POST https://tu-dominio.orihost.com/api/actions/status-report
```

---

## 🎯 Mejores Prácticas

1. ✅ **Monitorea regularmente** el dashboard web
2. ✅ **Revisa los logs** en el panel de OriHost
3. ✅ **Mantén actualizado** el token de Discord
4. ✅ **Usa el sistema de auto-recuperación** - no reinicies manualmente
5. ✅ **Configura alertas** con UptimeRobot u otro servicio
6. ✅ **Verifica el uptime** usando `/api/keepalive`
7. ✅ **Mantén backups** de la configuración de tu servidor

---

## 📝 Resumen de Endpoints para OriHost

| Endpoint | Método | Propósito | Respuesta |
|----------|--------|-----------|-----------|
| `/api/ping` | GET | Health check básico | JSON simple |
| `/api/status` | GET | Estado del bot | Estado detallado |
| `/api/keepalive` | GET | **Keep-alive completo (Recomendado)** | Estado completo + servicios |
| `/health` | GET | Check mínimo | Texto "OK" |
| `/api/heartbeat` | GET | Estado del heartbeat | Estadísticas del heartbeat |
| `/api/health/monitor` | GET | Monitor de salud | Estado de todos los servicios |
| `/api/bot/reconnect` | POST | Reconexión manual | Confirmación |

---

## 🚀 ¡Listo para Producción!

Tu bot está completamente configurado para funcionar 24/7 en OriHost con:

- ✅ Sistema de heartbeat automático
- ✅ Auto-recuperación de servicios
- ✅ Múltiples endpoints de monitoreo
- ✅ Dashboard web en tiempo real
- ✅ Logging y métricas completas

**¡Disfruta de tu bot funcionando sin interrupciones!**

---

*Última actualización: Noviembre 16, 2025*
