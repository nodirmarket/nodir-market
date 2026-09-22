# NODIR MARKET — to‘liq online do‘kon

## Nimalar bor
- Mijozlar uchun do‘kon: `http://localhost:3000/`
- Admin panel: `http://localhost:3000/admin.html`
- Mahsulot qo‘shish, rasm yuklash, narx o‘zgartirish va o‘chirish
- Buyurtmalarni ko‘rish va statusini almashtirish
- SQLite ma’lumotlar bazasi
- Savat va buyurtma yuborish
- Ixtiyoriy Telegram bot xabarnomasi
- Telefon uchun mos dizayn

## Ishga tushirish
1. Kompyuterga Node.js o‘rnating.
2. Shu papkada terminal oching.
3. `npm install`
4. `.env.example` nusxasini `.env` nomi bilan saqlang.
5. `.env` ichida `ADMIN_PASSWORD` va `SESSION_SECRET` ni o‘zgartiring.
6. `npm start`
7. Brauzerda `http://localhost:3000/` ni oching.
8. Admin: `http://localhost:3000/admin.html`

## Telegram
Bot token va chat ID ni `.env` ichiga kiritsangiz, yangi buyurtma kelganda Telegramga xabar yuboradi.

## Muhim
Bu loyiha real hostingga joylashtirishga tayyor boshlang‘ich versiya. Internetga chiqarishdan oldin kuchli admin paroli, HTTPS va server backupini sozlang. `.env` faylini hech kimga yubormang.
