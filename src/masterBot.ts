import { Telegraf, Markup } from 'telegraf';
import { MASTER_BOT_TOKEN, SUPER_ADMIN_ID, superWebAppUrl } from './config';

let masterBot: Telegraf | null = null;

/**
 * Super-admin boshqaruv botini yaratadi.
 * Faqat SUPER_ADMIN_ID egasiga super panelni ochadi.
 */
export function createMasterBot(): Telegraf | null {
    if (!MASTER_BOT_TOKEN) {
        console.warn('⚠️ MASTER_BOT_TOKEN yo\'q — master bot ishga tushmaydi');
        return null;
    }

    const bot = new Telegraf(MASTER_BOT_TOKEN);

    // /id — istalgan guruhda chat id ni ko'rsatadi (guruh id ni olish uchun)
    bot.command('id', async (ctx) => {
        await ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>`, { parse_mode: 'HTML' });
    });

    bot.start(async (ctx) => {
        if (ctx.chat.type !== 'private') return;
        const telegramId = String(ctx.from.id);

        if (telegramId !== SUPER_ADMIN_ID) {
            return ctx.reply('⛔️ Bu super-admin boshqaruv boti. Sizda ruxsat yo\'q.');
        }

        return ctx.reply(
            '👑 Super-admin paneliga xush kelibsiz!\n\nQuyidagi tugma orqali botlarni boshqaring: yangi bot qo\'shing (token + guruh id), faolligini o\'zgartiring yoki o\'chiring.',
            Markup.inlineKeyboard([
                Markup.button.webApp('🚀 Super Admin Panel', superWebAppUrl())
            ])
        );
    });

    bot.command('panel', async (ctx) => {
        if (ctx.chat.type !== 'private') return;
        if (String(ctx.from.id) !== SUPER_ADMIN_ID) return;
        return ctx.reply('👑 Super Admin Panel', Markup.inlineKeyboard([
            Markup.button.webApp('🚀 Ochish', superWebAppUrl())
        ]));
    });

    masterBot = bot;
    return bot;
}

export async function launchMasterBot(): Promise<void> {
    const bot = masterBot || createMasterBot();
    if (!bot) return;

    try { await bot.telegram.deleteWebhook({ drop_pending_updates: true }); } catch { /* ignore */ }

    bot.launch({ dropPendingUpdates: true })
        .then(() => console.log('⏹ Master bot to\'xtadi'))
        .catch((e: any) => console.error('❌ Master bot ishga tushmadi:', e?.message || e));

    console.log('👑 Master bot ishga tushdi');
}

export function getMasterBot(): Telegraf | null {
    return masterBot;
}
