// AGENTVERSE Telegram Bot: 1-click interactive mobile approvals for work items, song videos & leads.
//
// Endpoints:
//   POST /api/telegram/webhook   Telegram webhook handler for inline button clicks
//   POST /api/telegram/test      Test notification (owner only)
//
// Secrets / Vars:
//   TELEGRAM_BOT_TOKEN   Bot token from @BotFather (e.g. 123456789:ABCdefGhIJKlmNoPQRsTUVwxyZ)
//   TELEGRAM_CHAT_ID     Owner chat ID from @userinfobot or /start

const TG_API = 'https://api.telegram.org';
const DEFAULT_BOT_TOKEN = '8852122727:AAHbi2M5gjSvH5HbKohyHS6Z_DOrRdGH_SI';

export async function sendTelegramMessage(env, text, replyMarkup = null, fetchImpl = fetch, targetChatId = null) {
  const token = env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  let chatId = targetChatId || env.TELEGRAM_CHAT_ID;
  if (!chatId && env.KV) {
    try {
      chatId = (await env.KV.get('tg/chat_id')) || (await env.KV.get('signal/telegram_chat_id'));
    } catch {}
  }
  if (!token || !chatId) return false;
  const url = `${TG_API}/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch (e) {
    console.error('[telegram] send failed:', e?.message);
    return false;
  }
}

export async function sendTelegramPhoto(env, photoUrl, caption = '', replyMarkup = null, fetchImpl = fetch, targetChatId = null) {
  const token = env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  let chatId = targetChatId || env.TELEGRAM_CHAT_ID;
  if (!chatId && env.KV) {
    try {
      chatId = (await env.KV.get('tg/chat_id')) || (await env.KV.get('signal/telegram_chat_id'));
    } catch {}
  }
  if (!token || !chatId) return false;
  const url = `${TG_API}/bot${token}/sendPhoto`;
  const body = {
    chat_id: chatId,
    photo: photoUrl,
    caption,
    parse_mode: 'HTML',
  };
  if (replyMarkup) body.reply_markup = replyMarkup;

  try {
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return r.ok;
  } catch (e) {
    console.error('[telegram] sendPhoto failed:', e?.message);
    return false;
  }
}

export async function notifyApproval(env, { id, type, title, brand, summary, estCost }, fetchImpl = fetch, targetChatId = null) {
  const token = env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  let chatId = targetChatId || env.TELEGRAM_CHAT_ID;
  if (!chatId && env.KV) {
    try {
      chatId = (await env.KV.get('tg/chat_id')) || (await env.KV.get('signal/telegram_chat_id'));
    } catch {}
  }
  if (!token || !chatId) return false;

  const typeName = type === 'song' ? '🎵 Song → Video Plan' : type === 'lead' ? '🎯 High-Intent Lead' : type === 'signal' || String(id).startsWith('sig_') ? '🚀 PRANAV SIGNAL — LinkedIn Post' : '📝 Agent Work Draft';
  const brandTag = brand ? `<b>[${escapeHtml(brand)}]</b> ` : '';
  const costLine = estCost ? `\n💰 <b>Estimated Cost:</b> ${escapeHtml(estCost)}` : '';
  const summaryLine = summary ? `\n\n${escapeHtml(summary)}` : '';

  const text = `⚡ <b>AGENTVERSE Approval Request</b>\n\n${brandTag}${typeName}\n<b>${escapeHtml(title)}</b>${summaryLine}${costLine}\n\nTap below to approve or reject:`;

  const inlineKeyboard = {
    inline_keyboard: [
      [
        { text: '✅ Approve', callback_data: `app:${type}:${id}` },
        { text: '❌ Reject', callback_data: `rej:${type}:${id}` },
      ],
    ],
  };

  return sendTelegramMessage(env, text, inlineKeyboard, fetchImpl, chatId);
}

export async function handleWebhook(env, update, onAction, fetchImpl = fetch) {
  if (!update) return { ok: true, handled: false };

  // Handle direct messages (e.g. /start, /help) to give the user their chat ID instantly
  if (update.message) {
    const msg = update.message;
    const chatId = msg.chat?.id;
    const fromName = msg.from?.first_name || 'there';
    const token = env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
    if (chatId) {
      if (env.KV) {
        try {
          await env.KV.put('tg/chat_id', String(chatId));
          await env.KV.put('signal/telegram_chat_id', String(chatId));
        } catch {}
      }
      const welcome = `👋 <b>Hello ${escapeHtml(fromName)}! Welcome to AGENTVERSE & PRANAV SIGNAL.</b>\n\n` +
        `Your Telegram Chat ID is: <code>${chatId}</code>\n\n` +
        `✅ <b>Connected!</b> Your 1-click mobile approval channel is active.\n` +
        `Every morning at 09:30 AM IST, your original LinkedIn thought leadership draft and visual will arrive right here! 🚀`;

      try {
        await fetchImpl(`${TG_API}/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: welcome,
            parse_mode: 'HTML',
          }),
        });
      } catch {}

      if (typeof onAction === 'function') {
        try {
          await onAction('send_latest_signal', 'signal', chatId);
        } catch {}
      }
      return { ok: true, handled: true, type: 'message', chatId };
    }
    return { ok: true, handled: false };
  }

  if (!update.callback_query) return { ok: true, handled: false };
  const cq = update.callback_query;
  const data = cq.data || '';
  const parts = data.split(':');
  if (parts.length < 3) return { ok: true, handled: false };

  const [act, type, id] = parts;
  const isApprove = act === 'app';
  const actionName = isApprove ? 'approve' : 'reject';

  let resultMessage = isApprove ? '✅ Approved!' : '❌ Rejected.';
  try {
    if (typeof onAction === 'function') {
      const res = await onAction(actionName, type, id);
      if (res?.message) resultMessage = res.message;
    }
  } catch (e) {
    resultMessage = `⚠️ Error: ${e.message}`;
  }

  // Answer callback query so user sees popup alert
  const botToken = env.TELEGRAM_BOT_TOKEN || DEFAULT_BOT_TOKEN;
  if (botToken && cq.id) {
    try {
      await fetchImpl(`${TG_API}/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ callback_query_id: cq.id, text: resultMessage }),
      });
    } catch {}
  }

  // Edit original message to remove buttons and show decision
  if (botToken && cq.message?.message_id && cq.message?.chat?.id) {
    try {
      const origText = cq.message.text || '';
      const decisionText = `${origText}\n\n━━━━━━━━━━━━━━━━━━━━\n${isApprove ? '✅' : '❌'} <b>${isApprove ? 'Approved' : 'Rejected'} via Telegram</b> at ${new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC`;
      await fetchImpl(`${TG_API}/bot${botToken}/editMessageText`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: cq.message.chat.id,
          message_id: cq.message.message_id,
          text: decisionText,
          parse_mode: 'HTML',
        }),
      });
    } catch {}
  }

  return { ok: true, handled: true, action: actionName, type, id };
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
