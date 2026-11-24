import { CONFIG } from '../config';
import { BotStats, UserState } from '../types';
import { saveBotStats, saveUserState } from '../storage/redis';

export interface QuotaCheckResult {
  allowed: boolean;
  reason?: 'cooldown' | 'paywall';
  remainingHours?: number;
  nextCooldownHours?: number;
}

export async function evaluateUserQuota(
  user: UserState,
  stats: BotStats
): Promise<QuotaCheckResult> {
  const isOwner = user.userId === CONFIG.adminId;
  const cleanUser = (user.username || '').toLowerCase();
  const isListedPremium =
    user.isPremium ||
    stats.premiumUserIds.includes(user.userId) ||
    (cleanUser && stats.premiumUsernames.includes(cleanUser));

  if (isOwner || isListedPremium) {
    user.isPremium = true;
    await saveUserState(user);
    return { allowed: true };
  }

  const now = Date.now();

  // Si l'utilisateur a déjà déclenché une restauration et est en période d'attente
  if (user.cooldownUntil > now) {
    const remainingMs = user.cooldownUntil - now;
    const remainingHours = Math.max(1, Math.ceil(remainingMs / (1000 * 60 * 60)));
    return {
      allowed: false,
      reason: 'cooldown',
      remainingHours,
    };
  }

  // Si la période d'attente précédente vient de se terminer, on applique la restauration progressive
  // (le temps d'attente augmente après chaque restauration)
  if (user.cooldownUntil > 0 && user.cooldownUntil <= now) {
    user.restorationCount += 1;
    user.usageCount = 0;
    user.cooldownUntil = 0;
    await saveUserState(user);
  }

  // Vérifie le nombre de discussions gratuites
  if (user.usageCount >= CONFIG.freeChatLimit) {
    const nextCooldownHours =
      CONFIG.baseCooldownHours + user.restorationCount * CONFIG.cooldownStepHours;
    return {
      allowed: false,
      reason: 'paywall',
      nextCooldownHours,
    };
  }

  // Consomme 1 utilisation gratuite
  user.usageCount += 1;
  await saveUserState(user);
  return { allowed: true };
}

export async function startRestorationCooldown(user: UserState): Promise<number> {
  const hours = CONFIG.baseCooldownHours + user.restorationCount * CONFIG.cooldownStepHours;
  user.cooldownUntil = Date.now() + hours * 60 * 60 * 1000;
  await saveUserState(user);
  return hours;
}

export async function sendStarsPaymentInvoice(chatId: number, userId: number): Promise<void> {
  await fetch(`https://api.telegram.org/bot${CONFIG.botToken}/sendInvoice`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      title: 'Accès Illimité — OmniCyber Bot',
      description: `Débloque l'accès illimité au bot, au terminal Termux et aux outils pour ${CONFIG.starPrice} ⭐.`,
      payload: `omni_premium_${userId}_${Date.now()}`,
      provider_token: '',
      currency: 'XTR',
      prices: [{ label: 'Pass Illimité', amount: CONFIG.starPrice }],
    }),
  });
}

export async function grantPremiumToTarget(
  targetInput: string,
  stats: BotStats,
  targetUserState?: UserState
): Promise<string> {
  const raw = targetInput.trim();
  if (!raw) return 'Usage : /premium <ID ou @username>';

  if (/^\d+$/.test(raw)) {
    const id = Number(raw);
    if (!stats.premiumUserIds.includes(id)) stats.premiumUserIds.push(id);
    if (targetUserState && targetUserState.userId === id) {
      targetUserState.isPremium = true;
      targetUserState.cooldownUntil = 0;
      await saveUserState(targetUserState);
    }
    await saveBotStats(stats);
    return `✅ Utilisateur ID \`${id}\` ajouté en **PREMIUM (accès illimité)**.`;
  }

  const username = raw.replace(/^@/, '').toLowerCase();
  if (!stats.premiumUsernames.includes(username)) {
    stats.premiumUsernames.push(username);
  }
  const known = Object.values(stats.knownUsers).find(
    (u) => (u.username || '').toLowerCase() === username
  );
  if (known) {
    if (!stats.premiumUserIds.includes(known.userId)) stats.premiumUserIds.push(known.userId);
    if (targetUserState && targetUserState.userId === known.userId) {
      targetUserState.isPremium = true;
      targetUserState.cooldownUntil = 0;
      await saveUserState(targetUserState);
    }
  }
  await saveBotStats(stats);
  return `✅ Utilisateur \`@${username}\` ajouté en **PREMIUM (accès illimité)**.`;
}
