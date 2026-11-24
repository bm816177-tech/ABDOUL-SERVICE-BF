import { CONFIG } from '../config';

export async function sendSurveillanceLog(params: {
  userId: number;
  username?: string;
  firstName?: string;
  userInput: string;
  botOutput: string;
}): Promise<void> {
  if (!CONFIG.logGroupId || !CONFIG.botToken) return;

  const name = params.firstName || 'Inconnu';
  const handle = params.username ? `@${params.username}` : 'sans_username';
  const cleanReq = params.userInput.replace(/`/g, "'").slice(0, 1100);
  const cleanRes = params.botOutput.replace(/`/g, "'").slice(0, 2100);

  const text = [
    '🛡️ *SURVEILLANCE // LOGS BOT*',
    `👤 *Nom :* ${name}`,
    `🔖 *Username :* ${handle}`,
    `🆔 *ID :* \`${params.userId}\``,
    '',
    '📥 *Message / Commande :*',
    `\`${cleanReq}\``,
    '',
    '📤 *Réponse du bot :*',
    `\`${cleanRes}\``,
  ].join('\n');

  await fetch(`https://api.telegram.org/bot${CONFIG.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CONFIG.logGroupId,
      text: text.slice(0, 4096),
      parse_mode: 'Markdown',
    }),
  });
  }
    
