import { CONFIG } from '../config';
import { HostedProject, ProjectKind, UserState } from '../types';
import { saveUserState } from '../storage/redis';
import { askOmniAI } from '../ai/openrouter';

export function getProjectTypeLabel(kind: ProjectKind): string {
  switch (kind) {
    case 'tg':
      return '🤖 Bot Telegram (24/7)';
    case 'wha':
      return '💬 Bot WhatsApp (24/7)';
    case 'web':
      return '🌐 Site Web (24/7)';
    case 'api':
      return '⚡ API Serverless (24/7)';
    case 'webapp':
      return '🖥️ Mini-App (24/7)';
    case 'ai':
      return '🧠 Projet IA (24/7)';
  }
}

export function buildDefaultFiles(name: string, kind: ProjectKind, customPrompt?: string): Record<string, string> {
  if (kind === 'web' || kind === 'webapp') {
    return {
      'index.html': `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"><title>${name}</title></head>
<body style="font-family:sans-serif;background:#0d1117;color:#e6edf3;padding:40px;">
  <h1>🚀 ${name}</h1>
  <p>Projet déployé 24h/24 via OmniCyber Bot.</p>
  <p>${customPrompt ? `Description : ${customPrompt}` : ''}</p>
</body>
</html>`,
    };
  }

  if (kind === 'api') {
    return {
      'api/index.js': `export default function handler(req, res) {
  res.status(200).json({
    ok: true,
    project: "${name}",
    status: "online_24_7",
    timestamp: new Date().toISOString()
  });
}`,
    };
  }

  if (kind === 'tg') {
    return {
      'api/webhook.js': `export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(200).send('${name} Telegram Bot actif 24/7');
  const update = req.body || {};
  const msg = update.message;
  if (msg && msg.chat && msg.text) {
    const token = process.env.BOT_TOKEN;
    if (token) {
      await fetch(\`https://api.telegram.org/bot\${token}/sendMessage\`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: msg.chat.id,
          text: \`🤖 [${name} 24/7] Reçu : \${msg.text}\`
        })
      });
    }
  }
  return res.status(200).json({ ok: true });
}`,
    };
  }

  // Bot WhatsApp (Webhook / Cloud API prêt 24/7) ou générique
  return {
    'api/webhook.js': `export default function handler(req, res) {
  if (req.method === 'GET') {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token === (process.env.WHA_VERIFY_TOKEN || 'omni_verify')) {
      return res.status(200).send(challenge);
    }
    return res.status(403).send('Forbidden');
  }
  return res.status(200).json({ ok: true, service: "${name}", mode: "${kind}" });
}`,
  };
}

export async function deployProject24x7(
  user: UserState,
  project: HostedProject
): Promise<{ ok: boolean; message: string }> {
  const slug = `${project.name}-${user.userId}`
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .slice(0, 50);

  if (!CONFIG.vercelApiToken) {
    project.status = 'online_24_7';
    project.url = `https://${slug}.vercel.app`;
    project.logs.push(`[${new Date().toISOString()}] Déploiement simulé (VERCEL_API_TOKEN absent) -> ${project.url}`);
    project.updatedAt = new Date().toISOString();
    await saveUserState(user);
    return {
      ok: true,
      message: `🟢 *Projet enregistré en mode 24/7*\nNom : \`${project.name}\`\nURL : ${project.url}\n_(Ajoute VERCEL_API_TOKEN dans les variables d'environnement pour publier réellement sur Vercel)_`,
    };
  }

  const filesPayload = Object.entries(project.files).map(([file, data]) => ({
    file,
    data,
  }));

  const res = await fetch('https://api.vercel.com/v13/deployments', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${CONFIG.vercelApiToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: slug,
      files: filesPayload,
      env: {
        ...project.env,
        ...(project.botToken ? { BOT_TOKEN: project.botToken } : {}),
        ...(project.whaToken ? { WHA_TOKEN: project.whaToken } : {}),
        ...(project.whaVerifyToken ? { WHA_VERIFY_TOKEN: project.whaVerifyToken } : {}),
      },
      target: 'production',
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    project.logs.push(`[${new Date().toISOString()}] Erreur Vercel : ${errText.slice(0, 200)}`);
    await saveUserState(user);
    return {
      ok: false,
      message: `❌ Échec déploiement Vercel : \`${errText.slice(0, 250)}\``,
    };
  }

  const data = await res.json();
  const url = `https://${data.url}`;
  project.url = url;
  project.status = 'online_24_7';
  project.updatedAt = new Date().toISOString();
  project.logs.push(`[${new Date().toISOString()}] Déployé 24/7 sur ${url}`);

  // Si c'est un bot Telegram avec token, configure automatiquement le webhook 24/7
  let webhookInfo = '';
  if (project.kind === 'tg' && project.botToken) {
    const hookUrl = `${url}/api/webhook`;
    const hookRes = await fetch(
      `https://api.telegram.org/bot${project.botToken}/setWebhook?url=${encodeURIComponent(hookUrl)}`
    );
    const hookJson = await hookRes.json();
    webhookInfo = hookJson.ok
      ? `\n🔗 Webhook Telegram activé 24/7 : \`${hookUrl}\``
      : `\n⚠️ Webhook TG non configuré : ${hookJson.description || 'vérifie le token'}`;
  }

  await saveUserState(user);
  return {
    ok: true,
    message: `🚀 *Projet en ligne 24h/24 !*\nNom : \`${project.name}\`\nType : ${getProjectTypeLabel(
      project.kind
    )}\nURL : ${url}${webhookInfo}`,
  };
}

export async function generateAiProjectFiles(
  name: string,
  kind: ProjectKind,
  ideaPrompt: string
): Promise<Record<string, string>> {
  const aiCode = await askOmniAI(
    `Génère le code complet et propre pour un projet de type "${kind}" nommé "${name}". Idée : ${ideaPrompt}. Donne uniquement le code principal clair.`
  );
  if (kind === 'web' || kind === 'webapp') {
    return {
      'index.html': aiCode.includes('<html')
        ? aiCode
        : `<!DOCTYPE html><html><body><pre>${aiCode.replace(/</g, '&lt;')}</pre></body></html>`,
    };
  }
  return {
    'api/index.js': `export default function handler(req, res) {\n  res.status(200).json({ project: "${name}", codeGenerated: true });\n}\n// ${aiCode.slice(0, 300).replace(/\n/g, ' ')}`,
  };
  }
