# 💪 Temur.fit SAAS

Ko'p-tenantli (multi-tenant) sport ratsion nazorat platformasi.

Avvalgi `temur-fit` har bir guruh uchun alohida loyiha deploy qilishni talab qilardi.
**Temur.fit SAAS** esa bitta deploy bilan cheksiz guruhni boshqaradi: super-admin panel
orqali yangi bot (token) + guruh qo'shiladi va u darhol eski botning barcha vazifalarini
bajara boshlaydi. Klonlash bir necha soniyada.

> Eski bir-guruhli `temur-fit` `master` branchda o'zgarishsiz ishlab turaveradi.
> Ushbu SAAS versiyasi alohida branch / repo va alohida baza talab qiladi.

---

## 🧩 Arxitektura

| Komponent | Vazifasi |
|-----------|----------|
| **Master bot** (`MASTER_BOT_TOKEN`) | Super-admin (`1669809576`) bilan ishlaydi. `/start` → super panelni ochuvchi tugma. |
| **Super Admin Panel** (`?super=1`) | Botlarni boshqarish: yangi bot qo'shish (token + guruh id), faollik, o'chirish. |
| **Tenant botlar** | Har bir qo'shilgan bot — alohida guruhni boshqaradi. Eski temur-fit logikasi (ro'yxat, ovqat rasmlari, eslatma, pin jadval). |
| **Tenant Panel** (`?tid=<id>`) | Har guruh admini uchun jadval / eslatma / sozlamalar (eski WebApp). |
| **BotManager** | Tenant botlarni dinamik ishga tushiradi / to'xtatadi. |
| **Scheduler** | Har daqiqada barcha tenantlar bo'yicha eslatma; 06:00 (Toshkent) yangi kunlik jadval. |

Hammasi **bitta Node jarayonida** ishlaydi — har tenant bot alohida long-polling instansiyasi.

---

## 🗄 Ma'lumotlar modeli

Barcha ma'lumot `Tenant` bo'yicha ajratilgan:

- `Tenant` — bot tokeni, guruh id, nom, faollik
- `User` — `@@unique([tenantId, telegramId])`
- `Settings` — har tenantga bitta (ovqat vaqtlari, kalit so'zlar, eslatma)
- `MealRecord`, `Mention`, `ReminderOverride` — `User` orqali tenantga bog'langan

Tenant o'chirilsa, unga tegishli hamma narsa kaskad o'chadi.

---

## 🔐 Xavfsizlik

Super-admin va tenant-admin amallari Telegram WebApp **`initData`** HMAC imzosi
orqali server tomonda tekshiriladi (`src/telegramAuth.ts`):

- Super endpointlar — `MASTER_BOT_TOKEN` bilan tekshiriladi va `user.id === SUPER_ADMIN_ID` bo'lishi shart.
- Tenant mutatsiyalari (sozlama saqlash, eslatma) — o'sha tenant bot tokeni bilan tekshiriladi va foydalanuvchi guruh admini bo'lishi shart.

---

## 🚀 Ishga tushirish

### 1. Muhit o'zgaruvchilari

`.env.example` dan nusxa oling:

```bash
cp .env.example .env
```

| O'zgaruvchi | Tavsif |
|-------------|--------|
| `DATABASE_URL` | **Yangi** PostgreSQL bazasi (eski temur-fit bazasidan alohida) |
| `MASTER_BOT_TOKEN` | Super-admin boshqaruv boti tokeni |
| `SUPER_ADMIN_ID` | Super-admin Telegram ID (default `1669809576`) |
| `WEBAPP_URL` | Ushbu deploydagi ochiq HTTPS URL |

### 2. Lokal ishga tushirish

```bash
docker compose up -d        # postgres
npm install                 # postinstall: prisma generate
npm run start               # prisma db push + serverni ishga tushiradi
```

### 3. Foydalanish oqimi

1. Super-admin master botga `/start` bosadi → **🚀 Super Admin Panel** tugmasi.
2. Panelda **+ Yangi bot**: nom, bot token (majburiy), guruh id (ixtiyoriy) kiritiladi.
3. Bot darhol ishga tushadi. Token noto'g'ri bo'lsa qabul qilinmaydi.
4. Yangi botni guruhga admin qilib qo'shing va guruhda **/setgroup** bosing
   (yoki guruh id ni panelda qo'lda kiriting). `/id` buyrug'i guruh id sini ko'rsatadi.
5. A'zolar botga `/start` → ism + lokatsiya → guruhga ovqat rasmlarini hashtag bilan yuboradi.

Har bir guruh uchun yangi bot qo'shish — yuqoridagi 2-4 qadamlarni takrorlash, xolos.

---

## ⚙️ Deploy (Railway)

- `railway.json` NIXPACKS bilan sozlangan; `npm run start` ishlaydi.
- Yangi (bo'sh) PostgreSQL ulang va yuqoridagi env larni bering.
- `WEBAPP_URL` ni Railway bergan HTTPS domeniga tenglashtiring.

---

## 📦 Alohida `temur-fitSAAS` repo sifatida chiqarish

Ushbu kod `temur-fit` reposining `claude/temur-fit-saas-platform-*` branchida.
Uni mustaqil repo qilish uchun:

```bash
# yangi bo'sh repo yarating (GitHub UI yoki gh CLI), so'ng:
git clone --single-branch -b claude/temur-fit-saas-platform-n04hxc <eski-repo-url> temur-fitSAAS
cd temur-fitSAAS
git remote set-url origin <yangi-temur-fitSAAS-repo-url>
git push -u origin HEAD:main
```

Eski `temur-fit` repo va uning `master` branchi o'zgarishsiz qoladi.
