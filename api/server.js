const express = require("express");
const dotenv = require("dotenv");
const path = require("path");
const { Pool } = require("pg");

dotenv.config();

const app = express();

// ✅ para poder recibir JSON en POST
app.use(express.json({ limit: "5mb" }));

// 1) Servir archivos del FRONT (carpeta raíz del proyecto)
const ROOT_DIR = path.join(__dirname, "..");
app.use(express.static(ROOT_DIR));

// 2) Ruta "/" para que NO salga "Cannot GET /"
app.get("/", (_req, res) => {
  res.sendFile(path.join(ROOT_DIR, "forms.html"));
});

// (opcional) CORS - ahora habilitamos POST también
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
// PG ALTAS (docker local)
// =======================
const poolAltas = new Pool({
  host: process.env.ALTAS_PG_HOST,
  port: Number(process.env.ALTAS_PG_PORT || 5432),
  database: process.env.ALTAS_PG_DB,
  user: process.env.ALTAS_PG_USER,
  password: process.env.ALTAS_PG_PASSWORD
});

// =======================
// SCHEMA ALTAS (auto-create)
// =======================
async function ensureAltasSchema() {
  // Creamos lo mínimo para guardar y evitar duplicidad
  await poolAltas.query(`
    create table if not exists material_counter (
      id int primary key default 1,
      last_matnr18 numeric(18,0) not null
    );
  `);

  await poolAltas.query(`
    insert into material_counter (id, last_matnr18)
    values (1, 0)
    on conflict (id) do nothing;
  `);

  await poolAltas.query(`
    create table if not exists alta_items (
      id bigserial primary key,
      lote_id text not null,
      created_at timestamptz not null default now(),

      -- correlativo asignado por sistema
      matnr18 numeric(18,0) not null,

      -- campos principales (ajustá/expandí cuando quieras)
      mtart text not null default 'HAWA',
      matkl text,
      are text,
      maktx text,
      meins text,
      ean11 text,
      taxm1 text,
      bklas text,
      herkl text,
      raube text,
      tempb text,
      ekgrp_p text,
      q_const text,
      grupo_carga_r text,
      factor_s numeric,
      marca_t text,
      fabricante_y text,
      planta text,
      tipo_origen text,
      brt_net text,
      texto_breve text,

      unique(lote_id, matnr18)
    );
  `);

  await poolAltas.query(`
    create table if not exists reg_items (
      id bigserial primary key,
      lote_id text not null,
      created_at timestamptz not null default now(),

      matnr_ext text not null,
      lifnr text not null,
      ekorg text,
      esokz text,
      relif text,
      aplfz text,
      ekgrp text,
      normb text,
      bstae text,
      mwskz text,
      netpr numeric,
      waers text,
      peinh text,
      bprme text,
      bpumn text
    );
  `);

  await poolAltas.query(`
    create table if not exists desc_items (
      id bigserial primary key,
      lote_id text not null,
      created_at timestamptz not null default now(),

      matnr_ext text not null,
      lifnr text not null,
      ekorg text,
      desde text,        -- ddmmyyyy
      descuento int
    );
  `);
}

// =======================
// HELPERS
// =======================
async function getFuenteUltimoMaterial() {
  const sql = `
    SELECT material_id
      FROM staging.dim_hana_materiales dhm
     WHERE CAST(dhm.material_id AS NUMERIC) >= 10000000
       AND substring(dhm.material_id, 1, 4) <> '1100'
  ORDER BY dhm.material_id desc
     LIMIT 1;
  `;

  const r = await poolFuente.query(sql);
  return r.rows?.[0]?.material_id ?? null;
}

// =======================
// ROUTES
// =======================
app.get("/api/health", (_req, res) => res.json({ ok: true }));

/**
 * ✅ Último material seguro:
 * - Primero mira el contador local (docker)
 * - Si está en 0, lo inicializa con la consulta FUENTE (staging)
 */
app.get("/api/ultimo-material", async (_req, res) => {
  try {
    const c = await poolAltas.query(`select last_matnr18 from material_counter where id=1`);
    let last = c.rows?.[0]?.last_matnr18 ?? 0;

    // Si nunca se usó, bootstrap desde fuente
    if (String(last) === "0") {
      const fuente = await getFuenteUltimoMaterial();
      if (fuente) {
        await poolAltas.query(
          `update material_counter set last_matnr18=$1 where id=1`,
          [String(fuente)]
        );
        last = fuente;
      }
    }

    return res.json({ ok: true, material_id: String(last) });
  } catch (e) {
    console.error("PG error ultimo-material:", e);
    return res.status(500).json({ ok: false, error: "Error consultando contador/PG" });
  }
});

/**
 * ✅ Confirmar export (opción simple):
 * - Valida payload
 * - Lock del contador: FOR UPDATE
 * - Asigna rango matnr18 (from..to)
 * - Inserta ALTA/REG/DESC
 */
app.post("/api/confirmar-export", async (req, res) => {
  const client = await poolAltas.connect();
  try {
    const body = req.body || {};
    const items = Array.isArray(body.items) ? body.items : [];

    if (!body.loteId) return res.status(400).json({ ok: false, msg: "loteId requerido" });
    if (!body.grupoCompra) return res.status(400).json({ ok: false, msg: "grupoCompra requerido" });
    if (items.length === 0) return res.status(400).json({ ok: false, msg: "items vacío" });

    await client.query("begin");

    // 🔒 lock correlativo
    const r = await client.query(
      `select last_matnr18 from material_counter where id=1 for update`
    );
    const last = BigInt(r.rows[0].last_matnr18);
    const from = last + 1n;
    const to = last + BigInt(items.length);

    await client.query(
      `update material_counter set last_matnr18=$1 where id=1`,
      [to.toString()]
    );

    // Insert por item, asignando MATNR según el rango
    for (let i = 0; i < items.length; i++) {
      const matnr18 = (from + BigInt(i)).toString();
      const it = items[i] || {};

      // === ALTA ===
      await client.query(
        `insert into alta_items
         (lote_id, matnr18, mtart, matkl, are, maktx, meins, ean11, taxm1, bklas, herkl, raube, tempb,
          ekgrp_p, q_const, grupo_carga_r, factor_s, marca_t, fabricante_y, planta, tipo_origen, brt_net, texto_breve)
         values
         ($1,$2,'HAWA',$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          body.loteId,
          matnr18,
          it.matkl ?? null,
          body.are ?? it.are ?? null,
          it.desc ?? it.maktx ?? null,
          body.meins ?? null,
          it.ean ?? it.ean11 ?? null,
          it.fiscal ?? null,
          it.valor ?? null,
          body.pais ?? null,
          it.almacen ?? null,
          it.temp ?? null,
          body.grupoCompra ?? null,
          body.constQ ?? null,
          it.grupoCarga ?? null,
          it.factor != null ? Number(it.factor) : null,
          it.marca ?? null,
          it.fabricante ?? null,
          it.planta ?? null,
          it.origen ?? null,
          it.brtNet ?? null,
          it.desc ?? it.textoBreve ?? null
        ]
      );

      // === REG ===
      // matnr_ext = sin ceros (numérico)
      const matnrExt = String(Number(matnr18));

      await client.query(
        `insert into reg_items
         (lote_id, matnr_ext, lifnr, ekorg, esokz, relif, aplfz, ekgrp, normb, bstae, mwskz, netpr, waers, peinh, bprme, bpumn)
         values
         ($1,$2,$3,'1000','0','X','3',$4,'1','0004',$5,$6,$7,'1','UN','1')`,
        [
          body.loteId,
          matnrExt,
          it.regProveedor ?? it.lifnr ?? null,
          it.regEkgrp ?? it.ekgrp ?? null,
          it.regMwsKz ?? it.mwskz ?? null,
          it.regNetpr != null ? Number(it.regNetpr) : null,
          it.regWaers ?? it.waers ?? "PYG"
        ]
      );

      // === DESC (opcional) ===
      if (it.descDesde && it.descInt != null) {
        await client.query(
          `insert into desc_items (lote_id, matnr_ext, lifnr, ekorg, desde, descuento)
           values ($1,$2,$3,'1000',$4,$5)`,
          [
            body.loteId,
            matnrExt,
            it.regProveedor ?? it.lifnr ?? null,
            it.descDesde,
            Number(it.descInt)
          ]
        );
      }
    }

    await client.query("commit");
    return res.json({
      ok: true,
      matnr_from18: from.toString(),
      matnr_to18: to.toString()
    });

  } catch (e) {
    try { await client.query("rollback"); } catch {}
    console.error("confirmar-export error:", e);
    return res.status(500).json({ ok: false, msg: "error interno" });
  } finally {
    client.release();
  }
});

// =======================
// START
// =======================
const port = Number(process.env.API_PORT || 5050);

ensureAltasSchema()
  .then(() => {
    app.listen(port, () => console.log(`Front + API: http://127.0.0.1:${port}`));
  })
  .catch((e) => {
    console.error("No se pudo inicializar schema ALTAS:", e);
    process.exit(1);
  });
