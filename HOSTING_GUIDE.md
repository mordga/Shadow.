# 🌐 Guía Completa de Hosting 24/7 - SecureBot Pro

> **Actualizado:** Noviembre 2025  
> **Estado:** ✅ Bot 100% configurado para hosting  
> **Interfaz Web:** ✅ NO se elimina - siempre disponible

---

## 📋 Tabla de Contenidos
1. [Resumen Rápido](#resumen-rápido)
2. [Endpoints Disponibles](#endpoints-disponibles)
3. [Opción 1: UptimeRobot (Recomendado)](#opción-1-uptimerobot-recomendado)
4. [Opción 2: BetterStack](#opción-2-betterstack)
5. [Opción 3: Hosting Dedicado](#opción-3-hosting-dedicado)
6. [Verificación y Monitoreo](#verificación-y-monitoreo)
7. [Solución de Problemas](#solución-de-problemas)

---

## ✅ Resumen Rápido

**Tu bot YA está listo para hosting 24/7. No necesitas cambios de código.**

### ¿Qué incluye?
- ✅ Servidor Express corriendo en puerto 5000
- ✅ Endpoints de health check (`/api/ping`, `/api/status`)
- ✅ Health monitor automático cada 30 segundos
- ✅ Auto-recuperación si el bot se desconecta
- ✅ Interfaz web dashboard en la raíz (`/`)
- ✅ WebSocket para updates en tiempo real
- ✅ Graceful degradation (funciona sin DISCORD_BOT_TOKEN)

---

## 🔌 Endpoints Disponibles

### 1. `/api/ping` - Health Check Simple
**Método:** `GET`  
**Propósito:** Mantener el bot activo con servicios de monitoring  
**Respuesta:**
```json
{
  "ok": true,
  "timestamp": 1699901234567
}
```

**Código HTTP:** `200 OK`  
**Uso:** Ideal para UptimeRobot, BetterStack, etc.

---

### 2. `/api/status` - Estado Detallado
**Método:** `GET`  
**Propósito:** Monitoreo completo del sistema  
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

**Uso:** Dashboard personalizado, alertas avanzadas

---

### 3. `/` - Dashboard Web
**Método:** `GET`  
**Propósito:** Interfaz web del bot  
**Contenido:** React SPA con estadísticas en tiempo real

**✅ Esta interfaz SIEMPRE está disponible, no se elimina**

---

### 4. `/api/bot/reconnect` - Reconexión Manual
**Método:** `POST`  
**Propósito:** Reconectar bot después de actualizar token  
**Respuesta:**
```json
{
  "success": true,
  "message": "Discord bot reconnection initiated. Check logs for status."
}
```

---

### 5. `/api/health/monitor` - Estado de Servicios
**Método:** `GET`  
**Propósito:** Monitoreo de todos los módulos  
**Respuesta:**
```json
{
  "overall": {
    "status": "healthy",
    "healthyModules": 5,
    "degradedModules": 1,
    "unhealthyModules": 0
  },
  "services": {
    "Discord Bot": {
      "status": "healthy",
      "lastCheck": "2025-11-13T00:00:00.000Z",
      "uptime": 99.9
    }
  },
  "monitorUptime": 86400000,
  "timestamp": 1699901234567
}
```

---

## 🤖 Opción 1: UptimeRobot (Recomendado) ⭐

### ¿Por qué UptimeRobot?
- ✅ **100% Gratis** para hasta 50 monitores
- ✅ Ping cada **5 minutos** (plan gratuito)
- ✅ Alertas por **email, SMS, Slack, Discord**
- ✅ Dashboard con estadísticas de uptime
- ✅ Historial de caídas y recuperaciones
- ✅ API para integración personalizada

---

### Configuración Paso a Paso

#### **Paso 1: Preparar tu Replit**
1. Asegúrate de que el bot esté corriendo en Replit
2. Copia la URL completa de tu Repl:
   ```
   https://tu-proyecto.tu-usuario.repl.co
   ```
3. Verifica que funcione visitando:
   ```
   https://tu-proyecto.tu-usuario.repl.co/api/ping
   ```
   Deberías ver: `{"ok":true,"timestamp":...}`

---

#### **Paso 2: Crear Cuenta en UptimeRobot**
1. Ve a [https://uptimerobot.com](https://uptimerobot.com)
2. Haz clic en **"Sign Up Free"**
3. Completa el registro:
   - Email
   - Contraseña
   - Nombre (opcional)
4. Verifica tu email
5. Inicia sesión en tu dashboard

---

#### **Paso 3: Crear Monitor HTTP**
1. En el dashboard, haz clic en **"+ Add New Monitor"**
2. Configura los campos:

**Monitor Type:**
```
HTTP(s)
```

**Friendly Name:**
```
SecureBot Pro - Discord Bot
```

**URL (or IP):**
```
https://tu-proyecto.tu-usuario.repl.co/api/ping
```

**Monitoring Interval:**
```
Every 5 minutes
```

**Monitor Timeout:**
```
30 seconds
```

**HTTP Method:**
```
GET (HEAD)
```

**Keyword Exists:**
```
(Opcional) "ok":true
```
Esto verifica que la respuesta contiene el texto esperado

3. Haz clic en **"Create Monitor"**

---

#### **Paso 4: Configurar Alertas (Opcional pero Recomendado)**
1. En tu monitor recién creado, haz clic en **"Edit"**
2. Ve a la sección **"Alert Contacts"**
3. Agrega contactos:
   - **Email**: Tu correo principal
   - **Discord Webhook** (opcional): Para alertas en Discord
   - **Slack** (opcional): Para alertas en Slack

4. Configura cuándo enviar alertas:
   - ✅ **When down**: Cuando el bot caiga
   - ✅ **When up**: Cuando se recupere
   - ⚠️ **Weekly summary**: Resumen semanal (opcional)

---

#### **Paso 5: Verificar Funcionamiento**
1. Espera **5-10 minutos** para el primer check
2. El monitor debería aparecer con estado:
   ```
   🟢 Up (XX% uptime)
   ```

3. Si aparece **🔴 Down**:
   - Verifica que el bot esté corriendo en Replit
   - Confirma que la URL sea correcta
   - Prueba la URL manualmente en el navegador
   - Revisa los logs de Replit

---

### Dashboard de UptimeRobot

Una vez configurado, tendrás acceso a:

**📊 Estadísticas:**
- Uptime % (últimas 24h, 7 días, 30 días, 90 días)
- Tiempo de respuesta promedio
- Historial de caídas
- Gráficas de disponibilidad

**🔔 Alertas:**
- Notificaciones instantáneas cuando el bot cae
- Confirmación cuando se recupera
- Resumen semanal por email

**📈 Logs:**
- Timestamp de cada check
- Duración de caídas
- Razón de la caída (timeout, error HTTP, etc.)

---

### Tips Avanzados de UptimeRobot

#### 1. Usar Múltiples Endpoints
Crea monitores adicionales para verificar diferentes partes:
```
Monitor 1: /api/ping (cada 5 min)
Monitor 2: /api/status (cada 10 min)
Monitor 3: /api/health/monitor (cada 15 min)
```

#### 2. Integración con Discord
1. En tu servidor de Discord, crea un webhook
2. En UptimeRobot, agrega el webhook como Alert Contact
3. Recibirás alertas directamente en Discord

**Ejemplo de mensaje:**
```
🔴 SecureBot Pro is DOWN
URL: https://tu-repl.replit.dev/api/ping
Reason: HTTP Error (503)
Time: 2025-11-13 14:30:00 UTC
```

#### 3. Status Page Pública
UptimeRobot Pro permite crear una página pública de estado:
- Muestra uptime histórico
- Incidentes recientes
- Estado actual de servicios
- Personalizable con tu branding

---

## 🚀 Opción 2: BetterStack (Alternativa Premium)

### Características
- ✅ Ping cada **30 segundos** (plan gratuito)
- ✅ Monitoreo desde múltiples ubicaciones
- ✅ Alertas por teléfono (planes pagos)
- ✅ Integración con PagerDuty, Opsgenie
- ✅ Status pages públicas gratis

### Configuración Rápida
1. Ve a [betterstack.com](https://betterstack.com/uptime)
2. Regístrate gratis
3. Crea un **HTTP Monitor**:
   - URL: `https://tu-repl.replit.dev/api/ping`
   - Interval: 30 segundos
   - Locations: Múltiples (selecciona las más cercanas)

---

## 💻 Opción 3: Hosting Dedicado (Producción)

Para uso en producción con alta disponibilidad:

### Replit Reserved VM
**Costo:** $25/mes  
**Ventajas:**
- ✅ Siempre activo (no duerme)
- ✅ CPU y RAM dedicados
- ✅ IP fija
- ✅ Mayor rendimiento

**Configuración:**
1. En Replit, ve a tu proyecto
2. Haz clic en **"Deploy"**
3. Selecciona **"Reserved VM"**
4. Configura recursos y región
5. Despliega

---

### Otras Opciones de Hosting

#### Railway.app
- **Costo:** $5/mes + uso
- **Ventajas:** Deploy automático desde GitHub
- **Configuración:** Conecta repo y despliega

#### Render.com
- **Costo:** Gratis hasta 750h/mes
- **Ventajas:** SSL automático, custom domains
- **Configuración:** Similar a Railway

#### Fly.io
- **Costo:** Gratis hasta 3 VMs
- **Ventajas:** Edge computing, baja latencia
- **Configuración:** CLI tools, Docker

---

## 🔍 Verificación y Monitoreo

### Verificar Endpoints Manualmente

#### 1. Ping Endpoint
```bash
curl https://tu-repl.replit.dev/api/ping
```
**Respuesta esperada:**
```json
{"ok":true,"timestamp":1699901234567}
```

#### 2. Status Endpoint
```bash
curl https://tu-repl.replit.dev/api/status
```
**Respuesta esperada:**
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

#### 3. Health Monitor
```bash
curl https://tu-repl.replit.dev/api/health/monitor
```
**Respuesta esperada:**
```json
{
  "overall": {
    "status": "healthy",
    "healthyModules": 6,
    "degradedModules": 0,
    "unhealthyModules": 0
  },
  "services": {...}
}
```

---

### Monitoreo Continuo

#### Scripts de Monitoreo Personalizado

**Python:**
```python
import requests
import time

def check_bot():
    try:
        response = requests.get('https://tu-repl.replit.dev/api/status', timeout=10)
        data = response.json()
        
        if data['botConnected']:
            print(f"✅ Bot online - Uptime: {data['uptime']}s")
        else:
            print("⚠️ Bot offline!")
            # Enviar alerta
    except Exception as e:
        print(f"❌ Error: {e}")

while True:
    check_bot()
    time.sleep(300)  # Check cada 5 minutos
```

**Node.js:**
```javascript
const axios = require('axios');

async function checkBot() {
  try {
    const { data } = await axios.get('https://tu-repl.replit.dev/api/status', {
      timeout: 10000
    });
    
    if (data.botConnected) {
      console.log(`✅ Bot online - Uptime: ${data.uptime}s`);
    } else {
      console.log('⚠️ Bot offline!');
      // Send alert
    }
  } catch (error) {
    console.error(`❌ Error: ${error.message}`);
  }
}

setInterval(checkBot, 300000); // Check every 5 minutes
```

---

## 🔧 Solución de Problemas

### Problema 1: UptimeRobot marca el bot como "Down"

**Síntomas:**
- Monitor muestra 🔴 Down
- Email de alerta recibido
- Bot aparece offline en Discord

**Soluciones:**
1. **Verificar que Replit esté corriendo:**
   - Ve a tu Repl
   - Haz clic en Run si está detenido
   - Espera a que aparezca "Server listening on port 5000"

2. **Verificar la URL:**
   - Debe terminar en `/api/ping`
   - Debe ser HTTPS, no HTTP
   - No debe tener espacios ni caracteres especiales

3. **Verificar timeout:**
   - Aumenta el timeout en UptimeRobot a 60 segundos
   - A veces Replit tarda en responder si estaba dormido

4. **Verificar logs de Replit:**
   ```bash
   # Busca errores en los logs
   # Si ves "DISCORD_BOT_TOKEN is not configured", configúralo
   ```

---

### Problema 2: El bot responde pero está offline en Discord

**Síntomas:**
- `/api/ping` responde OK
- `botConnected: false` en `/api/status`
- Bot no aparece en lista de miembros

**Soluciones:**
1. **Verificar DISCORD_BOT_TOKEN:**
   - Ve a Replit Secrets
   - Confirma que esté configurado correctamente
   - Intenta resetear el token en Discord Developer Portal

2. **Reconectar manualmente:**
   ```bash
   curl -X POST https://tu-repl.replit.dev/api/bot/reconnect
   ```

3. **Verificar Intents:**
   - Ve a Discord Developer Portal
   - Bot → Privileged Gateway Intents
   - Activa: SERVER MEMBERS INTENT, MESSAGE CONTENT INTENT

---

### Problema 3: Replit se duerme a pesar de UptimeRobot

**Síntomas:**
- Bot se desconecta después de 1 hora
- UptimeRobot muestra "Down" periódicamente

**Soluciones:**
1. **Verifica que UptimeRobot esté activo:**
   - Monitor debe estar en estado "Paused: No"
   - Interval: 5 minutes

2. **Considera Replit Boosts:**
   - Replit free tier puede tener limitaciones
   - Boost ($7/mes) da más recursos
   - Reserved VM ($25/mes) es always-on

3. **Usa múltiples monitores:**
   - Crea 2-3 monitores con diferentes intervalos
   - Reduce probabilidad de sleep

---

### Problema 4: Respuesta muy lenta (>10 segundos)

**Síntomas:**
- UptimeRobot reporta tiempos de respuesta altos
- Timeout ocasionales

**Soluciones:**
1. **Optimizar el código:**
   - Ya está optimizado con health checks rápidos
   - `/api/ping` responde en <50ms

2. **Verificar recursos de Replit:**
   - Free tier comparte CPU
   - Considera upgrade si usas muchos recursos

3. **Reducir carga de IA:**
   - Los motores de IA están configurados con timeout
   - Fallback a heurística si IA es lenta

---

## 📊 Métricas de Éxito

### Uptime Esperado
- **Con UptimeRobot (Replit Free):** 95-98%
- **Con Reserved VM:** 99.9%+
- **Con hosting dedicado:** 99.99%+

### Tiempo de Respuesta
- **`/api/ping`:** <100ms
- **`/api/status`:** <200ms
- **`/api/health/monitor`:** <500ms

### Caídas Normales
- **Redeployments:** 2-5 min de downtime
- **Replit maintenance:** Ocasional
- **Actualizaciones de código:** Manual

---

## 🎯 Checklist de Deployment

Antes de poner el bot en producción:

- [ ] ✅ `DISCORD_BOT_TOKEN` configurado en Secrets
- [ ] ✅ `DISCORD_CLIENT_ID` configurado (opcional)
- [ ] ✅ Privileged Intents habilitados en Discord
- [ ] ✅ Bot invitado al servidor con permisos de Administrator
- [ ] ✅ `/api/ping` responde correctamente
- [ ] ✅ `/api/status` muestra `botConnected: true`
- [ ] ✅ Monitor de UptimeRobot creado y activo
- [ ] ✅ Alertas configuradas (email mínimo)
- [ ] ✅ Dashboard web accesible
- [ ] ✅ Comandos de Discord funcionando (`/ping`, `/status`)
- [ ] ✅ Health monitor mostrando todos los servicios "healthy"

---

## 📞 Soporte y Recursos

### Documentación
- **BOT_SETUP.md** - Configuración completa del bot
- **AI_SERVICE.md** - Información sobre IA distribuida
- **AI_ENGINES_CONFIG.md** - Configuración de motores de IA

### Endpoints de Utilidad
- **Logs:** Ver logs en consola de Replit
- **Health:** `GET /api/health/monitor`
- **Stats:** `GET /api/stats`
- **Reconnect:** `POST /api/bot/reconnect`

---

**🎉 ¡Tu bot está listo para hosting 24/7!**

**Última actualización:** Noviembre 13, 2025  
**Versión del bot:** 1.0.0  
**Autor:** SecureBot Pro Team
