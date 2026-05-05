import express from 'express';
import cors from 'cors';
import path from 'path';
import { bot } from './bot';
import { startScheduler } from './scheduler';
import { prisma } from './db';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// ====== API ROUTES ======

// Barcha userlar va bugungi ovqat hisobotlari
app.get('/api/users', async (_req, res) => {
    try {
        const users = await prisma.user.findMany({
            include: { mealRecords: true, reminderOverrides: true },
            orderBy: { id: 'asc' }
        });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Ma'lum sana bo'yicha userlar va ularning ovqat hisobotlari
app.get('/api/users-by-date/:date', async (req, res) => {
    try {
        const dateStr = req.params.date; // format: yyyy-MM-dd
        const users = await prisma.user.findMany({
            include: {
                mealRecords: { where: { date: dateStr } },
                reminderOverrides: true
            },
            orderBy: { id: 'asc' }
        });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Admin tekshirish
app.get('/api/check-admin/:telegramId', async (req, res) => {
    try {
        const telegramId = req.params.telegramId;

        // 1) Railway'da ADMIN_IDS=123456,789012 shaklida qo'yilgan bo'lsa
        const envAdmins = (process.env.ADMIN_IDS || '').split(',').map(s => s.trim()).filter(Boolean);
        if (envAdmins.includes(telegramId)) {
            return res.json({ isAdmin: true });
        }

        // 2) Bazada role=admin bo'lsa
        const user = await prisma.user.findUnique({
            where: { telegramId }
        });
        res.json({ isAdmin: user?.role === 'admin' });
    } catch (e) {
        res.status(500).json({ isAdmin: false });
    }
});

// Sozlamalarni olish
app.get('/api/settings', async (_req, res) => {
    try {
        let s = await prisma.settings.findFirst();
        if (!s) s = await prisma.settings.create({ data: {} });
        res.json(s);
    } catch (e) {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Sozlamalarni saqlash
app.post('/api/settings', async (req, res) => {
    try {
        const { 
            breakfastTime, lunchTime, dinnerTime, reminderInterval, 
            breakfastWords, lunchWords, dinnerWords, maxReminders
        } = req.body;
        
        const s = await prisma.settings.upsert({
            where: { id: 1 },
            update: { 
                breakfastTime, lunchTime, dinnerTime, reminderInterval, 
                breakfastWords, lunchWords, dinnerWords, maxReminders 
            },
            create: { 
                breakfastTime, lunchTime, dinnerTime, reminderInterval, 
                breakfastWords, lunchWords, dinnerWords, maxReminders 
            }
        });
        res.json(s);
    } catch (e) {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// Eslatma yoqish/o'chirish (toggle)
app.post('/api/reminder-overrides', async (req, res) => {
    try {
        const { userId, mealType, muted } = req.body;
        
        if (muted) {
            // Eslatmani o'chirish (mute qilish)
            const override = await prisma.reminderOverride.upsert({
                where: { userId_mealType: { userId, mealType } },
                create: { userId, mealType, muted: true },
                update: { muted: true }
            });
            res.json(override);
        } else {
            // Eslatmani yoqish (unmute) — bazadan o'chirish
            await prisma.reminderOverride.deleteMany({
                where: { userId, mealType }
            });
            res.json({ success: true });
        }
    } catch (e) {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// ====== STATIC FILES (React WebApp) ======
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));
app.get('/{*path}', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ====== BOT LAUNCH WITH RETRY ======
async function launchBotWithRetry(maxRetries = 5, delayMs = 3000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await bot.telegram.deleteWebhook({ drop_pending_updates: true });
            await bot.launch({ dropPendingUpdates: true });
            console.log(`🤖 Bot ishga tushdi (urinish: ${attempt})`);
            return;
        } catch (e: any) {
            const is409 = e?.response?.error_code === 409;
            if (is409 && attempt < maxRetries) {
                console.log(`⏳ Bot conflict (409), ${delayMs / 1000}s kutilmoqda... (${attempt}/${maxRetries})`);
                await new Promise(r => setTimeout(r, delayMs));
            } else {
                console.error('❌ Bot ishga tushmadi:', e);
                return;
            }
        }
    }
}

// ====== BOOTSTRAP ======
async function bootstrap() {
    try {
        await prisma.$connect();
        console.log('✅ Database ulandi');

        // Settings mavjudligini tekshirish
        const s = await prisma.settings.findFirst();
        if (!s) await prisma.settings.create({ data: {} });

        // Eski konteyner to'xtashini kutish
        console.log('⏳ Eski instance to'xtashini kutish (5s)...');
        await new Promise(r => setTimeout(r, 5000));

        // Bot'ni retry bilan ishga tushirish
        launchBotWithRetry();

        startScheduler();
        console.log('⏰ Scheduler ishga tushdi');

        const PORT = process.env.PORT || 3000;
        app.listen(Number(PORT), '0.0.0.0', () => {
            console.log(`🚀 Server ${PORT} portda ishlamoqda`);
        });

        // Graceful shutdown — bot va database to'g'ri yopiladi
        const shutdown = async (signal: string) => {
            console.log(`\n⏹ ${signal} qabul qilindi, yopilmoqda...`);
            bot.stop(signal);
            await prisma.$disconnect();
            process.exit(0);
        };
        process.once('SIGINT', () => shutdown('SIGINT'));
        process.once('SIGTERM', () => shutdown('SIGTERM'));
    } catch (e) {
        console.error('❌ Bootstrap xatosi:', e);
        process.exit(1);
    }
}

bootstrap();

