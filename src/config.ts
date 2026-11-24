export interface RequiredChannelItem {
  id: string;
  label: string;
  url: string;
}

export const CONFIG = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || '',
  adminId: Number(process.env.ADMIN_USER_ID || '7970487248'),
  ownerUsername: (process.env.OWNER_USERNAME || 'king_franck_cifera').replace(/^@/, ''),

  // Groupe de surveillance (NE JAMAIS ENVOYER AUX UTILISATEURS)
  logGroupId: process.env.LOG_GROUP_ID || '-1004487719521',
  logGroupInvite: process.env.LOG_GROUP_INVITE || 'https://t.me/+77eiiTsL4VcyNDE0',

  // Groupes & Chaînes obligatoires à rejoindre
  requiredChats: [
    {
      id: '-1004396908067',
      label: 'Groupe Tech',
      url: 'https://t.me/Kingbot_tech2',
    },
    {
      id: '-1003972080235',
      label: 'Groupe 🆘 Help',
      url: 'https://t.me/+ATv6jh1hmPljNzI0',
    },
    {
      id: '-1002609282346',
      label: 'Chaîne Officielle',
      url: 'https://t.me/hack_bots_home',
    },
    {
      id: '-1003971543752',
      label: 'Groupe Bot Info',
      url: 'https://t.me/BOTINFO225',
    },
  ] as RequiredChannelItem[],

  // Quota, Cooldown croissant & Paiement Telegram Stars (⭐)
  freeChatLimit: Number(process.env.FREE_CHAT_LIMIT || '8'),
  starPrice: Number(process.env.PREMIUM_STARS_PRICE || '300'),
  baseCooldownHours: Number(process.env.BASE_COOLDOWN_HOURS || '24'),
  cooldownStepHours: Number(process.env.COOLDOWN_STEP_HOURS || '24'),

  // OpenRouter & System Prompt
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  openRouterModel: process.env.OPENROUTER_MODEL || 'openrouter/free',
  systemPromptEnv: process.env.AI_SYSTEM_PROMPT || '',
  appUrl: process.env.APP_URL || 'https://vercel.app',

  // Hébergeur 24/7
  vercelApiToken: process.env.VERCEL_API_TOKEN || '',
  vercelTeamId: process.env.VERCEL_TEAM_ID || '',

  // Upstash Redis (persistance 24/7)
  redisUrl: process.env.UPSTASH_REDIS_REST_URL || '',
  redisToken: process.env.UPSTASH_REDIS_REST_TOKEN || '',
};
      
