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
            include: { mealRecords: true },
            orderBy: { id: 'asc' }
        });
        res.json(users);
    } catch (e) {
        res.status(500).json({ error: 'Server xatosi' });
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
        const { breakfastTime, lunchTime, dinnerTime, reminderInterval } = req.body;
        const s = await prisma.settings.upsert({
            where: { id: 1 },
            update: { breakfastTime, lunchTime, dinnerTime, reminderInterval },
            create: { breakfastTime, lunchTime, dinnerTime, reminderInterval }
        });
        res.json(s);
    } catch (e) {
        res.status(500).json({ error: 'Server xatosi' });
    }
});

// ====== STATIC FILES (React WebApp) ======
const clientDistPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDistPath));
app.get('*', (_req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
});

// ====== BOOTSTRAP ======
async function bootstrap() {
    try {
        await prisma.$connect();
        console.log('✅ Database ulandi');

        // Settings mavjudligini tekshirish
        const s = await prisma.settings.findFirst();
        if (!s) await prisma.settings.create({ data: {} });

        bot.launch()
            .then(() => console.log('🤖 Bot ishga tushdi'))
            .catch(e => console.error('❌ Bot xatosi:', e));

        startScheduler();
        console.log('⏰ Scheduler ishga tushdi');

        const PORT = process.env.PORT || 3000;
        app.listen(Number(PORT), '0.0.0.0', () => {
            console.log(`🚀 Server ${PORT} portda ishlamoqda`);
        });

        process.once('SIGINT', () => bot.stop('SIGINT'));
        process.once('SIGTERM', () => bot.stop('SIGTERM'));
    } catch (e) {
        console.error('❌ Bootstrap xatosi:', e);
        process.exit(1);
    }
}

bootstrap();
