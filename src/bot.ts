import { Telegraf, Context, Markup } from 'telegraf';
import { prisma } from './db';
import { find } from 'geo-tz';
import { format, toZonedTime } from 'date-fns-tz';
import { differenceInHours } from 'date-fns';

const botToken = process.env.BOT_TOKEN;
if (!botToken) throw new Error("BOT_TOKEN is missing");
export const bot = new Telegraf(botToken);

const getSettings = async () => {
    let settings = await prisma.settings.findFirst();
    if (!settings) {
        settings = await prisma.settings.create({ data: {} });
    }
    return settings;
};

// Check if user is in the configured group
async function isUserInGroup(ctx: Context, userId: number, groupId: string) {
    try {
        const member = await ctx.telegram.getChatMember(groupId, userId);
        return ['creator', 'administrator', 'member', 'restricted'].includes(member.status);
    } catch (e) {
        return false;
    }
}

bot.command('setgroup', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    
    const user = await prisma.user.findUnique({ where: { telegramId: String(ctx.from?.id) } });
    if (!user || user.role !== 'admin') {
        return ctx.reply("Sizda ushbu burug'ni bajarish uchun ruxsat yo'q.");
    }

    const groupId = String(ctx.chat.id);
    await prisma.settings.update({
        where: { id: 1 },
        data: { groupId }
    });
    ctx.reply("Ushbu guruh asosiy guruh sifatida belgilandi!");
});

bot.start(async (ctx) => {
    if (ctx.chat.type !== 'private') return;

    const telegramId = String(ctx.from?.id);
    const settings = await getSettings();

    if (!settings.groupId) {
        return ctx.reply("Hali guruh sozlanmagan. Admin guruhda /setgroup bosishi kerak.");
    }

    const inGroup = await isUserInGroup(ctx, ctx.from.id, settings.groupId);
    if (!inGroup) {
        return ctx.reply("Kechirasiz, siz bizning maxsus guruhimiz a'zosi emassiz!");
    }

    let user = await prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
        // Register flow
        return ctx.reply("Iltimos, ismingizni kiriting:", Markup.forceReply());
    }

    if (user.role === 'admin') {
        return ctx.reply("Xush kelibsiz Admin!", Markup.inlineKeyboard([
            Markup.button.webApp("Boshqaruv Paneli", process.env.WEBAPP_URL || "https://google.com")
        ]));
    } else {
        return ctx.reply(`Xush kelibsiz, ${user.name}! Kunlik ratsioningizni guruhga tashlashni unutmang. Jadvalni ko'rish uchun`, Markup.inlineKeyboard([
            Markup.button.webApp("Jadvalni ko'rish", process.env.WEBAPP_URL || "https://google.com")
        ]));
    }
});

bot.on('message', async (ctx, next) => {
    // Handling Name Input and Location Input
    if (ctx.chat.type === 'private') {
        const msg = ctx.message as any;
        if (msg.reply_to_message && msg.reply_to_message.text === "Iltimos, ismingizni kiriting:") {
            await prisma.user.create({
                data: {
                    telegramId: String(ctx.from.id),
                    name: msg.text,
                    timezone: 'Asia/Tashkent'
                }
            });
            return ctx.reply("Rahmat! Endi vaqt mintaqangizni aniqlash uchun joylashuvingizni yuboring:", Markup.keyboard([
                Markup.button.locationRequest("📍 Lokatsiya yuborish")
            ]).oneTime().resize());
        } else if ('location' in msg) {
            const user = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
            if (user) {
                const tz = find(msg.location.latitude, msg.location.longitude);
                await prisma.user.update({
                    where: { telegramId: String(ctx.from.id) },
                    data: {
                        latitude: msg.location.latitude,
                        longitude: msg.location.longitude,
                        timezone: tz.length > 0 ? tz[0] : 'Asia/Tashkent'
                    }
                });
                return ctx.reply("Ajoyib! Mintaqa sozlandi. Endi guruhda ishtirok etishingiz mumkin.", Markup.removeKeyboard());
            }
        }
    }
    return next();
});

// Group Message Listener for Photos
bot.on('photo', async (ctx) => {
    if (ctx.chat.type === 'private') return;
    
    const settings = await getSettings();
    if (String(ctx.chat.id) !== settings.groupId) return;

    const caption = ctx.message.caption?.toLowerCase() || '';
    if (!caption.includes('#nonushta') && !caption.includes('#abed') && !caption.includes('#kechki_ovqat')) {
        return;
    }

    const user = await prisma.user.findUnique({ where: { telegramId: String(ctx.from.id) } });
    if (!user) return;

    let mealType = '';
    if (caption.includes('#nonushta')) mealType = 'nonushta';
    else if (caption.includes('#abed')) mealType = 'abed';
    else if (caption.includes('#kechki_ovqat')) mealType = 'kechki_ovqat';

    const localTime = toZonedTime(new Date(), user.timezone);
    const currentDateStr = format(localTime, 'yyyy-MM-dd', { timeZone: user.timezone });
    
    let targetTimeStr = '';
    if (mealType === 'nonushta') targetTimeStr = settings.breakfastTime;
    if (mealType === 'abed') targetTimeStr = settings.lunchTime;
    if (mealType === 'kechki_ovqat') targetTimeStr = settings.dinnerTime;

    const [tH, tM] = targetTimeStr.split(':').map(Number);
    const targetDate = new Date(localTime);
    targetDate.setHours(tH, tM, 0, 0);

    const diffHours = differenceInHours(localTime, targetDate);

    if (diffHours < -2) {
         await ctx.reply(`Hali ${mealType} vaqtiga ertaroq, 2 soatgacha vaqt qolganda yuboring.`, { reply_parameters: { message_id: ctx.message.message_id } });
         return;
    }

    let status = 'on_time';
    if (diffHours >= 1) { // 1 hour late
        status = 'late';
        await ctx.reply("Kechroq jo'natdingiz Temur hafa bo'ldi.", { reply_parameters: { message_id: ctx.message.message_id } });
    } else {
        await ctx.reply("Qabul qilindi! Temur xursand.", { reply_parameters: { message_id: ctx.message.message_id } });
    }

    await prisma.mealRecord.upsert({
        where: {
            userId_date_mealType: {
                 userId: user.id,
                 date: currentDateStr,
                 mealType
            }
        },
        create: {
            userId: user.id,
            date: currentDateStr,
            mealType,
            timeSent: new Date(),
            status
        },
        update: {
            timeSent: new Date(),
            status
        }
    });

    // We will update the pinned message later (handled via Cron or immediately)
});
