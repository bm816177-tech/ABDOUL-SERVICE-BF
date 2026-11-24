import { CONFIG } from '../config';

export async function checkAllRequiredChats(userId: number): Promise<{
  allowed: boolean;
  missing: typeof CONFIG.requiredChats;
}> {
  if (userId === CONFIG.adminId) {
    return { allowed: true, missing: [] };
  }

  const missing: typeof CONFIG.requiredChats = [];

  for (const item of CONFIG.requiredChats) {
    try {
      const res = await fetch(
        `https://api.telegram.org/bot${CONFIG.botToken}/getChatMember?chat_id=${encodeURIComponent(
          item.id
        )}&user_id=${userId}`
      );
      const data = await res.json();
      const status = data?.result?.status;
      const ok = data?.ok && ['creator', 'administrator', 'member'].includes(status);
      if (!ok) {
        missing.push(item);
      }
    } catch {
      missing.push(item);
    }
  }

  return {
    allowed: missing.length === 0,
    missing,
  };
}
