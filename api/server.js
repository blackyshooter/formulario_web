const express = require("express");
const dotenv = require("dotenv");
const { Pool } = require("pg");

dotenv.config();

const app = express();

// CORS simple para Live Server (5500)
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*"); // si querés, lo hacemos más estricto
  res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.get("/api/ultimo-material", async (_req, res) => {
  const sql = `
    SELECT material_id
      FROM staging.dim_hana_materiales dhm
     WHERE CAST(dhm.material_id AS NUMERIC) >= 10000000
       AND substring(dhm.material_id, 1, 4) <> '1100'
  ORDER BY dhm.material_id desc
     LIMIT 1;
  `;

  try {
    const r = await pool.query(sql);
    const materialId = r.rows?.[0]?.material_id ?? null;
    return res.json({ ok: true, material_id: materialId });
  } catch (e) {
    console.error("PG error:", e);
    return res.status(500).json({ ok: false, error: "Error consultando PostgreSQL" });
  }
});

const port = Number(process.env.API_PORT || 5050);
app.listen(port, () => console.log(`API lista: http://127.0.0.1:${port}`));