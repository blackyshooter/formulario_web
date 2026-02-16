const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const { Pool } = require("pg");

dotenv.config();

const app = express();
app.use(express.json({ limit: "5mb" }));

// 1) Servir archivos del FRONT (carpeta raíz del proyecto)
const ROOT_DIR = path.join(__dirname, "..");
app.use(express.static(ROOT_DIR));

// 2) Ruta "/" para que NO salga "Cannot GET /"
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "forms.html"));
});

// 3) CORS (GET/POST/OPTIONS)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// =======================
// PG FUENTE (tu staging)
// =======================
const poolFuente = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

// =======================
// HELPERS
// =======================
async function getFuenteUltimoMaterialNum() {
  // ✅ Query exacto que vos definiste
  const sql = `
    SELECT material_id
      FROM staging.dim_hana_materiales dhm
     WHERE CAST(dhm.material_id AS NUMERIC) >= 10000000
       AND substring(dhm.material_id::text, 1, 4) <> '1100'
     ORDER BY CAST(dhm.material_id AS NUMERIC) DESC
     LIMIT 1;
  `;

  const r = await poolFuente.query(sql);
  const raw = r.rows?.[0]?.material_id;
  if (raw == null) return null;

  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  // BigInt para evitar pérdida de precisión
  return BigInt(digits);
}

function pad18(n) {
  const s = String(n).replace(/\D/g, "");
  return s.length >= 18 ? s.slice(-18) : "0".repeat(18 - s.length) + s;
}

// =======================
// ROUTES
// =======================
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ✅ Último material SOLO desde staging (sin material_counter)
app.get("/api/ultimo-material", async (_req, res) => {
  try {
    const fuenteNum = await getFuenteUltimoMaterialNum();
    if (fuenteNum == null) {
      return res.status(404).json({ ok: false, msg: "No se encontró último material en staging" });
    }

    return res.json({
      ok: true,
      material_id: fuenteNum.toString(),
      material_id_18: pad18(fuenteNum.toString())
    });
  } catch (e) {
    console.error("❌ /api/ultimo-material", e);
    return res.status(500).json({ ok: false, msg: "Error leyendo último material" });
  }
});

// =======================
// START
// =======================
const port = Number(process.env.API_PORT || 5050);

app.listen(port, () => {
  console.log(`Front + API: http://127.0.0.1:${port}`);
});
