import type { VercelRequest, VercelResponse } from '@vercel/node';
import { CONFIG } from '../src/config';
import { getBotStats, getUserState, saveBotStats, saveUserState } from '../src/storage/redis';
import { checkAllRequiredChats } from '../src/access/forceJoin';
import {
  evaluateUserQuota,
  grantPremiumToTarget,
  sendStarsPaymentInvoice,
  startRestorationCooldown,
} from '../src/access/quotaAndStars';
import { sendSurveillanceLog } from '../src/access/logger';
import { askOmniAI } from '../src/ai/openrouter';
import { executeTerminalInput } from '../src/terminal/engine';
import { renderTermuxScreen } from '../src/terminal/renderer';
import {
  buildDefaultFiles,
  deployProject24x7,
  generateAiProjectFiles,
  getProjectTypeLabel,
} from '../src/modules/projects';
import {
  getActiveEditableToken,
  syncDefaultBotCommands,
  updateBotDescription,
  updateBotName,
  updateBotShortDescription,
} from '../src/modules/botEditor';
import { generateVirtualNumbers, handleLabOrCyberCommand } from '../src/modules/labCyber';
import { PROVIDERS_CATALOG } from '../src/modules/providers';
import {
  buildEditBotKeyboard,
  buildForceJoinKeyboard,
  buildMainMenuKeyboard,
  buildNewProjectTypeKeyboard,
  buildProjectManageKeyboard,
  buildProjectsListKeyboard,
  buildTerminalKeyboard,
  InlineBtn,
} from '../src/keyboards';
import { HostedProject, ProjectKind } from '../src/types';

async function sendTgMessage(
  chatId: number | string,
  text: string,
  inlineKeyboard?: InlineBtn[][]
) {
  await fetch(`https://api.telegram.org/bot${CONFIG.botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text.slice(0, 4096),
      parse_mode: 'Markdown',
      reply_markup: inlineKeyboard ? { inline_keyboard: inlineKeyboard } : undefined,
    }),
  });
}

async function answerCallback(callbackQueryId: string, text?: string) {
  await fetch(`https://api.telegram.org/bot${CONFIG.botToken}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      callback_query_id: callbackQueryId,
      text,
      show_alert: false,
    }),
  });
}

async function answerPreCheckout(preCheckoutQueryId: string, ok = true, errorMessage?: string) {
  await fetch(`https://api.telegram.org/bot${CONFIG.botToken}/answerPreCheckoutQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
      error_message: errorMessage,
    }),
  });
}

function getAllCommandsText(): string {
  return [
    '📜 *LISTE COMPLÈTE DES COMMANDES*',
    '',
    '*🚀 Général & Accès*',
    '/start — Menu principal & vérification',
    '/help — Toutes les commandes',
    '/status — Ton statut, quota & étoiles',
    '/owner — Contacter le propriétaire',
    '',
    '*📂 Hébergement 24/7 & Projets*',
    '/projects — Mes projets en ligne 24/7',
    '/newproject — Liste tactique de projets à créer',
    '/deploy <nom> — Déployer / redéployer un projet',
    '/logs <nom> — Voir les logs d’un projet',
    '',
    '*⚙️ Configuration de Bot*',
    '/editbot — Modifier nom, description, à propos, photo, commandes',
    '/setname <nom> — Changer le nom du bot',
    '/setdesc <texte> — Changer la description',
    '/synccommands — Synchroniser le menu /',
    '',
    '*🖥️ Terminal Termux / Linux + IA*',
    '/term [cmd] — Ouvrir le terminal ou exécuter une commande',
    '/exit — Quitter le terminal',
    '',
    '*📱 Générateurs & Outils*',
    '/vnum [pays] [nb] — Générateur de numéros virtuels',
    '/gen <password|uuid|secret|b64|vnum|cron|docker>',
    '/hash <texte> — Générer MD5, SHA1, SHA256',
    '/b64 <encode|decode> <texte>',
    '/regex, /jwt, /json, /http, /cve, /owasp, /dork, /hardening, /ip, /dns, /ports',
    '/machines — Lister / ajouter des machines lab ou serveurs',
    '/providers — Répertoire des fournisseurs tech',
    '/save <note> & /notes — Carnet de notes dev',
    '',
    '*👑 Administration (Propriétaire)*',
    '/premium <ID ou @username> — Accorder accès illimité',
    '/unpremium <ID ou @username> — Retirer accès illimité',
    '/premiums — Lister les utilisateurs premium',
    '/withdraw — Retirer les étoiles (⭐) accumulées',
    '',
    '💬 *Message simple sans commande* → Réponse directe par *IA Omni* !',
  ].join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(200).send('OmniCyber Bot Webhook 24/7 actif 🚀');
  }

  try {
    const update = req.body || {};

    // 1. Validation paiement Telegram Stars (pre_checkout_query)
    if (update.pre_checkout_query) {
      await answerPreCheckout(update.pre_checkout_query.id, true);
      return res.status(200).json({ ok: true });
    }

    const fromUser =
      update.message?.from || update.callback_query?.from || update.pre_checkout_query?.from;

    if (!fromUser) {
      return res.status(200).json({ ok: true });
    }

    const userId: number = fromUser.id;
    const chatId: number =
      update.message?.chat?.id || update.callback_query?.message?.chat?.id || userId;

    const stats = await getBotStats();
    stats.knownUsers[String(userId)] = {
      userId,
      username: fromUser.username,
      firstName: fromUser.first_name,
    };
    await saveBotStats(stats);

    const user = await getUserState(userId, {
      username: fromUser.username,
      firstName: fromUser.first_name,
    });

    // 2. Paiement Telegram Stars réussi (successful_payment)
    if (update.message?.successful_payment) {
      const sp = update.message.successful_payment;
      const paidStars = Number(sp.total_amount || CONFIG.starPrice);
      stats.totalStarsEarned += paidStars;
      if (!stats.premiumUserIds.includes(userId)) {
        stats.premiumUserIds.push(userId);
      }
      user.isPremium = true;
      user.cooldownUntil = 0;
      await saveBotStats(stats);
      await saveUserState(user);

      const confirmMsg = `🎉 Paiement de *${paidStars} ⭐* confirmé ! Tu as maintenant un accès **ILLIMITÉ** au bot.`;
      await sendTgMessage(chatId, confirmMsg, buildMainMenuKeyboard(userId === CONFIG.adminId));
      await sendSurveillanceLog({
        userId,
        username: fromUser.username,
        firstName: fromUser.first_name,
        userInput: `[PAIEMENT ${paidStars} ⭐]`,
        botOutput: confirmMsg,
      });
      return res.status(200).json({ ok: true });
    }

    // 3. Vérification obligatoire des groupes et chaînes (sauf admin)
    const joinCheck = await checkAllRequiredChats(userId);
    if (!joinCheck.allowed) {
      const missingText = [
        '🔒 *ACCÈS RESTREINT*',
        'Pour utiliser le bot, tu dois obligatoirement rejoindre les groupes et chaînes suivants :',
        '',
        ...joinCheck.missing.map((m) => `• *${m.label}* : ${m.url}`),
        '',
        'Une fois rejoint, clique sur *✅ J’ai rejoint — Vérifier*.',
      ].join('\n');

      await sendTgMessage(chatId, missingText, buildForceJoinKeyboard());
      return res.status(200).json({ ok: true });
    }

    // Gestion Callback Query (boutons tactiles)
    if (update.callback_query) {
      const cb = update.callback_query;
      const data: string = cb.data || '';
      await answerCallback(cb.id);

      if (data === 'verify_join') {
        await sendTgMessage(
          chatId,
          '✅ Vérification validée ! Bienvenue sur *OmniCyber Bot 24/7*.',
          buildMainMenuKeyboard(userId === CONFIG.adminId)
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'back_main') {
        user.pendingAction = undefined;
        await saveUserState(user);
        await sendTgMessage(
          chatId,
          '🎛️ *Menu Principal OmniCyber*',
          buildMainMenuKeyboard(userId === CONFIG.adminId)
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_projects') {
        if (!user.projects.length) {
          await sendTgMessage(
            chatId,
            '📂 *Mes projets (24/7)*\nAucun projet enregistré pour le moment.',
            buildNewProjectTypeKeyboard()
          );
        } else {
          const listTxt = [
            '📂 *MES PROJETS (24h/24)*',
            '',
            ...user.projects.map(
              (p, idx) =>
                `${idx + 1}. *${p.name}* [${getProjectTypeLabel(p.kind)}] — ${
                  p.status === 'online_24_7' ? '🟢 En ligne 24/7' : '🟡 Brouillon'
                }${p.url ? `\n   └─ ${p.url}` : ''}`
            ),
          ].join('\n');
          await sendTgMessage(chatId, listTxt, buildProjectsListKeyboard(user.projects));
        }
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_newproject') {
        await sendTgMessage(
          chatId,
          '➕ *NOUVEAU PROJET — CHOISIS LE TYPE*',
          buildNewProjectTypeKeyboard()
        );
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith('np_kind_')) {
        const kind = data.replace('np_kind_', '') as ProjectKind;
        user.pendingAction = { type: 'new_project_name', kind };
        await saveUserState(user);
        await sendTgMessage(
          chatId,
          `✏️ Envoie le *nom* de ton projet (${getProjectTypeLabel(kind)}) :`
        );
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith('proj_manage_')) {
        const projId = data.replace('proj_manage_', '');
        const proj = user.projects.find((p) => p.id === projId);
        if (!proj) {
          await sendTgMessage(chatId, '❌ Projet introuvable.');
          return res.status(200).json({ ok: true });
        }
        const info = [
          `🔧 *PROJET : ${proj.name}*`,
          `Type : ${getProjectTypeLabel(proj.kind)}`,
          `Statut : ${proj.status === 'online_24_7' ? '🟢 En ligne 24/7' : '🟡 Brouillon'}`,
          proj.url ? `URL : ${proj.url}` : 'URL : non déployé',
        ].join('\n');
        await sendTgMessage(chatId, info, buildProjectManageKeyboard(proj));
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith('proj_deploy_')) {
        const projId = data.replace('proj_deploy_', '');
        const proj = user.projects.find((p) => p.id === projId);
        if (!proj) return res.status(200).json({ ok: true });
        const dep = await deployProject24x7(user, proj);
        await sendTgMessage(chatId, dep.message, buildProjectManageKeyboard(proj));
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith('proj_logs_')) {
        const projId = data.replace('proj_logs_', '');
        const proj = user.projects.find((p) => p.id === projId);
        if (!proj) return res.status(200).json({ ok: true });
        const logsText = proj.logs.length ? proj.logs.slice(-10).join('\n') : 'Aucun log.';
        await sendTgMessage(chatId, `📜 *LOGS — ${proj.name}*\n\`\`\`\n${logsText}\n\`\`\``);
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith('proj_env_')) {
        const projId = data.replace('proj_env_', '');
        user.pendingAction = { type: 'set_project_env', projectId: projId };
        await saveUserState(user);
        await sendTgMessage(chatId, '🔑 Envoie la variable au format `CLE=VALEUR` :');
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith('proj_del_')) {
        const projId = data.replace('proj_del_', '');
        user.projects = user.projects.filter((p) => p.id !== projId);
        await saveUserState(user);
        await sendTgMessage(chatId, '🗑️ Projet supprimé.', buildMainMenuKeyboard(userId === CONFIG.adminId));
        return res.status(200).json({ ok: true });
      }

      if (data === 'open_term') {
        user.terminal.active = true;
        await saveUserState(user);
        const screen = renderTermuxScreen(
          user.terminal,
          'status',
          'Terminal Termux actif. Envoie une commande ou utilise les boutons.',
          0
        );
        await sendTgMessage(chatId, screen, buildTerminalKeyboard());
        return res.status(200).json({ ok: true });
      }

      if (data.startsWith('term_cmd_')) {
        const cmd = data.replace('term_cmd_', '');
        const resTerm = await executeTerminalInput(user, cmd);
        await sendTgMessage(
          chatId,
          resTerm.text,
          resTerm.exitTerminal ? buildMainMenuKeyboard(userId === CONFIG.adminId) : buildTerminalKeyboard()
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_editbot') {
        await sendTgMessage(chatId, '⚙️ *MODIFIER SON BOT TELEGRAM*', buildEditBotKeyboard());
        return res.status(200).json({ ok: true });
      }

      if (data === 'editbot_name') {
        user.pendingAction = { type: 'edit_bot_field', field: 'name' };
        await saveUserState(user);
        await sendTgMessage(chatId, '📛 Envoie le nouveau *nom* du bot :');
        return res.status(200).json({ ok: true });
      }

      if (data === 'editbot_desc') {
        user.pendingAction = { type: 'edit_bot_field', field: 'description' };
        await saveUserState(user);
        await sendTgMessage(chatId, '📝 Envoie la nouvelle *description* du bot :');
        return res.status(200).json({ ok: true });
      }

      if (data === 'editbot_short') {
        user.pendingAction = { type: 'edit_bot_field', field: 'shortDescription' };
        await saveUserState(user);
        await sendTgMessage(chatId, 'ℹ️ Envoie le nouveau texte *"À propos"* :');
        return res.status(200).json({ ok: true });
      }

      if (data === 'editbot_photo') {
        user.pendingAction = { type: 'edit_bot_field', field: 'photo' };
        await saveUserState(user);
        await sendTgMessage(
          chatId,
          '🖼️ Envoie une image ici ou utilise `/setuserpic` dans @BotFather pour définir la photo officielle du bot.'
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'editbot_cmds') {
        const out = await syncDefaultBotCommands(getActiveEditableToken(user.targetBotToken));
        await sendTgMessage(chatId, out, buildEditBotKeyboard());
        return res.status(200).json({ ok: true });
      }

      if (data === 'quick_vnum') {
        await sendTgMessage(chatId, generateVirtualNumbers('us', 3));
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_gen') {
        await sendTgMessage(
          chatId,
          '⚡ *GÉNÉRATEURS*\n• `/vnum fr 3`\n• `/gen password 24`\n• `/gen uuid`\n• `/gen secret 32`\n• `/gen b64 texte`\n• `/hash texte`'
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_lab') {
        await sendTgMessage(
          chatId,
          '🧪 *LAB & CYBERSÉCURITÉ*\n• `/term <cmd>`\n• `/regex`, `/jwt`, `/json`, `/http`\n• `/cve`, `/owasp`, `/dork`, `/hardening`\n• `/ip`, `/dns`, `/ports`'
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_providers') {
        await sendTgMessage(chatId, PROVIDERS_CATALOG);
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_machines') {
        const mTxt =
          user.machines.map((m) => `🖥️ *${m.name}* (${m.os}) — \`${m.target}\`\n└─ ${m.notes}`).join('\n\n') ||
          'Aucune machine.';
        await sendTgMessage(chatId, mTxt);
        return res.status(200).json({ ok: true });
      }

      if (data === 'menu_help') {
        await sendTgMessage(chatId, getAllCommandsText());
        return res.status(200).json({ ok: true });
      }

      if (data === 'admin_withdraw' && userId === CONFIG.adminId) {
        const available = stats.totalStarsEarned - stats.totalStarsWithdrawn;
        await sendTgMessage(
          chatId,
          `⭐ *RETRAIT D'ÉTOILES*\nSolde disponible : *${available} ⭐*\nUtilise \`/withdraw\` pour transférer/enregistrer le retrait vers ton compte @${CONFIG.ownerUsername}.`
        );
        return res.status(200).json({ ok: true });
      }

      if (data === 'admin_premiums' && userId === CONFIG.adminId) {
        await sendTgMessage(
          chatId,
          `👑 *UTILISATEURS PREMIUM*\nIDs : \`${stats.premiumUserIds.join(', ') || 'aucun'}\`\nUsernames : \`${stats.premiumUsernames.join(', ') || 'aucun'}\``
        );
        return res.status(200).json({ ok: true });
      }

      return res.status(200).json({ ok: true });
    }

    // 4. Messages texte / commandes
    const msg = update.message;
    const text: string = (msg?.text || msg?.caption || '').trim();
    if (!text) {
      return res.status(200).json({ ok: true });
    }

    // Vérification Quota / Cooldown croissant / Paywall 300 ⭐
    const quota = await evaluateUserQuota(user, stats);
    if (!quota.allowed) {
      if (quota.reason === 'cooldown') {
        const waitMsg = `⏳ Tu as atteint la limite. Patiente encore environ *${quota.remainingHours}h* pour la restauration (ou contacte @${CONFIG.ownerUsername}).`;
        await sendTgMessage(chatId, waitMsg);
        await sendSurveillanceLog({
          userId,
          username: fromUser.username,
          firstName: fromUser.first_name,
          userInput: text,
          botOutput: waitMsg,
        });
        return res.status(200).json({ ok: true });
      }

      // Paywall 300 ⭐ + option restauration avec temps croissant
      const hours = await startRestorationCooldown(user);
      const paywallMsg = [
        `⭐ *LIMITE DE DISCUSSIONS ATTEINTE*`,
        `Pour continuer immédiatement sans attendre, un paiement de *${CONFIG.starPrice} ⭐* est requis.`,
        `Sinon, une restauration a été lancée : tu devras attendre *${hours}h* (ce délai augmente après chaque restauration).`,
      ].join('\n');

      await sendTgMessage(chatId, paywallMsg);
      await sendStarsPaymentInvoice(chatId, userId);
      await sendSurveillanceLog({
        userId,
        username: fromUser.username,
        firstName: fromUser.first_name,
        userInput: text,
        botOutput: paywallMsg,
      });
      return res.status(200).json({ ok: true });
    }

    let replyText = '';

    // 5. Actions en attente (wizards interactifs)
    if (user.pendingAction) {
      const act = user.pendingAction;
      user.pendingAction = undefined;

      if (act.type === 'new_project_name') {
        const projName = text.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 32) || 'mon-projet';
        if (act.kind === 'ai') {
          user.pendingAction = { type: 'new_project_prompt', name: projName, kind: act.kind };
          await saveUserState(user);
          replyText = `🧠 Décris en une phrase ce que l'IA doit générer pour *${projName}* :`;
        } else if (act.kind === 'tg') {
          user.pendingAction = { type: 'new_project_token', name: projName, kind: act.kind };
          await saveUserState(user);
          replyText = `🤖 Envoie le *BOT_TOKEN* Telegram pour *${projName}* (ou tape \`skip\`) :`;
        } else {
          const newProj: HostedProject = {
            id: `${Date.now()}`,
            name: projName,
            kind: act.kind,
            status: 'draft',
            files: buildDefaultFiles(projName, act.kind),
            env: {},
            logs: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          };
          user.projects.push(newProj);
          await saveUserState(user);
          const dep = await deployProject24x7(user, newProj);
          replyText = dep.message;
        }
      } else if (act.type === 'new_project_prompt') {
        const files = await generateAiProjectFiles(act.name, act.kind, text);
                const newProj: HostedProject = {
          id: `${Date.now()}`,
          name: act.name,
          kind: act.kind,
          status: 'draft',
          files,
          env: {},
          logs: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        user.projects.push(newProj);
        await saveUserState(user);
        const dep = await deployProject24x7(user, newProj);
        replyText = dep.message;
      } else if (act.type === 'new_project_token') {
        const botToken = text.toLowerCase() === 'skip' ? undefined : text;
        const newProj: HostedProject = {
          id: `${Date.now()}`,
          name: act.name,
          kind: act.kind,
          status: 'draft',
          botToken,
          files: buildDefaultFiles(act.name, act.kind),
          env: botToken ? { BOT_TOKEN: botToken } : {},
          logs: [],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        user.projects.push(newProj);
        await saveUserState(user);
        const dep = await deployProject24x7(user, newProj);
        replyText = dep.message;
      } else if (act.type === 'edit_bot_field') {
        const tok = getActiveEditableToken(act.targetToken || user.targetBotToken);
        if (act.field === 'name') replyText = await updateBotName(tok, text);
        else if (act.field === 'description') replyText = await updateBotDescription(tok, text);
        else if (act.field === 'shortDescription') replyText = await updateBotShortDescription(tok, text);
        else replyText = '🖼️ Photo reçue. Pour mettre à jour l’avatar officiel, envoie `/setuserpic` à @BotFather.';
      } else if (act.type === 'set_project_env') {
        const proj = user.projects.find((p) => p.id === act.projectId);
        const [k, ...v] = text.split('=');
        if (proj && k && v.length > 0) {
          proj.env[k.trim()] = v.join('=').trim();
          await saveUserState(user);
          replyText = `🔑 Variable \`${k.trim()}\` ajoutée à *${proj.name}*.`;
        } else {
          replyText = '❌ Format invalide. Utilise `CLE=VALEUR`.';
        }
      }

      await sendTgMessage(chatId, replyText, buildMainMenuKeyboard(userId === CONFIG.adminId));
      await sendSurveillanceLog({
        userId,
        username: fromUser.username,
        firstName: fromUser.first_name,
        userInput: text,
        botOutput: replyText,
      });
      return res.status(200).json({ ok: true });
    }

    // 6. Commandes slash (/)
    if (text.startsWith('/')) {
      const [rawCmd, ...restArgs] = text.slice(1).split(/\s+/);
      const cmd = rawCmd.toLowerCase().split('@')[0];
      const args = restArgs.join(' ');

      if (cmd === 'start') {
        replyText = [
          `⚡ *OMNICYBER BOT 24/7*`,
          `Bienvenue ${fromUser.first_name || 'Dev'} !`,
          '',
          `• *IA Omni* : écris directement un message sans commande.`,
          `• *Terminal Termux/Linux* : \`/term\``,
          `• *Hébergeur 24/7* : \`/projects\` & \`/newproject\``,
          `• *Numéros virtuels* : \`/vnum\``,
          `• *Propriétaire* : @${CONFIG.ownerUsername}`,
        ].join('\n');
        await sendTgMessage(chatId, replyText, buildMainMenuKeyboard(userId === CONFIG.adminId));
      } else if (cmd === 'help') {
        replyText = getAllCommandsText();
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'status') {
        const isUnlimited = userId === CONFIG.adminId || user.isPremium;
        replyText = [
          '📊 *STATUT COMPTE*',
          `• ID : \`${userId}\``,
          `• Accès : ${isUnlimited ? '👑 ILLIMITÉ (Premium/Admin)' : `Gratuit (${user.usageCount}/${CONFIG.freeChatLimit})`}`,
          `• Restaurations effectuées : ${user.restorationCount}`,
          `• Tarif Premium : ${CONFIG.starPrice} ⭐`,
        ].join('\n');
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'owner') {
        replyText = `👑 Propriétaire du bot : @${CONFIG.ownerUsername}`;
        await sendTgMessage(chatId, replyText, [
          [{ text: `Contacter @${CONFIG.ownerUsername}`, url: `https://t.me/${CONFIG.ownerUsername}` }],
        ]);
      } else if (cmd === 'premium') {
        if (userId !== CONFIG.adminId) {
          replyText = '⛔ Réservé au propriétaire du bot.';
          await sendTgMessage(chatId, replyText);
        } else {
          replyText = await grantPremiumToTarget(args, stats, user);
          await sendTgMessage(chatId, replyText);
        }
      } else if (cmd === 'unpremium') {
        if (userId !== CONFIG.adminId) {
          replyText = '⛔ Réservé au propriétaire du bot.';
        } else {
          const clean = args.trim().replace(/^@/, '').toLowerCase();
          if (/^\d+$/.test(clean)) {
            const numId = Number(clean);
            stats.premiumUserIds = stats.premiumUserIds.filter((id) => id !== numId);
            if (user.userId === numId && numId !== CONFIG.adminId) user.isPremium = false;
          } else if (clean) {
            stats.premiumUsernames = stats.premiumUsernames.filter((u) => u !== clean);
          }
          await saveBotStats(stats);
          await saveUserState(user);
          replyText = `✅ Statut premium mis à jour pour \`${args}\`.`;
        }
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'premiums') {
        if (userId !== CONFIG.adminId) {
          replyText = '⛔ Réservé au propriétaire du bot.';
        } else {
          replyText = `👑 *Premium IDs :* \`${stats.premiumUserIds.join(', ')}\`\n*Premium Usernames :* \`${stats.premiumUsernames.join(', ')}\``;
        }
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'withdraw') {
        if (userId !== CONFIG.adminId) {
          replyText = '⛔ Réservé au propriétaire du bot.';
        } else {
          const available = stats.totalStarsEarned - stats.totalStarsWithdrawn;
          if (available <= 0) {
            replyText = `⭐ Aucune étoile disponible au retrait (Total gagné : ${stats.totalStarsEarned} ⭐, Déjà retiré : ${stats.totalStarsWithdrawn} ⭐).`;
          } else {
            stats.totalStarsWithdrawn += available;
            await saveBotStats(stats);
            replyText = `⭐ *Retrait enregistré : ${available} ⭐* vers le compte du propriétaire (@${CONFIG.ownerUsername}, ID \`${CONFIG.adminId}\`).\nTotal retiré : *${stats.totalStarsWithdrawn} ⭐*.`;
          }
        }
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'projects') {
        if (!user.projects.length) {
          replyText = '📂 Aucun projet. Utilise `/newproject` ou le bouton *➕ Nouveau projet*.';
          await sendTgMessage(chatId, replyText, buildNewProjectTypeKeyboard());
        } else {
          replyText = [
            '📂 *MES PROJETS (24/7)*',
            ...user.projects.map(
              (p) => `• *${p.name}* [${getProjectTypeLabel(p.kind)}] ${p.url ? `→ ${p.url}` : ''}`
            ),
          ].join('\n');
          await sendTgMessage(chatId, replyText, buildProjectsListKeyboard(user.projects));
        }
      } else if (cmd === 'newproject') {
        replyText = '➕ *CHOISIS LE TYPE DE PROJET À CRÉER*';
        await sendTgMessage(chatId, replyText, buildNewProjectTypeKeyboard());
      } else if (cmd === 'deploy') {
        const target = user.projects.find((p) => p.name === args.trim()) || user.projects[user.projects.length - 1];
        if (!target) {
          replyText = '❌ Aucun projet trouvé à déployer.';
        } else {
          const dep = await deployProject24x7(user, target);
          replyText = dep.message;
        }
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'editbot') {
        replyText = '⚙️ *MODIFIER SON BOT TELEGRAM*';
        await sendTgMessage(chatId, replyText, buildEditBotKeyboard());
      } else if (cmd === 'setname') {
        replyText = await updateBotName(getActiveEditableToken(user.targetBotToken), args);
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'setdesc') {
        replyText = await updateBotDescription(getActiveEditableToken(user.targetBotToken), args);
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'synccommands') {
        replyText = await syncDefaultBotCommands(getActiveEditableToken(user.targetBotToken));
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'term') {
        user.terminal.active = true;
        await saveUserState(user);
        if (args) {
          const out = await executeTerminalInput(user, args);
          replyText = out.text;
          await sendTgMessage(
            chatId,
            replyText,
            out.exitTerminal ? buildMainMenuKeyboard(userId === CONFIG.adminId) : buildTerminalKeyboard()
          );
        } else {
          replyText = renderTermuxScreen(
            user.terminal,
            'bash',
            'Terminal Termux / Linux prêt. Tape tes commandes directement.',
            0
          );
          await sendTgMessage(chatId, replyText, buildTerminalKeyboard());
        }
      } else if (cmd === 'exit') {
        user.terminal.active = false;
        user.terminal.mode = 'shell';
        await saveUserState(user);
        replyText = '🚪 Terminal fermé.';
        await sendTgMessage(chatId, replyText, buildMainMenuKeyboard(userId === CONFIG.adminId));
      } else if (cmd === 'providers') {
        replyText = PROVIDERS_CATALOG;
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'save') {
        if (args) {
          user.notes.push({
            id: `${Date.now()}`,
            text: args,
            tag: 'dev',
            createdAt: new Date().toISOString(),
          });
          await saveUserState(user);
          replyText = '💾 Note sauvegardée.';
        } else {
          replyText = 'Usage : `/save <ta note ou commande>`';
        }
        await sendTgMessage(chatId, replyText);
      } else if (cmd === 'notes') {
        replyText = user.notes.length
          ? '📝 *TES NOTES*\n' + user.notes.map((n, i) => `${i + 1}. ${n.text}`).join('\n')
          : '📝 Aucune note enregistrée.';
        await sendTgMessage(chatId, replyText);
      } else {
        replyText = await handleLabOrCyberCommand(cmd, args);
        await sendTgMessage(chatId, replyText);
      }

      await sendSurveillanceLog({
        userId,
        username: fromUser.username,
        firstName: fromUser.first_name,
        userInput: text,
        botOutput: replyText,
      });
      return res.status(200).json({ ok: true });
    }

    // 7. Si la session Terminal est active -> exécute dans le Terminal Termux / Linux
    if (user.terminal.active) {
      const termRes = await executeTerminalInput(user, text);
      replyText = termRes.text;
      await sendTgMessage(
        chatId,
        replyText,
        termRes.exitTerminal ? buildMainMenuKeyboard(userId === CONFIG.adminId) : buildTerminalKeyboard()
      );
      await sendSurveillanceLog({
        userId,
        username: fromUser.username,
        firstName: fromUser.first_name,
        userInput: `[TERM] ${text}`,
        botOutput: replyText,
      });
      return res.status(200).json({ ok: true });
    }

    // 8. Message simple sans commande -> IA Omni avec ton System Prompt
    replyText = await askOmniAI(text);
    await sendTgMessage(chatId, replyText);
    await sendSurveillanceLog({
      userId,
      username: fromUser.username,
      firstName: fromUser.first_name,
      userInput: text,
      botOutput: replyText,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(200).json({ ok: true });
  }
}
