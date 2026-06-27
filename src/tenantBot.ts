import { Telegraf, Markup } from 'telegraf';
import type { Tenant } from '@prisma/client';
import { prisma } from './db';
import { find } from 'geo-tz';
import { format, toZonedTime } from 'date-fns-tz';
import { subDays } from 'date-fns';
import { getUserTodayDateStr, getUserLocalMinutes } from './time';
import { tenantWebAppUrl } from './config';
import { updatePinnedTable } from './tableUtils';

// Tenant uchun Settings'ni olish (yo'q bo'lsa yaratish)
async function getSettings(tenantId: number) {
    let settings = await prisma.settings.findUnique({ where: { tenantId } });
    if (!settings) settings = await prisma.settings.create({ data: { tenantId } });
    return settings;
}

async function getTenant(tenantId: number): Promise<Tenant | null> {
    return prisma.tenant.findUnique({ where: { id: tenantId } });
}

async function isUserInGroup(bot: Telegraf, userId: number, groupId: string): Promise<boolean> {
    try {
        const member = await bot.telegram.getChatMember(groupId, userId);
        return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
    } catch {
        return false;
    }
}

/**
 * Bitta tenant (bot + guruh) uchun to'liq sozlangan Telegraf instansiyasini yaratadi.
 * Eski temur-fit botining barcha vazifalarini bajaradi, lekin tenantId bilan ajratilgan.
 */
export function createTenantBot(tenant: Tenant): Telegraf {
    const tenantId = tenant.id;
    const bot = new Telegraf(tenant.botToken);

    // ========== /id — guruh chat id ni ko'rsatish (sozlash uchun qulay) ==========
    bot.command('id', async (ctx) => {
        await ctx.reply(`Chat ID: <code>${ctx.chat.id}</code>`, { parse_mode: 'HTML' });
    });

    // ========== /setgroup — Ushbu guruhni tenantga bog'lash ==========
    bot.command('setgroup', async (ctx) => {
        if (ctx.chat.type === 'private') return;

        const telegramId = String(ctx.from?.id);
        const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);
        if (member.status !== 'creator' && member.status !== 'administrator') {
            return ctx.reply("Faqat guruh admin/yaratuvchisi /setgroup bosishi mumkin.");
        }

        await prisma.user.upsert({
            where: { tenantId_telegramId: { tenantId, telegramId } },
            create: { tenantId, telegramId, name: ctx.from.first_name || 'Admin', role: 'admin' },
            update: { role: 'admin' }
        });

        const settings = await getSettings(tenantId);
        const groupId = String(ctx.chat.id);
        await prisma.tenant.update({ where: { id: tenantId }, data: { groupId, ownerTelegramId: telegramId } });
        await prisma.settings.update({ where: { id: settings.id }, data: { groupId } });

        ctx.reply("✅ Ushbu guruh shu botning asosiy guruhi sifatida belgilandi! Endi a'zolar botga /start bosib ro'yxatdan o'tishi mumkin.");
    });

    // ========== /start — Ro'yxatdan o'tish ==========
    bot.start(async (ctx) => {
        if (ctx.chat.type !== 'private') return;

        const telegramId = String(ctx.from.id);
        const t = await getTenant(tenantId);
        const groupId = t?.groupId;

        const existingUser = await prisma.user.findUnique({
            where: { tenantId_telegramId: { tenantId, telegramId } }
        });
        const isAdmin = existingUser?.role === 'admin' || t?.ownerTelegramId === telegramId;

        if (isAdmin) {
            if (!existingUser) {
                await prisma.user.create({
                    data: { tenantId, telegramId, name: ctx.from.first_name || 'Admin', role: 'admin', timezone: 'Asia/Tashkent' }
                });
            }
            return ctx.reply(`Xush kelibsiz, ${existingUser?.name || ctx.from.first_name}! 🏋️`, Markup.inlineKeyboard([
                Markup.button.webApp("⚙️ Boshqaruv Paneli", tenantWebAppUrl(tenantId))
            ]));
        }

        if (!groupId) {
            return ctx.reply("⚠️ Hali guruh sozlanmagan. Admin botni guruhga qo'shib /setgroup bossin.");
        }

        const inGroup = await isUserInGroup(bot, ctx.from.id, groupId);
        if (!inGroup) {
            return ctx.reply("❌ Kechirasiz, siz ushbu guruhning a'zosi emassiz!");
        }

        if (!existingUser) {
            return ctx.reply("Assalomu alaykum! Iltimos, ismingizni kiriting:", Markup.forceReply());
        }

        return ctx.reply(`Xush kelibsiz, ${existingUser.name}! 💪 Kunlik ratsioningizni guruhga jo'nating.`, Markup.inlineKeyboard([
            Markup.button.webApp("📊 Jadvalni ko'rish", tenantWebAppUrl(tenantId))
        ]));
    });

    // ========== Ism va Lokatsiya qabul qilish ==========
    bot.on('message', async (ctx, next) => {
        if (ctx.chat.type !== 'private') return next();

        const msg = ctx.message as any;

        if (msg.reply_to_message && msg.text && msg.reply_to_message.text?.includes('ismingizni kiriting')) {
            const telegramId = String(ctx.from.id);
            const existing = await prisma.user.findUnique({ where: { tenantId_telegramId: { tenantId, telegramId } } });
            if (existing) return ctx.reply("Siz allaqachon ro'yxatdan o'tgansiz!");

            await prisma.user.create({
                data: { tenantId, telegramId, name: msg.text, timezone: 'Asia/Seoul' }
            });

            return ctx.reply("Rahmat! Endi vaqt mintaqangizni aniqlash uchun joylashuvingizni yuboring 📍", Markup.keyboard([
                Markup.button.locationRequest("📍 Lokatsiya yuborish")
            ]).oneTime().resize());
        }

        if (msg.location) {
            const telegramId = String(ctx.from.id);
            const user = await prisma.user.findUnique({ where: { tenantId_telegramId: { tenantId, telegramId } } });
            if (!user) return ctx.reply("Avval /start bosing.");

            const tz = find(msg.location.latitude, msg.location.longitude);
            const timezone = tz.length > 0 ? tz[0] : 'Asia/Seoul';

            await prisma.user.update({
                where: { id: user.id },
                data: { latitude: msg.location.latitude, longitude: msg.location.longitude, timezone }
            });

            return ctx.reply(`✅ Ajoyib! Vaqt mintaqangiz: ${timezone}\nEndi guruhga ratsioningizni jo'nating.`, Markup.removeKeyboard());
        }

        return next();
    });

    // ========== Guruhda rasm + hashtag qabul qilish ==========
    bot.on('photo', async (ctx) => {
        if (ctx.chat.type === 'private') return;

        const t = await getTenant(tenantId);
        const settings = await getSettings(tenantId);
        const groupId = t?.groupId || settings.groupId;
        if (String(ctx.chat.id) !== groupId) return;

        const caption = (ctx.message.caption || '').toLowerCase();
        const parseWords = (text: string) => text.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

        const bWords = parseWords(settings.breakfastWords);
        const lWords = parseWords(settings.lunchWords);
        const dWords = parseWords(settings.dinnerWords);

        let mealType = '';
        if (bWords.some(w => caption.includes(w))) mealType = 'nonushta';
        else if (lWords.some(w => caption.includes(w))) mealType = 'abed';
        else if (dWords.some(w => caption.includes(w))) mealType = 'kechki_ovqat';

        if (!mealType) return;

        const user = await prisma.user.findUnique({
            where: { tenantId_telegramId: { tenantId, telegramId: String(ctx.from.id) } }
        });
        if (!user) {
            return ctx.reply("Avval botga /start bosib ro'yxatdan o'ting!", { reply_parameters: { message_id: ctx.message.message_id } });
        }

        const userTimezone = user.timezone || 'Asia/Tashkent';
        let currentDateStr = getUserTodayDateStr(userTimezone);
        const mCurrent = getUserLocalMinutes(userTimezone);

        let targetTimeStr = '';
        if (mealType === 'nonushta') targetTimeStr = settings.breakfastTime;
        else if (mealType === 'abed') targetTimeStr = settings.lunchTime;
        else if (mealType === 'kechki_ovqat') targetTimeStr = settings.dinnerTime;

        const [tH, tM] = targetTimeStr.split(':').map(Number);
        const mTarget = tH * 60 + tM;

        const [bH, bM] = settings.breakfastTime.split(':').map(Number);
        const mBreakfast = bH * 60 + bM;

        let status = 'on_time';
        if (mealType === 'kechki_ovqat' && mCurrent < mBreakfast) {
            const yesterday = subDays(toZonedTime(new Date(), userTimezone), 1);
            currentDateStr = format(yesterday, 'yyyy-MM-dd', { timeZone: userTimezone });
            status = 'late';
        } else if (mCurrent > mTarget + 60) {
            status = 'late';
        }

        await ctx.reply("✅ Qabul qilindi! 💪", { reply_parameters: { message_id: ctx.message.message_id } });

        await prisma.mealRecord.upsert({
            where: { userId_date_mealType: { userId: user.id, date: currentDateStr, mealType } },
            create: { userId: user.id, date: currentDateStr, mealType, timeSent: new Date(), status },
            update: { timeSent: new Date(), status }
        });

        // Eski eslatmani o'chirish
        try {
            const mention = await prisma.mention.findUnique({
                where: { userId_mealType_date: { userId: user.id, mealType, date: currentDateStr } }
            });
            if (mention) {
                try { await bot.telegram.deleteMessage(groupId!, mention.messageId); } catch { /* ignore */ }
                await prisma.mention.delete({ where: { id: mention.id } });
            }
        } catch { /* ignore */ }

        const fresh = await getTenant(tenantId);
        if (fresh) await updatePinnedTable(bot, fresh);
    });

    return bot;
}
