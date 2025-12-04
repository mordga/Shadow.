import axios, { AxiosInstance } from 'axios';
import { storage } from '../storage';

export type AIEngine = 
  | 'mistral'
  | 'huggingface'
  | 'gemma'
  | 'letta'
  | 'heuristic';

export type TaskType = 
  | 'threat_analysis'
  | 'content_moderation'
  | 'bypass_detection'
  | 'behavior_analysis'
  | 'firewall_intelligence'
  | 'report_generation'
  | 'countermeasure_generation';

export interface AIEngineConfig {
  name: AIEngine;
  apiKey?: string;
  baseUrl: string;
  models: string[];
  dailyLimit?: number;
  rateLimit?: number;
  enabled: boolean;
  priority: number;
  supportedTasks: TaskType[];
}

export interface AIResponse {
  content: string;
  model: string;
  tokensUsed?: number;
  engineUsed: AIEngine;
  latency: number;
  success: boolean;
  fallbackUsed: boolean;
  error?: string;
}

export interface PromptRequest {
  taskType: TaskType;
  prompt: string;
  temperature?: number;
  maxTokens?: number;
  preferredEngine?: AIEngine;
}

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';
const HF_API_KEY = process.env.HUGGINGFACE_API_KEY || process.env.HF_TOKEN || '';
const LETTA_API_KEY = process.env.LETTA_API_KEY || '';

const engineConfigs: Record<AIEngine, AIEngineConfig> = {
  mistral: {
    name: 'mistral',
    apiKey: MISTRAL_API_KEY,
    baseUrl: 'https://api.mistral.ai/v1',
    models: ['mistral-small-latest', 'open-mistral-7b', 'mixtral-8x7b'],
    enabled: !!MISTRAL_API_KEY,
    priority: 1,
    supportedTasks: ['threat_analysis', 'bypass_detection', 'behavior_analysis', 'countermeasure_generation'],
  },
  huggingface: {
    name: 'huggingface',
    apiKey: HF_API_KEY,
    baseUrl: 'https://api-inference.huggingface.co/models',
    models: [
      'meta-llama/Meta-Llama-3-8B-Instruct',
      'mistralai/Mixtral-8x7B-Instruct-v0.1',
      'HuggingFaceH4/zephyr-7b-beta'
    ],
    enabled: !!HF_API_KEY,
    priority: 2,
    supportedTasks: ['threat_analysis', 'content_moderation', 'bypass_detection', 'behavior_analysis'],
  },
  gemma: {
    name: 'gemma',
    apiKey: HF_API_KEY,
    baseUrl: 'https://api-inference.huggingface.co/models',
    models: ['google/gemma-3-4b-it', 'google/gemma-3-1b-it'],
    enabled: !!HF_API_KEY,
    priority: 3,
    supportedTasks: ['threat_analysis', 'bypass_detection', 'behavior_analysis'],
  },
  letta: {
    name: 'letta',
    apiKey: LETTA_API_KEY,
    baseUrl: process.env.LETTA_BASE_URL || 'http://localhost:8283',
    models: ['letta-agent'],
    enabled: !!LETTA_API_KEY || process.env.LETTA_SELF_HOSTED === 'true',
    priority: 4,
    supportedTasks: ['behavior_analysis', 'report_generation'],
  },
  heuristic: {
    name: 'heuristic',
    baseUrl: 'local',
    models: ['rule-based'],
    enabled: true,
    priority: 999,
    supportedTasks: [
      'threat_analysis',
      'content_moderation',
      'bypass_detection',
      'behavior_analysis',
      'firewall_intelligence',
      'report_generation',
      'countermeasure_generation'
    ],
  },
};

export class AIEngineManager {
  private usageStats: Map<AIEngine, { requests: number; lastReset: number }> = new Map();
  private modoIlimitado: boolean = false;

  constructor() {
    this.initializeUsageStats();
  }

  private initializeUsageStats(): void {
    Object.keys(engineConfigs).forEach(engine => {
      this.usageStats.set(engine as AIEngine, { requests: 0, lastReset: Date.now() });
    });
  }

  activarModoIlimitado(): void {
    this.modoIlimitado = true;
    console.log('[AIEngineManager] ✅ Modo Ilimitado ACTIVADO - Solo motores sin límite diario');
  }

  desactivarModoIlimitado(): void {
    this.modoIlimitado = false;
    console.log('[AIEngineManager] ⚠️ Modo Ilimitado DESACTIVADO - Todos los motores disponibles');
  }

  private getAvailableEngines(taskType: TaskType): AIEngine[] {
    const engines = Object.values(engineConfigs)
      .filter(config => {
        if (!config.enabled) return false;
        if (!config.supportedTasks.includes(taskType)) return false;
        
        if (this.modoIlimitado) {
          return !config.dailyLimit || config.dailyLimit === 0;
        }
        
        return true;
      })
      .sort((a, b) => a.priority - b.priority)
      .map(config => config.name);

    return engines;
  }

  motor_selector(taskType: TaskType, preferredEngine?: AIEngine): AIEngine {
    const availableEngines = this.getAvailableEngines(taskType);

    if (preferredEngine && availableEngines.includes(preferredEngine)) {
      console.log(`[AIEngineManager] 🎯 Motor seleccionado (preferido): ${preferredEngine} para ${taskType}`);
      return preferredEngine;
    }

    if (availableEngines.length === 0) {
      console.log('[AIEngineManager] ⚠️ No hay motores disponibles, usando heurístico');
      return 'heuristic';
    }

    const selectedEngine = availableEngines[0];
    console.log(`[AIEngineManager] 🎯 Motor seleccionado (auto): ${selectedEngine} para ${taskType}`);
    
    return selectedEngine;
  }

  private async callMistralAPI(prompt: string, config: AIEngineConfig, options: PromptRequest): Promise<string> {
    const response = await axios.post(
      `${config.baseUrl}/chat/completions`,
      {
        model: config.models[0],
        messages: [{ role: 'user', content: prompt }],
        temperature: options.temperature || 0.3,
        max_tokens: options.maxTokens || 2048,
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    return response.data.choices[0].message.content;
  }

  private async callHuggingFaceAPI(prompt: string, config: AIEngineConfig, options: PromptRequest): Promise<string> {
    const modelId = config.models[0];
    const response = await axios.post(
      `${config.baseUrl}/${modelId}`,
      {
        inputs: prompt,
        parameters: {
          temperature: options.temperature || 0.3,
          max_new_tokens: options.maxTokens || 2048,
          return_full_text: false,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (Array.isArray(response.data)) {
      return response.data[0].generated_text || response.data[0].translation_text || JSON.stringify(response.data[0]);
    }
    
    return response.data.generated_text || JSON.stringify(response.data);
  }

  private async callGemmaAPI(prompt: string, config: AIEngineConfig, options: PromptRequest): Promise<string> {
    const modelId = config.models[0];
    const response = await axios.post(
      `${config.baseUrl}/${modelId}`,
      {
        inputs: prompt,
        parameters: {
          temperature: options.temperature || 0.3,
          max_new_tokens: options.maxTokens || 2048,
        },
      },
      {
        headers: {
          'Authorization': `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      }
    );

    if (Array.isArray(response.data)) {
      return response.data[0].generated_text || JSON.stringify(response.data[0]);
    }
    
    return response.data.generated_text || JSON.stringify(response.data);
  }

  private async callLettaAPI(prompt: string, config: AIEngineConfig, options: PromptRequest): Promise<string> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`;
      }

      const agentResponse = await axios.post(
        `${config.baseUrl}/api/agents`,
        {
          memory_blocks: [
            { label: 'human', value: 'Security analysis task' },
            { label: 'persona', value: 'Security AI assistant' }
          ],
          model: 'openai/gpt-4o-mini',
          embedding: 'openai/text-embedding-3-small'
        },
        {
          headers,
          timeout: 30000,
        }
      );

      const agentId = agentResponse.data.id;

      const messageResponse = await axios.post(
        `${config.baseUrl}/api/agents/${agentId}/messages`,
        {
          messages: [
            { role: 'user', content: prompt }
          ]
        },
        {
          headers,
          timeout: 30000,
        }
      );

      if (messageResponse.data.messages && messageResponse.data.messages.length > 0) {
        const assistantMessage = messageResponse.data.messages.find((m: any) => m.role === 'assistant');
        return assistantMessage?.content || JSON.stringify(messageResponse.data);
      }

      return JSON.stringify(messageResponse.data);
    } catch (err: any) {
      console.error('[Letta] Error:', err.message);
      throw new Error(`Letta API error: ${err.message}`);
    }
  }

  private generateHeuristicResponse(prompt: string, taskType: TaskType): string {
    const heuristicResponses: Record<TaskType, any> = {
      threat_analysis: {
        isThreat: false,
        confidence: 0.3,
        threatType: 'unknown',
        severity: 'low',
        reasoning: 'Heuristic fallback - Unable to perform AI analysis. Manual review recommended.',
        suggestedAction: 'monitor',
        patterns: []
      },
      content_moderation: {
        isNSFW: false,
        confidence: 0.2,
        categories: [],
        reasoning: 'Heuristic fallback - Basic keyword filter only'
      },
      bypass_detection: {
        isBypass: false,
        confidence: 0.2,
        technique: 'unknown',
        pattern: '',
        countermeasure: 'Monitor and review manually'
      },
      behavior_analysis: {
        trustScore: 50,
        behaviorType: 'normal',
        anomalies: [],
        recommendation: 'Heuristic fallback - Manual review recommended'
      },
      firewall_intelligence: {
        threat_level: 'low',
        action: 'allow',
        reasoning: 'Heuristic fallback - Basic rule check only'
      },
      report_generation: '# Security Report\n\nHeuristic fallback mode - AI unavailable.\nManual analysis recommended.',
      countermeasure_generation: 'Standard countermeasures applied. AI-enhanced response unavailable.'
    };

    return JSON.stringify(heuristicResponses[taskType] || { error: 'Heuristic fallback', data: 'unavailable' });
  }

  async generar_respuesta(request: PromptRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const selectedEngine = this.motor_selector(request.taskType, request.preferredEngine);
    const config = engineConfigs[selectedEngine];
    
    let fallbackUsed = false;
    let response: string;
    let success = true;
    let error: string | undefined;

    try {
      if (selectedEngine === 'heuristic') {
        response = this.generateHeuristicResponse(request.prompt, request.taskType);
        fallbackUsed = true;
      } else if (selectedEngine === 'mistral') {
        response = await this.callMistralAPI(request.prompt, config, request);
      } else if (selectedEngine === 'huggingface') {
        response = await this.callHuggingFaceAPI(request.prompt, config, request);
      } else if (selectedEngine === 'gemma') {
        response = await this.callGemmaAPI(request.prompt, config, request);
      } else if (selectedEngine === 'letta') {
        response = await this.callLettaAPI(request.prompt, config, request);
      } else {
        throw new Error(`Motor desconocido: ${selectedEngine}`);
      }
    } catch (err: any) {
      console.error(`[AIEngineManager] ❌ Error en motor ${selectedEngine}:`, err.message);
      error = err.message;
      success = false;
      
      response = this.generateHeuristicResponse(request.prompt, request.taskType);
      fallbackUsed = true;
    }

    const latency = Date.now() - startTime;

    await this.auditoria_motor({
      engineName: selectedEngine,
      taskType: request.taskType,
      prompt: request.prompt.substring(0, 500),
      response: response.substring(0, 1000),
      model: config.models[0],
      latency,
      success,
      errorMessage: error,
      fallbackUsed,
    });

    return {
      content: response,
      model: config.models[0],
      engineUsed: selectedEngine,
      latency,
      success,
      fallbackUsed,
      error,
    };
  }

  private async auditoria_motor(audit: {
    engineName: string;
    taskType: string;
    prompt: string;
    response: string;
    model: string;
    latency: number;
    success: boolean;
    errorMessage?: string;
    fallbackUsed: boolean;
  }): Promise<void> {
    try {
      await storage.createAiEngineAudit({
        engineName: audit.engineName,
        taskType: audit.taskType,
        prompt: audit.prompt,
        response: audit.response,
        model: audit.model,
        latency: audit.latency,
        success: audit.success,
        errorMessage: audit.errorMessage || null,
        fallbackUsed: audit.fallbackUsed,
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });

      console.log(`[AIEngineManager] 📊 Auditoría registrada: ${audit.engineName} - ${audit.taskType} - ${audit.success ? '✅' : '❌'} (${audit.latency}ms)`);
    } catch (err) {
      console.error('[AIEngineManager] Error al registrar auditoría:', err);
    }
  }

  async getEngineStats(): Promise<{
    engines: Record<AIEngine, { enabled: boolean; priority: number; supportedTasks: TaskType[] }>;
    modoIlimitado: boolean;
    recentAudits: number;
  }> {
    const stats: any = {
      engines: {},
      modoIlimitado: this.modoIlimitado,
      recentAudits: 0,
    };

    Object.entries(engineConfigs).forEach(([name, config]) => {
      stats.engines[name] = {
        enabled: config.enabled,
        priority: config.priority,
        supportedTasks: config.supportedTasks,
      };
    });

    try {
      const audits = await storage.getAiEngineAudits({ limit: 100 });
      stats.recentAudits = audits.length;
    } catch (err) {
      console.error('Error obteniendo estadísticas:', err);
    }

    return stats;
  }
}

export const aiEngineManager = new AIEngineManager();
