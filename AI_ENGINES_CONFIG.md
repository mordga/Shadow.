# 🤖 Configuración de Motores IA Distribuidos

## 📋 Descripción General

Este sistema utiliza una **arquitectura distribuida** basada en múltiples motores de IA **gratuitos** y **sin límite diario**. Claude AI ha sido completamente eliminado del sistema para usar exclusivamente APIs gratuitas e ilimitadas.

## ✅ Características Implementadas

- ✅ **motor_selector()**: Selección automática del mejor motor según el tipo de tarea
- ✅ **generar_respuesta()**: Wrapper universal para llamadas IA
- ✅ **modo_ilimitado()**: Opera solo con motores sin límite diario
- ✅ **auditoria_motor()**: Trazabilidad completa de cada decisión IA

## 🔧 Variables de Entorno

### Motores IA Disponibles

```bash
# 1. Mistral AI (Prioridad 1)
MISTRAL_API_KEY=tu_api_key_aquí
# Obtener: https://console.mistral.ai
# Modelos: mistral-small-latest, open-mistral-7b, mixtral-8x7b

# 2. Hugging Face (Prioridad 2)
HUGGINGFACE_API_KEY=tu_token_aquí
# o
HF_TOKEN=tu_token_aquí
# Obtener: https://huggingface.co/settings/tokens
# Modelos: Meta-Llama-3-8B-Instruct, Mixtral-8x7B, Zephyr-7b

# 3. Gemma (Google) - Usa HF_TOKEN (Prioridad 3)
# Acepta licencia en: https://huggingface.co/google/gemma-3-4b-it
# Modelos: gemma-3-4b-it, gemma-3-1b-it

# 4. Letta (MemGPT) - Opcional (Prioridad 4)
LETTA_API_KEY=tu_api_key_aquí
LETTA_BASE_URL=http://localhost:8283  # Para self-hosted
LETTA_SELF_HOSTED=true  # Si usas versión local
# Obtener: https://www.letta.com/
```

### Configuración Mínima

Para operar el sistema, necesitas **AL MENOS UNO** de estos motores gratuitos:

```bash
# Opción 1: Mistral (Recomendado)
MISTRAL_API_KEY=your_key_here

# Opción 2: Hugging Face (Más modelos)
HUGGINGFACE_API_KEY=your_token_here

# Opción 3: Ambos para mayor redundancia
MISTRAL_API_KEY=your_key_here
HUGGINGFACE_API_KEY=your_token_here
```

## 🎯 Tipos de Tareas Soportadas

| Tipo de Tarea | Motores Compatibles |
|---------------|---------------------|
| `threat_analysis` | Mistral, Hugging Face, Gemma, Heurístico |
| `content_moderation` | Hugging Face, Heurístico |
| `bypass_detection` | Mistral, Hugging Face, Gemma, Heurístico |
| `behavior_analysis` | Mistral, Hugging Face, Gemma, Letta, Heurístico |
| `firewall_intelligence` | Heurístico |
| `report_generation` | Letta, Heurístico |
| `countermeasure_generation` | Mistral, Heurístico |

## 🚀 Cómo Funciona

### 1. Selección Automática de Motor

El sistema selecciona automáticamente el mejor motor disponible según:

1. **Prioridad configurada**: Mistral (1) > HuggingFace (2) > Gemma (3) > Letta (4) > Heurístico (999)
2. **Compatibilidad con la tarea**: Solo motores que soporten el tipo de tarea
3. **Modo ilimitado**: Si está activo, excluye motores con límite diario

### 2. Rotación y Fallback

```
Motor Preferido → Error → Siguiente Motor → Error → ... → Heurístico
```

El sistema **NUNCA FALLA**. Si todos los motores IA fallan, usa heurísticas básicas.

### 3. Auditoría Completa

Cada llamada IA se registra en la base de datos con:
- Motor utilizado
- Tipo de tarea
- Prompt y respuesta
- Latencia
- Éxito/error
- Si se usó fallback

## 📊 Modo Ilimitado

Activa el modo ilimitado programáticamente:

```typescript
import { aiEngineManager } from './server/services/ai-engine-manager';

// Activar modo ilimitado
aiEngineManager.activarModoIlimitado();

// Desactivar
aiEngineManager.desactivarModoIlimitado();

// Obtener estadísticas
const stats = await aiEngineManager.getEngineStats();
console.log(stats);
```

## 🔐 Obtener API Keys Gratuitas

### 1. Mistral AI
1. Visita: https://console.mistral.ai
2. Crea una cuenta
3. Genera API key en "API keys"
4. Free tier incluye modelos open-source

### 2. Hugging Face
1. Visita: https://huggingface.co/join
2. Crea una cuenta
3. Ve a: https://huggingface.co/settings/tokens
4. Crea un nuevo token (Read)
5. **Para Gemma**: Acepta la licencia en https://huggingface.co/google/gemma-3-4b-it

### 3. Letta (Opcional)
1. **Cloud**: https://www.letta.com/ → Crea cuenta → Obtén API key
2. **Self-hosted** (recomendado para ilimitado):
   ```bash
   docker run -d -p 8283:8283 lettaai/letta:latest
   ```

## 📈 Ventajas del Sistema Distribuido

### ✅ Sin Límites Diarios
- Mistral: Free tier con rate limits razonables
- Hugging Face: Créditos mensuales gratuitos
- Gemma: Completamente gratuito vía HF
- Letta self-hosted: Ilimitado y local

### ✅ Alta Disponibilidad
- Si un motor falla → automáticamente usa otro
- Nunca interrumpe el servicio
- Fallback heurístico como última capa

### ✅ Costo $0
- Todos los motores tienen tier gratuito
- 100% APIs gratuitas e ilimitadas
- Self-hosting disponible (Letta, Gemma local)

### ✅ Trazabilidad Total
- Cada llamada registrada en BD
- Métricas por motor
- Análisis de rendimiento
- Auditoría completa

## 🔍 Ejemplo de Uso

```typescript
import { aiEngineManager } from './server/services/ai-engine-manager';

// Uso básico
const response = await aiEngineManager.generar_respuesta({
  taskType: 'threat_analysis',
  prompt: 'Analyze this user for suspicious behavior...',
  temperature: 0.3,
  maxTokens: 2048
});

console.log('Motor usado:', response.engineUsed);
console.log('Respuesta:', response.content);
console.log('Latencia:', response.latency, 'ms');

// Con motor preferido
const response2 = await aiEngineManager.generar_respuesta({
  taskType: 'bypass_detection',
  prompt: 'Detect bypass patterns...',
  preferredEngine: 'mistral'
});
```

## 🛡️ Comportamiento sin API Keys

Si **NO** configuras ninguna API key:

1. El sistema **NO FALLA**
2. Activa automáticamente el **motor heurístico**
3. Usa reglas básicas para detección
4. Funcionalidad reducida pero operativa
5. Logs indican que está en modo fallback

## 🚦 Estados del Sistema

### ✅ Completamente Operativo
```bash
MISTRAL_API_KEY=xxx
HUGGINGFACE_API_KEY=xxx
# Múltiples motores, alta redundancia
```

### ⚠️ Operativo con Limitaciones
```bash
MISTRAL_API_KEY=xxx
# Solo un motor, funciona pero sin fallback robusto
```

### 🔴 Modo Heurístico (Sin IA)
```bash
# Sin API keys configuradas
# Funciona con reglas básicas
```

## 📝 Logs Informativos

El sistema registra claramente el estado:

```
[AIService] 🚀 Distributed AI Service Initialized - Using free AI engines (Mistral, HuggingFace, Gemma, Letta)
[AIEngineManager] 🎯 Motor seleccionado (auto): mistral para threat_analysis
[AIEngineManager] 📊 Auditoría registrada: mistral - threat_analysis - ✅ (234ms)
```

## 🔗 Recursos Adicionales

- **Mistral AI**: https://docs.mistral.ai/
- **Hugging Face**: https://huggingface.co/docs/api-inference
- **Gemma**: https://huggingface.co/collections/google/gemma-3
- **Letta**: https://docs.letta.com/

---

**Resultado**: Bot funcional con APIs gratuitas, sin límites diarios, $0 de costo, con trazabilidad completa y alta disponibilidad.
