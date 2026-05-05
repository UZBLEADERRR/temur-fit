import { Telegraf, Markup } from 'telegraf';
import { prisma } from './db';
import { find } from 'geo-tz';
import { format, toZonedTime } from 'date-fns-tz';
import { differenceInHours, subDays } from 'date-fns';
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

// Userning mahalliy vaqtida bugungi sana
function getUserTodayDateStr(timezone: string): string {
    const localTime = toZonedTime(new Date(), timezone);
    return format(localTime, 'yyyy-MM-dd', { timeZone: timezone });
}

// Userning mahalliy vaqtidagi daqiqalar (0-1439)
function getUserLocalMinutes(timezone: string): number {
    const localTime = toZonedTime(new Date(), timezone);
    return localTime.getHours() * 60 + localTime.getMinutes();
}

async function updatePinnedTable() {
    const settings = await getSettings();
    const groupId = process.env.ALLOWED_GROUP_ID || settings.groupId;
    if (!groupId || !settings.pinnedMessageId) return;

    // Jadval uchun O'zbekiston vaqti bo'yicha sana
    const dateStr = getUserTodayDateStr('Asia/Tashkent');

    const usersRaw = await prisma.user.findMany({ orderBy: { id: 'asc' } });
    if (usersRaw.length === 0) return;

    // Har bir user uchun o'z timezone'idagi bugungi meal record'larini olish
    const users = await Promise.all(
        usersRaw.map(async (user) => {
            const userDate = getUserTodayDateStr(user.timezone);
            const mealRecords = await prisma.mealRecord.findMany({
                where: { userId: user.id, date: userDate }
            });
            return { ...user, mealRecords };
        })
    );

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
            groupId,
            settings.pinnedMessageId,
            undefined,
            table,
            {
                reply_markup: {
                    inline_keyboard: [[
                        { text: "📊 Jadvalni ko'rish", url: process.env.WEBAPP_URL || 'https://google.com' }
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

    ctx.reply("✅ Ushbu guruh asosiy guruh sifatida belgilandi! Endi userlar botga /start bosib ro'yxatdan o'tishi mumkin. Agar Railway'da ALLOWED_GROUP_ID bo'lsa, o'sha prioritetga ega bo'ladi.");
});

// ========== /start — Ro'yxatdan o'tish ==========
bot.start(async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const telegramId = String(ctx.from.id);
    const settings = await getSettings();
    const groupId = process.env.ALLOWED_GROUP_ID || settings.groupId;

    // Admin tekshiruvi — guruh a'zosi bo'lmasa ham kirishi mumkin
    const envAdmins = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
    const existingUser = await prisma.user.findUnique({ where: { telegramId } });
    const isAdmin = existingUser?.role === 'admin' || envAdmins.includes(telegramId);

    if (isAdmin) {
        // Admin bazada yo'q bo'lsa, yaratamiz
        if (!existingUser) {
            await prisma.user.create({
                data: { telegramId, name: ctx.from.first_name || 'Admin', role: 'admin', timezone: 'Asia/Tashkent' }
            });
        }
        return ctx.reply(`Xush kelibsiz, ${existingUser?.name || ctx.from.first_name}! 🏋️`, Markup.inlineKeyboard([
            Markup.button.webApp("⚙️ Boshqaruv Paneli", process.env.WEBAPP_URL || 'https://google.com')
        ]));
    }

    // Oddiy userlar uchun guruh tekshiruvi
    if (!groupId) {
        return ctx.reply("⚠️ Hali guruh sozlanmagan. Admin guruhga botni qo'shib /setgroup bosishi yoki Railway'da ALLOWED_GROUP_ID kiritishi kerak.");
    }

    const inGroup = await isUserInGroup(ctx.from.id, groupId);
    if (!inGroup) {
        return ctx.reply("❌ Kechirasiz, siz Temur.fit guruhining a'zosi emassiz!");
    }

    if (!existingUser) {
        return ctx.reply("Assalomu alaykum! Iltimos, ismingizni kiriting:", Markup.forceReply());
    }

    return ctx.reply(`Xush kelibsiz, ${existingUser.name}! 💪 Kunlik ratsioningizni guruhga jo'nating.`, Markup.inlineKeyboard([
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
                timezone: 'Asia/Seoul'
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
        const timezone = tz.length > 0 ? tz[0] : 'Asia/Seoul';

        await prisma.user.update({
            where: { telegramId },
            data: {
                latitude: msg.location.latitude,
                longitude: msg.location.longitude,
                timezone
            }
        });

        return ctx.reply(`✅ Ajoyib! Vaqt mintaqangiz: ${timezone}\nEndi guruhga ratsioningizni jo'nating.`, Markup.removeKeyboard());
    }

    return next();
});

// ========== Guruhda rasm + hashtag qabul qilish ==========
bot.on('photo', async (ctx) => {
    if (ctx.chat.type === 'private') return;

    const settings = await getSettings();
    const groupId = process.env.ALLOWED_GROUP_ID || settings.groupId;
    
    if (String(ctx.chat.id) !== groupId) return;

    const caption = (ctx.message.caption || '').toLowerCase();
    
    // So'zlarni parchalab olish funksiyasi
    const parseWords = (text: string) => text.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
    
    const bWords = parseWords(settings.breakfastWords);
    const lWords = parseWords(settings.lunchWords);
    const dWords = parseWords(settings.dinnerWords);

    let mealType = '';
    if (bWords.some(w => caption.includes(w))) mealType = 'nonushta';
    else if (lWords.some(w => caption.includes(w))) mealType = 'abed';
    else if (dWords.some(w => caption.includes(w))) mealType = 'kechki_ovqat';

    if (!mealType) return; // Agar birorta ham tasdiqlangan so'z kiritilmagan bo'lsa, reaksya yo'q.

    const user = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
    if (!user) {
        return ctx.reply("Avval botga /start bosib ro'yxatdan o'ting!", { reply_parameters: { message_id: ctx.message.message_id } });
    }

    // Userning o'z timezone'ida sana va vaqt
    const userTimezone = user.timezone || 'Asia/Tashkent';
    let currentDateStr = getUserTodayDateStr(userTimezone);
    const mCurrent = getUserLocalMinutes(userTimezone);

    // Target vaqtni olish
    let targetTimeStr = '';
    if (mealType === 'nonushta') targetTimeStr = settings.breakfastTime; 
    else if (mealType === 'abed') targetTimeStr = settings.lunchTime; 
    else if (mealType === 'kechki_ovqat') targetTimeStr = settings.dinnerTime; 

    const [tH, tM] = targetTimeStr.split(':').map(Number);
    const mTarget = tH * 60 + tM;

    // Kechki ovqatni tunda (00:00 dan nonushta vaqtigacha) jo'natsa — kechagi kunga yozish
    const [bH, bM] = settings.breakfastTime.split(':').map(Number);
    const mBreakfast = bH * 60 + bM;

    let status = 'on_time';
    if (mealType === 'kechki_ovqat' && mCurrent < mBreakfast) {
        // Tunda jo'natilgan — kechagi kechki ovqat
        const yesterday = subDays(toZonedTime(new Date(), userTimezone), 1);
        currentDateStr = format(yesterday, 'yyyy-MM-dd', { timeZone: userTimezone });
        status = 'late';
    } else if (mCurrent > mTarget + 60) {
        status = 'late';
    }
    
    await ctx.reply("✅ Qabul qilindi! 💪", { reply_parameters: { message_id: ctx.message.message_id } });

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
            try { await bot.telegram.deleteMessage(groupId!, mention.messageId); } catch (e) {}
            await prisma.mention.delete({ where: { id: mention.id } });
        }
    } catch (e) {}

    // Pinned jadval yangilash
    await updatePinnedTable();
});
