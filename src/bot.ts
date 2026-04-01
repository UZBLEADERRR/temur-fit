import { Telegraf, Markup } from 'telegraf';
import { prisma } from './db';
import { find } from 'geo-tz';
import { format, toZonedTime } from 'date-fns-tz';
import { differenceInHours } from 'date-fns';
import dotenv from 'dotenv';
dotenv.config();

const botToken = process.env.BOT_TOKEN;
if (!botToken) throw new Error('BOT_TOKEN is missing');
export const bot = new Telegraf(botToken);

// ========== YORDAMCHI FUNKSIYALAR ==========

const getSettings = async () => {
    let settings = await prisma.settings.findFirst();
    if (!settings) {
        settings = await prisma.settings.create({ data: {} });
    }
    return settings;
};

async function isUserInGroup(userId: number, groupId: string): Promise<boolean> {
    try {
        const member = await bot.telegram.getChatMember(groupId, userId);
        return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
    } catch (e) {
        return false;
    }
}

async function updatePinnedTable() {
    const settings = await getSettings();
    if (!settings.groupId || !settings.pinnedMessageId) return;

    const koreaTime = toZonedTime(new Date(), 'Asia/Seoul');
    const dateStr = format(koreaTime, 'yyyy-MM-dd', { timeZone: 'Asia/Seoul' });

    const users = await prisma.user.findMany({
        include: { mealRecords: { where: { date: dateStr } } },
        orderBy: { id: 'asc' }
    });
    if (users.length === 0) return;

    let table = `📅 Sana: ${dateStr}\n💪 Temur.fit ratsion jadvali\n\n`;
    table += `No | Ism          | N | A | K\n`;
    table += `────────────────────────────\n`;

    users.forEach((user, idx) => {
        const getStatus = (type: string) => {
            const r = user.mealRecords.find(rec => rec.mealType === type);
            if (!r) return '✖';
            return r.status === 'late' ? '⚠' : '●';
        };
        const name = user.name.padEnd(12).substring(0, 12);
        table += `${String(idx + 1).padStart(2)}. ${name} | ${getStatus('nonushta')} | ${getStatus('abed')} | ${getStatus('kechki_ovqat')}\n`;
    });

    try {
        await bot.telegram.editMessageText(
            settings.groupId,
            settings.pinnedMessageId,
            undefined,
            table,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "📊 Jadvalni ko'rish", web_app: { url: process.env.WEBAPP_URL || 'https://google.com' } }
                    ]]
                }
            }
        );
    } catch (e) {
        console.error('Jadvalni yangilashda xato:', e);
    }
}

// ========== /setgroup — Guruhni belgilash ==========
bot.command('setgroup', async (ctx) => {
    if (ctx.chat.type === 'private') return;

    const telegramId = String(ctx.from?.id);
    const member = await ctx.telegram.getChatMember(ctx.chat.id, ctx.from.id);

    if (member.status !== 'creator' && member.status !== 'administrator') {
        return ctx.reply("Faqat guruh admin/yaratuvchisi /setgroup bosishi mumkin.");
    }

    // Admin bo'lsa, bazada admin qilib belgilaymiz
    await prisma.user.upsert({
        where: { telegramId },
        create: { telegramId, name: ctx.from.first_name || 'Admin', role: 'admin' },
        update: { role: 'admin' }
    });

    const settings = await getSettings();
    await prisma.settings.update({
        where: { id: settings.id },
        data: { groupId: String(ctx.chat.id) }
    });

    ctx.reply("✅ Ushbu guruh asosiy guruh sifatida belgilandi! Endi userlar botga /start bosib ro'yxatdan o'tishi mumkin.");
});

// ========== /start — Ro'yxatdan o'tish ==========
bot.start(async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const telegramId = String(ctx.from.id);
    const settings = await getSettings();

    if (!settings.groupId) {
        return ctx.reply("⚠️ Hali guruh sozlanmagan. Admin guruhga botni qo'shib /setgroup bosishi kerak.");
    }

    const inGroup = await isUserInGroup(ctx.from.id, settings.groupId);
    if (!inGroup) {
        return ctx.reply("❌ Kechirasiz, siz Temur.fit guruhining a'zosi emassiz!");
    }

    const user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
        return ctx.reply("Assalomu alaykum! Iltimos, ismingizni kiriting:", Markup.forceReply());
    }

    if (user.role === 'admin') {
        return ctx.reply(`Xush kelibsiz, ${user.name}! 🏋️`, Markup.inlineKeyboard([
            Markup.button.webApp("⚙️ Boshqaruv Paneli", process.env.WEBAPP_URL || 'https://google.com')
        ]));
    }

    return ctx.reply(`Xush kelibsiz, ${user.name}! 💪 Kunlik ratsioningizni guruhga jo'nating.`, Markup.inlineKeyboard([
        Markup.button.webApp("📊 Jadvalni ko'rish", process.env.WEBAPP_URL || 'https://google.com')
    ]));
});

// ========== Ism va Lokatsiya qabul qilish ==========
bot.on('message', async (ctx, next) => {
    if (ctx.chat.type !== 'private') return next();

    const msg = ctx.message as any;

    // Ism kiritish (reply to force reply)
    if (msg.reply_to_message && msg.text && msg.reply_to_message.text?.includes('ismingizni kiriting')) {
        const telegramId = String(ctx.from.id);

        const existing = await prisma.user.findUnique({ where: { telegramId } });
        if (existing) {
            return ctx.reply("Siz allaqachon ro'yxatdan o'tgansiz!");
        }

        await prisma.user.create({
            data: {
                telegramId,
                name: msg.text,
                timezone: 'Asia/Tashkent'
            }
        });

        return ctx.reply("Rahmat! Endi vaqt mintaqangizni aniqlash uchun joylashuvingizni yuboring 📍", Markup.keyboard([
            Markup.button.locationRequest("📍 Lokatsiya yuborish")
        ]).oneTime().resize());
    }

    // Lokatsiya qabul qilish
    if (msg.location) {
        const telegramId = String(ctx.from.id);
        const user = await prisma.user.findUnique({ where: { telegramId } });
        if (!user) return ctx.reply("Avval /start bosing.");

        const tz = find(msg.location.latitude, msg.location.longitude);
        const timezone = tz.length > 0 ? tz[0] : 'Asia/Tashkent';

        await prisma.user.update({
            where: { telegramId },
            data: {
                latitude: msg.location.latitude,
                longitude: msg.location.longitude,
                timezone
            }
        });

        return ctx.reply(`✅ Ajoyib! Vaqt mintaqangiz: ${timezone}\nEndi guruhga rasm + #nonushta / #abed / #kechki_ovqat deb yuboring.`, Markup.removeKeyboard());
    }

    return next();
});

// ========== Guruhda rasm + hashtag qabul qilish ==========
bot.on('photo', async (ctx) => {
    if (ctx.chat.type === 'private') return;

    const settings = await getSettings();
    if (String(ctx.chat.id) !== settings.groupId) return;

    const caption = (ctx.message.caption || '').toLowerCase();
    if (!caption.includes('#nonushta') && !caption.includes('#abed') && !caption.includes('#kechki_ovqat')) {
        return;
    }

    const user = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
    if (!user) {
        return ctx.reply("Avval botga /start bosib ro'yxatdan o'ting!", { reply_parameters: { message_id: ctx.message.message_id } });
    }

    let mealType = '';
    if (caption.includes('#nonushta')) mealType = 'nonushta';
    else if (caption.includes('#abed')) mealType = 'abed';
    else if (caption.includes('#kechki_ovqat')) mealType = 'kechki_ovqat';

    const localTime = toZonedTime(new Date(), user.timezone);
    const currentDateStr = format(localTime, 'yyyy-MM-dd', { timeZone: user.timezone });

    // Target vaqtni olish
    let targetTimeStr = '';
    if (mealType === 'nonushta') targetTimeStr = settings.breakfastTime;
    if (mealType === 'abed') targetTimeStr = settings.lunchTime;
    if (mealType === 'kechki_ovqat') targetTimeStr = settings.dinnerTime;

    const [tH, tM] = targetTimeStr.split(':').map(Number);
    const targetDate = new Date(localTime);
    targetDate.setHours(tH, tM, 0, 0);

    const diffHours = differenceInHours(localTime, targetDate);

    // 2 soatdan oldin yuborilsa — rad etish
    if (diffHours < -2) {
        return ctx.reply(`⏰ Hali ${mealType} vaqtiga 2 soatdan ko'proq vaqt bor. Biroz kuting!`, { reply_parameters: { message_id: ctx.message.message_id } });
    }

    // Status aniqlash
    let status = 'on_time';
    if (diffHours >= 1) {
        status = 'late';
        await ctx.reply("⚠️ Kechroq jo'natdingiz, Temur hafa bo'ldi 😔", { reply_parameters: { message_id: ctx.message.message_id } });
    } else {
        await ctx.reply("✅ Qabul qilindi! Temur xursand 💪", { reply_parameters: { message_id: ctx.message.message_id } });
    }

    // Bazaga yozish
    await prisma.mealRecord.upsert({
        where: { userId_date_mealType: { userId: user.id, date: currentDateStr, mealType } },
        create: { userId: user.id, date: currentDateStr, mealType, timeSent: new Date(), status },
        update: { timeSent: new Date(), status }
    });

    // Eski eslatmani o'chirish (agar bor bo'lsa)
    try {
        const mention = await prisma.mention.findUnique({
            where: { userId_mealType_date: { userId: user.id, mealType, date: currentDateStr } }
        });
        if (mention) {
            try { await bot.telegram.deleteMessage(settings.groupId!, mention.messageId); } catch (e) {}
            await prisma.mention.delete({ where: { id: mention.id } });
        }
    } catch (e) {}

    // Pinned jadval yangilash
    await updatePinnedTable();
});
