import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';

export function getSystemPrompt(): string {
  if (CONFIG.systemPromptEnv && CONFIG.systemPromptEnv.trim().length > 0) {
    return CONFIG.systemPromptEnv.trim();
  }
  try {
    const filePath = path.join(process.cwd(), 'prompt.txt');
    return fs.readFileSync(filePath, 'utf-8').trim();
  } catch {
    return 'Tu es OmniCyber IA, assistant dev, terminal Linux/Termux et cybersécurité.';
  }
}

export async function askOmniAI(userMessage: string, contextInfo?: string): Promise<string> {
  if (!CONFIG.openRouterApiKey) {
    return '⚠️ OPENROUTER_API_KEY non configurée dans les variables d’environnement.';
  }

  const basePrompt = getSystemPrompt();
  const systemMsg = contextInfo
    ? `${basePrompt}\n\n[CONTEXTE SESSION]\n${contextInfo}`
    : basePrompt;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CONFIG.openRouterApiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': CONFIG.appUrl,
      'X-Title': 'OmniCyber Bot',
    },
    body: JSON.stringify({
      model: CONFIG.openRouterModel,
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMessage },
      ],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    return `❌ Erreur OpenRouter (${res.status}) : ${err.slice(0, 300)}`;
  }

  const data = await res.json();
  return data?.choices?.[0]?.message?.content?.trim() || 'Aucune réponse générée.';
  }
      
