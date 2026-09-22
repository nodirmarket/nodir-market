const express = require("express");
const session = require("express-session");
const multer = require("multer");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "CHANGE_ME";
const SESSION_SECRET = process.env.SESSION_SECRET || "change-me";

const dataDir = path.join(__dirname, "data");
const uploadDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(dataDir, "nodir-market.db"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  image TEXT,
  description TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  customer_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT DEFAULT '',
  payment TEXT NOT NULL,
  items_json TEXT NOT NULL,
  total REAL NOT NULL,
  status TEXT DEFAULT 'new',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);

const seedCount = db.prepare("SELECT COUNT(*) AS c FROM products").get().c;
if (seedCount === 0) {
  const add = db.prepare("INSERT INTO products (name,category,price,image,description) VALUES (?,?,?,?,?)");
  add.run("Classic Watch", "Soat", 249000, "", "Minimal premium soat.");
  add.run("Royal Ring", "Uzuk", 149000, "", "Klassik dizayn.");
  add.run("Gold Bracelet", "Bilaguzuk", 129000, "", "Kundalik uslub uchun.");
  add.run("Silver Chain", "Zanjir", 179000, "", "Yengil va zamonaviy.");
}

app.use(express.json({limit:"2mb"}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", maxAge: 1000*60*60*8 }
}));
app.use(express.static(path.join(__dirname, "public")));

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, Date.now() + "-" + Math.random().toString(36).slice(2,9) + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) cb(null, true);
    else cb(new Error("Faqat JPG, PNG, WEBP yoki GIF rasm yuklang."));
  }
});

function adminOnly(req,res,next){
  if (!req.session.admin) return res.status(401).json({error:"Admin login kerak."});
  next();
}

app.get("/api/products", (req,res) => {
  res.json(db.prepare("SELECT * FROM products ORDER BY id DESC").all());
});

app.post("/api/login", (req,res) => {
  const {username,password} = req.body;
  if (username === ADMIN_USER && password === ADMIN_PASSWORD) {
    req.session.admin = true;
    return res.json({ok:true});
  }
  res.status(401).json({error:"Login yoki parol noto'g'ri."});
});

app.post("/api/logout", (req,res) => {
  req.session.destroy(() => res.json({ok:true}));
});

app.get("/api/me", (req,res) => res.json({admin:!!req.session.admin}));

app.post("/api/products", adminOnly, upload.single("image"), (req,res) => {
  const {name,category,price,description=""} = req.body;
  if (!name || !category || !price) return res.status(400).json({error:"Nom, kategoriya va narx kerak."});
  const image = req.file ? "/uploads/" + req.file.filename : "";
  const result = db.prepare(
    "INSERT INTO products (name,category,price,image,description) VALUES (?,?,?,?,?)"
  ).run(name, category, Number(price), image, description);
  res.json(db.prepare("SELECT * FROM products WHERE id=?").get(result.lastInsertRowid));
});

app.put("/api/products/:id", adminOnly, upload.single("image"), (req,res) => {
  const old = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
  if (!old) return res.status(404).json({error:"Mahsulot topilmadi."});
  const {name,category,price,description=""} = req.body;
  const image = req.file ? "/uploads/" + req.file.filename : old.image;
  db.prepare("UPDATE products SET name=?,category=?,price=?,image=?,description=? WHERE id=?")
    .run(name,category,Number(price),image,description,req.params.id);
  res.json(db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id));
});

app.delete("/api/products/:id", adminOnly, (req,res) => {
  const p = db.prepare("SELECT * FROM products WHERE id=?").get(req.params.id);
  if (!p) return res.status(404).json({error:"Mahsulot topilmadi."});
  db.prepare("DELETE FROM products WHERE id=?").run(req.params.id);
  if (p.image && p.image.startsWith("/uploads/")) {
    const f = path.join(__dirname, "public", p.image);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }
  res.json({ok:true});
});

app.get("/api/orders", adminOnly, (req,res) => {
  res.json(db.prepare("SELECT * FROM orders ORDER BY id DESC").all());
});

app.post("/api/orders", async (req,res) => {
  const {customer_name,phone,address="",payment,items=[]} = req.body;
  if (!customer_name || !phone || !payment || !Array.isArray(items) || !items.length)
    return res.status(400).json({error:"Buyurtma ma'lumotlari to'liq emas."});

  let total = 0;
  const normalized = [];
  for (const item of items) {
    const p = db.prepare("SELECT id,name,price FROM products WHERE id=?").get(item.id);
    if (!p) continue;
    const qty = Math.max(1, Math.min(99, Number(item.qty)||1));
    total += p.price * qty;
    normalized.push({id:p.id,name:p.name,price:p.price,qty});
  }
  if (!normalized.length) return res.status(400).json({error:"Mahsulot topilmadi."});

  const result = db.prepare(
    "INSERT INTO orders (customer_name,phone,address,payment,items_json,total) VALUES (?,?,?,?,?,?)"
  ).run(customer_name,phone,address,payment,JSON.stringify(normalized),total);

  // Telegram integration is optional. Fill TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in .env.
  if (process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_CHAT_ID) {
    try {
      const text =
        `🛍 NODIR MARKET\\n\\n` +
        `Yangi buyurtma #${result.lastInsertRowid}\\n` +
        `Mijoz: ${customer_name}\\nTelefon: ${phone}\\nManzil: ${address || "-"}\\n` +
        `To'lov: ${payment}\\nJami: ${total.toLocaleString("uz-UZ")} so'm\\n\\n` +
        normalized.map(x => `• ${x.name} x${x.qty}`).join("\\n");
      await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({chat_id:process.env.TELEGRAM_CHAT_ID,text})
      });
    } catch(e) { console.error("Telegram:", e.message); }
  }
  res.json({ok:true,orderId:result.lastInsertRowid});
});

app.patch("/api/orders/:id", adminOnly, (req,res) => {
  const allowed = ["new","confirmed","sent","completed","cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({error:"Status noto'g'ri."});
  db.prepare("UPDATE orders SET status=? WHERE id=?").run(req.body.status,req.params.id);
  res.json({ok:true});
});

app.use((err,req,res,next) => {
  res.status(400).json({error:err.message || "Xatolik"});
});

app.listen(PORT, () => console.log(`NODIR MARKET: http://localhost:${PORT}`));
