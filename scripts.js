
/* ===========================
   Alta Materiales - Frontend
   - Pegado desde Excel
   - Validación
   - Export: ALTA/REG/DESC/PVP (PVP en XLSX)
===========================*/

const $ = (id) => document.getElementById(id);

const CONSTS = {
  MTART: "HAWA",
  ARE: "GAR",
  MEINS: "EA",
  TIPO_EAN: "HE",
  PAIS: "PY",
  GRUPO_CARGA: "0001",
  ORG_COMPRAS: "1000",
  CENTRO: "1000",
  PLANTA: "1000",
  WAERS: "PYG",
  ZFLAG: "Z",
  ZSDCPF_OBLIG: true,
};

let items = []; // cada item es objeto con campos internos (los que exportamos)
let nextLocalId = 1;
let validatedOk = false; // ✅ Variable para controlar validación
let lastSapMatnr18Fetched = ''; // ✅ Variable para almacenar último material fetched

function todayDDMMYYYY(){
  const d = new Date();
  const dd = String(d.getDate()).padStart(2,"0");
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const yyyy = String(d.getFullYear());
  return `${dd}${mm}${yyyy}`;
}

function normalizeName(s){
  return (s||"").trim().toUpperCase().replace(/\s+/g,"_").replace(/[^A-Z0-9_]/g,"");
}

function setStatus(msg, kind="muted"){
  const el = $("status");
  el.textContent = msg;
  el.className = "statusBar " + (kind || "muted");
}

function setDirty(){
  validatedOk = false;
  const btn = document.getElementById('btnExportar');
  if(btn) btn.disabled = true;
}

function showErrors(list){
  const p = $("errorsPanel");
  if(!list || !list.length){
    p.style.display="none";
    p.innerHTML="";
    return;
  }
  p.style.display="block";
  p.innerHTML = list.map(e => `<div class="errLine">• ${escapeHtml(e)}</div>`).join("");
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

/* ===========================
   UI init
===========================*/
(function init(){
  const t = todayDDMMYYYY();
  $("fecha").value = t;
  $("todayPill").textContent = t;
  // "Último material SAP" se completa desde backend (o manual). No usamos localStorage para evitar arranques incorrectos.
  setStatus("Estado: esperando validación...", "muted");
  renderItems();

  // Trae el último material desde backend (si está disponible)
  attemptFetchUltimoMatnr();

  // ✅ Event listeners corregidos
  document.getElementById('comprador').addEventListener('input', setDirty);
  document.getElementById('fecha').addEventListener('input', setDirty);
  document.getElementById('ultimoMatnr').addEventListener('input', ()=>{
    lastSapMatnr18Fetched = ''; // Limpiar el fetch si el usuario edita manualmente
    setDirty();
  });
})();
/* ===========================
   Modal pegar
===========================*/
function openPasteModal(){
  $("pasteModal").setAttribute("aria-hidden","false");
  $("pasteArea").value = "";
  setTimeout(()=> $("pasteArea").focus(), 50);
}
function closePasteModal(){
  $("pasteModal").setAttribute("aria-hidden","true");
}

function processPaste(){
  const raw = ($("pasteArea").value || "").trim();
  if(!raw){
    alert("Pegá al menos una fila.");
    return;
  }

  const lines = raw.split(/\r?\n/).filter(l => l.trim().length>0);
  const added = [];
  for(const line of lines){
    // Prefer TAB, pero si es CSV intentamos ;
    const cols = line.includes("\t") ? line.split("\t") : (line.includes(";") ? line.split(";") : line.split(","));
    // Esperado (comprador): al menos 10-12 cols útiles
    // Layout típico (según tu ejemplo):
    // 0 MATKL/Material, 1 Descripción, 2 Marca(T), 3 EAN, 4 TipoEAN, 6 Z, 7 Fiscal, 8 3100 FARMA,
    // 9 FARMA, 10 NO REFRIGERADO, 11 106, 13 Marca(T), 14 ArtAntiguo, 16 Fabricante, 17 VENTA LIBRE,
    // 19 IMPORTADO, 23 RUC prov, 26 NETPR, 27 PVP, 28 descuento
    const it = mapBuyerRow(cols);
    if(it) added.push(it);
  }

  if(!added.length){
    alert("No pude interpretar las filas pegadas. Verificá que estás copiando desde Excel (TAB).");
    return;
  }

  items = items.concat(added);
  renderItems();
  closePasteModal();
  setStatus(`✅ Pegado OK: ${added.length} ítem(s) agregado(s).`, "ok");
}

/* ===========================
   Mapping comprador -> interno
===========================*/
function mapFiscal(v){
  const s = String(v ?? '').trim().toUpperCase();
  if(!s) return '1';
  
  // Casos específicos primero
  if(/EXENT/i.test(s)) return '0';
  
  // Buscar "10" seguido opcionalmente de espacios y %
  if(/10\s*%/.test(s) || /IVA.*10/.test(s) || s.includes('10%')) return '2';
  
  // Buscar "5" seguido opcionalmente de espacios y %
  if(/5\s*%/.test(s) || /IVA.*5/.test(s) || s.includes('5%')) return '1';
  
  // Si viene como número exacto
  if(s === '0') return '0';
  if(s === '1') return '1';
  if(s === '2') return '2';
  if(s === '10') return '2';
  if(s === '5') return '1';
  
  return '1'; // default IVA 5%
}

function detectFiscalFromCells(cells){
  // Busca en toda la fila algún valor que indique 10%, 5% o EXENTA.
  for(const c of cells){
    const f = mapFiscal(c);
    // mapFiscal por defecto devuelve '1', así que confirmamos que el texto realmente tenía señal.
    const s = String(c ?? '').toUpperCase();
    if(/EXENTA/.test(s)) return '0';
    if(/\b10\s*%\b/.test(s) || /IVA\s*10/.test(s) || s==='2') return '2';
    if(/\b5\s*%\b/.test(s) || /IVA\s*5/.test(s) || s==='1') return '1';
    if(s==='0') return '0';
  }
  return '1';
}
function mapAlm(v){
  const s = String(v||"").trim().toUpperCase();
  // Buscar "NO FARMA" ANTES que "FARMA" para evitar falsos positivos
  if(s.includes("NO FARMA") || s.includes("NOFARMA") || s.includes("NO-FARMA")) return "02";
  if(s.includes("PAÑAL") || s.includes("PANAL")) return "03";
  if(s.includes("CONTROL")) return "04";
  if(s.includes("REFRIG")) return "05";
  if(s.includes("FARMA")) return "01";
  return "01";
}
function mapTemp(v){
  const s = String(v||"").trim().toUpperCase();
  if(s.includes("NO")) return "02";
  if(s.includes("REFRIG")) return "01";
  return "02";
}
function mapOrigen(v){
  const s = String(v||"").trim().toUpperCase();
  if(s.includes("IMPORT")) return "IMP";
  if(s.includes("NAC")) return "NAC";
  if(s.includes("MIX")) return "MIX";
  return "IMP";
}
function mapVentaLibre(v){
  const s = String(v||"").trim().toUpperCase();
  if(s.includes("CONTROL")) return "CON";
  return "VTL";
}

// Función para determinar GRUPO_CARGA según VAL y ALM
function getGrupoCarga(val, alm){
  // 3100 = FARMA, 3101 = NO FARMA
  // ALM: 01=FARMA, 02=NO FARMA, 03=PAÑALES, 04=CONTROLADOS, 05=REFRIGERADOS
  
  if(val === "3101") {
    // NO FARMA
    if(alm === "03") return "0003"; // PAÑALES (NO FARMA)
    return "0002"; // NO FARMA genérico
  }
  
  // Si es 3100 (FARMA), depende del ALM
  if(alm === "04") return "0004"; // CONTROLADOS (FARMA)
  if(alm === "05") return "0005"; // REFRIGERADOS (FARMA)
  
  return "0001"; // FARMA por defecto
}

// Función para ajustar ALM según VAL
function adjustAlm(val, alm){
  // Si es NO FARMA (3101), la condición de almacenaje debe ser 02
  if(val === "3101") return "02";
  return alm;
}

function stripNonDigits(s){
  return String(s||"").replace(/\D+/g,"");
}
function clampDesc40(s){
  const t = String(s||"").trim();
  return t.length>40 ? t.slice(0,40) : t;
}
function toIntOrEmpty(v){
  const s = String(v||"").trim();
  if(!s) return "";
  const n = parseInt(s.replace(/[^\d-]/g,""),10);
  return Number.isFinite(n) ? String(n) : "";
}

function mapBuyerRow(cols){
  const get = (i) => {
    const val = cols[i];
    if (val == null || val === undefined) return "";
    // Convertir a string y limpiar espacios
    return String(val).trim();
  };
  
  // Detectar formato del Excel:
  // Si tiene datos en índice 3 y no en índice 0, es formato COMPLETO
  const isFormatoCompleto = get(3) && !get(0);
  
  let matkl, desc, ean, fiscal, val, alm, temp, grupoR, factorFij, marcaT, artAnt;
  let codigoDroga, fabricante, ventaLibre, origen, claseValor, provRuc, netpr, pvp, descuento;
  
  if(isFormatoCompleto) {
    // Formato COMPLETO (ALTA_DE_PRODUCTOS_FEBRERO_2026)
    matkl = get(3);           // Índice 3 - MATKL
    desc = get(4);            // Índice 4 - Descripción
    ean = get(8);             // Índice 8 - EAN
    fiscal = mapFiscal(get(12));  // Índice 12 - Clasificación Fiscal
    val = (get(13) || "3100").toString().includes("3101") ? "3101" : "3100";  // Índice 13
    alm = mapAlm(get(14));    // Índice 14 - Condición Almacenaje
    temp = mapTemp(get(15));  // Índice 15 - Temperatura
    grupoR = get(16) || "106";  // Índice 16 - Grupo de Compra ← CORRECTO (111)
    factorFij = get(17) || "";  // Índice 17 - Factor Fijación ← CORRECTO (1.193)
    marcaT = get(18) || "";   // Índice 18 - Código Marca
    artAnt = get(19) || "";   // Índice 19 - Artículo Antiguo
    codigoDroga = get(20) || "";  // Índice 20 - Código Droga
    fabricante = get(21) || "";   // Índice 21 - Código Fabricante
    ventaLibre = mapVentaLibre(get(22));  // Índice 22 - Nivel de Control
    origen = mapOrigen(get(24));  // Índice 24 - Origen
    // Limpiar espacios extra de clase valor
    const claseValorRaw = get(25);
    claseValor = claseValorRaw.toUpperCase().trim();  // Índice 25 - Clase Valor Compra ← CORRECTO (BRT)
    provRuc = get(28) || "";  // Índice 28 - RUC
    netpr = get(31) || "";    // Índice 31 - NETPR
    pvp = get(32) || "";      // Índice 32 - PVP
    descuento = toIntOrEmpty(get(33));  // Índice 33 - Descuento
    
    // Debug en consola
    console.log(`✅ COMPLETO - GrupoR:"${grupoR}" Factor:"${factorFij}" Marca:"${marcaT}" Clase:"${claseValor}"`);
  } else {
    // Formato SIMPLIFICADO (backup por si alguien copia de otro formato)
    matkl = get(0);
    desc = get(1);
    ean = get(3);
    fiscal = mapFiscal(get(7));
    val = (get(8) || "3100").toString().includes("3101") ? "3101" : "3100";
    alm = mapAlm(get(9));
    temp = mapTemp(get(10));
    grupoR = get(11) || "106";
    factorFij = "";
    marcaT = get(13) || get(2) || "";
    artAnt = get(14) || "";
    codigoDroga = "";
    fabricante = get(16) || "";
    ventaLibre = mapVentaLibre(get(17));
    origen = mapOrigen(get(19));
    claseValor = "";
    provRuc = get(23) || "";
    netpr = get(26) || "";
    pvp = get(27) || "";
    descuento = toIntOrEmpty(get(28));
  }
  
  if(!matkl && !desc && !ean) return null;

  const desde = (descuento && descuento !== "0") ? todayDDMMYYYY() : "";

  return {
    _id: nextLocalId++,
    matkl,
    desc: clampDesc40(desc),
    ean: stripNonDigits(ean),
    fiscal,
    val,
    alm,
    temp,
    grupoR,
    factorFij,
    marcaT,
    artAnt,
    codigoDroga,
    fabricante,
    ventaLibre,
    origen,
    claseValor,
    provRuc,
    netpr: stripNonDigits(netpr),
    pvp: stripNonDigits(pvp),
    descuento: descuento,
    desde
  };
}

/* ===========================
   Render items vertical
===========================*/
function addItem(){
  items.push({
    _id: nextLocalId++,
    matkl:"",
    desc:"",
    ean:"",
    fiscal:"1",
    val:"3100",
    alm:"01",
    temp:"02",
    grupoR:"106",
    factorFij:"",
    marcaT:"",
    artAnt:"",
    codigoDroga:"",
    fabricante:"",
    ventaLibre:"VTL",
    origen:"IMP",
    claseValor:"",
    provRuc:"",
    netpr:"",
    pvp:"",
    descuento:"",
    desde:""
  });
  renderItems();
  setDirty();
}

function deleteItem(id){
  items = items.filter(x => x._id !== id);
  renderItems();
  setDirty();
}

function renderItems(){
  const container = $("itemsList");
  if(!items.length){
    container.innerHTML = `<div class="toast">No hay ítems cargados. Usá "+ Agregar ítem" o "📋 Pegar desde Excel".</div>`;
    return;
  }

  container.innerHTML = items.map((it,idx)=>{
    const num = idx+1;
    return `
<div class="itemCard" data-id="${it._id}">
  <div class="itemGrid">
    <!-- row 1 -->
    <div class="field">
      <label>#${num} · MATKL <span class="req">*</span></label>
      <input value="${it.matkl}" oninput="updateItem(${it._id},'matkl',this.value)"/>
    </div>
    <div class="field wide2">
      <label>Descripción <span class="req">*</span></label>
      <input value="${it.desc}" oninput="updateItem(${it._id},'desc',this.value)"/>
    </div>
    <div class="field">
      <label>EAN (solo dígitos) <span class="req">*</span></label>
      <input value="${it.ean}" inputmode="numeric" oninput="updateItem(${it._id},'ean',this.value)"/>
    </div>
    <div class="field">
      <label>Fiscal (0/1/2)</label>
      <select onchange="updateItem(${it._id},'fiscal',this.value)">
        <option value="0" ${it.fiscal==="0"?"selected":""}>0 - Exenta</option>
        <option value="1" ${it.fiscal==="1"?"selected":""}>1 - IVA 5%</option>
        <option value="2" ${it.fiscal==="2"?"selected":""}>2 - IVA 10%</option>
      </select>
    </div>
    <div class="field">
      <label>Val</label>
      <select onchange="updateItem(${it._id},'val',this.value)">
        <option value="3100" ${it.val==="3100"?"selected":""}>3100 - FARMA</option>
        <option value="3101" ${it.val==="3101"?"selected":""}>3101 - NO FARMA</option>
      </select>
    </div>

    <!-- row 2 -->
    <div class="field">
      <label>Alm</label>
      <select onchange="updateItem(${it._id},'alm',this.value)">
        <option value="01" ${it.alm==="01"?"selected":""}>01 - Farma</option>
        <option value="02" ${it.alm==="02"?"selected":""}>02 - No Farma</option>
        <option value="03" ${it.alm==="03"?"selected":""}>03 - Pañales</option>
        <option value="04" ${it.alm==="04"?"selected":""}>04 - Controlados</option>
        <option value="05" ${it.alm==="05"?"selected":""}>05 - Refrigerados</option>
      </select>
    </div>
    <div class="field">
      <label>Temp</label>
      <select onchange="updateItem(${it._id},'temp',this.value)">
        <option value="01" ${it.temp==="01"?"selected":""}>01 - Refrigerado</option>
        <option value="02" ${it.temp==="02"?"selected":""}>02 - No refrig</option>
      </select>
    </div>
    <div class="field">
      <label>GrupoR</label>
      <input value="${it.grupoR}" oninput="updateItem(${it._id},'grupoR',this.value)"/>
    </div>
    <div class="field">
      <label>Marca(T)</label>
      <input value="${it.marcaT}" oninput="updateItem(${it._id},'marcaT',this.value)"/>
    </div>
    <div class="field">
      <label>ArtAntiguo</label>
      <input value="${it.artAnt}" oninput="updateItem(${it._id},'artAnt',this.value)"/>
    </div>
    <div class="field">
      <label>Factor Fij.</label>
      <input value="${it.factorFij||''}" oninput="updateItem(${it._id},'factorFij',this.value)"/>
    </div>
    <div class="field">
      <label>Cód. Droga (ej: D300)</label>
      <input value="${it.codigoDroga||''}" oninput="updateItem(${it._id},'codigoDroga',this.value)"/>
    </div>
    <div class="field">
      <label>Fabricante</label>
      <input value="${it.fabricante}" oninput="updateItem(${it._id},'fabricante',this.value)"/>
    </div>
    <div class="field">
      <label>Clase Valor (BRT/NET)</label>
      <select onchange="updateItem(${it._id},'claseValor',this.value)">
        <option value="" ${!it.claseValor||it.claseValor===""?"selected":""}>-- Vacío --</option>
        <option value="BRT" ${it.claseValor==="BRT"?"selected":""}>BRT</option>
        <option value="NET" ${it.claseValor==="NET"?"selected":""}>NET</option>
      </select>
    </div>

    <!-- row 3 -->
    <div class="field">
      <label>Venta Libre</label>
      <select onchange="updateItem(${it._id},'ventaLibre',this.value)">
        <option value="VTL" ${it.ventaLibre==="VTL"?"selected":""}>VTL</option>
        <option value="CON" ${it.ventaLibre==="CON"?"selected":""}>CON</option>
      </select>
    </div>
    <div class="field">
      <label>Origen</label>
      <select onchange="updateItem(${it._id},'origen',this.value)">
        <option value="IMP" ${it.origen==="IMP"?"selected":""}>IMP</option>
        <option value="NAC" ${it.origen==="NAC"?"selected":""}>NAC</option>
        <option value="MIX" ${it.origen==="MIX"?"selected":""}>MIX</option>
      </select>
    </div>
    <div class="field">
      <label>RUC Proveedor <span class="req">*</span></label>
      <input value="${it.provRuc}" inputmode="numeric" oninput="updateItem(${it._id},'provRuc',this.value)"/>
    </div>
    <div class="field">
      <label>NETPR (solo dígitos)</label>
      <input value="${it.netpr}" inputmode="numeric" oninput="updateItem(${it._id},'netpr',this.value)"/>
    </div>
    <div class="field">
      <label>PVP (solo dígitos)</label>
      <input value="${it.pvp}" inputmode="numeric" oninput="updateItem(${it._id},'pvp',this.value)"/>
    </div>
    <div class="field">
      <label>Descuento (%)</label>
      <input value="${it.descuento}" inputmode="numeric" oninput="updateItem(${it._id},'descuento',this.value)"/>
    </div>
    <div class="field">
      <label>Desde (ddmmyyyy)</label>
      <input value="${it.desde}" placeholder="ddmmyyyy" oninput="updateItem(${it._id},'desde',this.value)"/>
    </div>
  </div>
  <div class="footerActions">
    <button class="btn btn-danger btn-sm rowBtn" onclick="deleteItem(${it._id})">Eliminar ítem</button>
  </div>
</div>`;
  }).join("");
}

function updateItem(id, field, value){
  const item = items.find(x => x._id === id);
  if(!item) return;
  item[field] = value;
  setDirty();
}

/* ===========================
   Validations
===========================*/
function runValidations(forExport=false){
  const errs = [];

  const buyer = ($("comprador").value||"").trim();
  if(!buyer) errs.push("Falta el nombre del comprador.");

  if(!items.length) errs.push("No hay ítems para exportar.");

  items.forEach((it,i)=>{
    const n = i+1;
    if(!it.matkl) errs.push(`Ítem ${n}: falta MATKL.`);
    if(!it.desc) errs.push(`Ítem ${n}: falta Descripción.`);
    if(!it.ean) errs.push(`Ítem ${n}: falta EAN.`);
    if(!it.provRuc) errs.push(`Ítem ${n}: falta RUC Proveedor.`);
  });

  if(errs.length){
    showErrors(errs);
    setStatus(`❌ Hay ${errs.length} error(es). Corregí antes de ${forExport?"exportar":"validar"}.`, "err");
    return forExport ? {ok:false} : false;
  }

  showErrors([]);
  setStatus("✅ Validación OK. Podés exportar.", "ok");
  return forExport ? {ok:true} : true;
}

/* ===========================
   Fetch último material desde backend
===========================*/
async function attemptFetchUltimoMatnr(){
  const el = $("ultimoMatnr");
  if(!el) return;

  try{
    const r = await fetch('/api/ultimo-material', {method:'GET'});
    if(!r.ok){
      // Si falla el endpoint, no hacemos nada (el usuario puede cargar manualmente)
      if(!normalizeMatnr18(el.value)){
        setStatus('No se pudo consultar el último material SAP. Podés cargarlo manualmente.', 'warn');
      }
      return;
    }

    const ct = r.headers.get('content-type')||'';
    const data = ct.includes('application/json') ? await r.json() : await r.text();

    const extractLast = (v)=>{
      if(v == null) return '';
      // si es objeto, buscamos keys típicas o el primer valor string/number
      if(typeof v === 'object'){
        const keys = Object.keys(v);
        const pick = (names)=>{
          for(const n of names){
            const k = keys.find(x => x.toLowerCase() === n);
            if(k) return v[k];
          }
          return undefined;
        };
        const candidate =
          pick(['material_id_18','material_id','ultimomaterial','ultimo_material','ultimo_matnr','ultimomatnr','matnr','value','data']) ??
          // fallback: primer valor que parezca número / string
          (keys.length ? v[keys[0]] : undefined);

        return extractLast(candidate);
      }
      const s = String(v).trim();
      // buscamos un número de 8..18 dígitos, preferimos 18
      const m18 = s.match(/\b\d{18}\b/);
      if(m18) return m18[0];
      const m = s.match(/\b\d{8,17}\b/);
      if(m) return m[0].padStart(18,'0');
      return '';
    };

    const raw18 = extractLast(data);
    const last18 = normalizeMatnr18(raw18);
    if(last18){
      el.value = last18;
      lastSapMatnr18Fetched = last18; // ✅ Guardar el valor fetched
      setStatus('Último material SAP detectado: '+last18, 'ok');
      return;
    }

    // Si no vino nada útil: no pisamos el valor actual; solo avisamos si está vacío.
    if(!normalizeMatnr18(el.value)){
      setStatus('No se pudo leer el último material (respuesta vacía). Podés cargarlo manualmente.', 'warn');
    }
  }catch(err){
    console.error('Error al consultar último material:', err);
    // No pisamos el valor actual; solo avisamos si está vacío.
    if(!normalizeMatnr18(el.value)){
      setStatus('No se pudo consultar el último material SAP. Podés cargarlo manualmente.', 'warn');
    }
  }
}

async function validateAll(){
  const ok = runValidations(false);
  validatedOk = ok;
  const btn = document.getElementById('btnExportar');
  if(btn) btn.disabled = !ok;
  return ok;
}

/* ===========================
   Export helpers
===========================*/
function pad18(n){
  const s = String(n||"").replace(/\D+/g,"");
  return s.padStart(18,"0");
}

function normalizeMatnr18(v){
  const d = String(v||"").replace(/\D/g, "");
  if (!d) return "";
  if (d.length > 18) return d.slice(-18);
  return d.padStart(18, "0");
}

function fiscalToMwskz(fiscalK){
  // Reglas: IVA 5% => A1, IVA 10% => A2, Exenta => A0
  const v = String(fiscalK ?? '').trim();
  if (!v) return 'A2'; // default razonable (10%) si no viene nada
  
  // Si ya viene en formato A0/A1/A2
  if (v === 'A0' || v === 'A1' || v === 'A2') return v;
  
  // Si viene como número exacto (0, 1, 2) que es lo que guardamos internamente
  if (v === '0') return 'A0';
  if (v === '1') return 'A1';
  if (v === '2') return 'A2';
  
  // Si viene como texto
  const upper = v.toUpperCase();
  if (upper.includes('EXEN') || upper.includes('EXENTA')) return 'A0';
  
  // Buscamos porcentajes específicos
  if (/\b10\s*%/.test(v) || /IVA\s*10/.test(upper)) return 'A2';
  if (/\b5\s*%/.test(v) || /IVA\s*5/.test(upper)) return 'A1';
  
  return 'A2'; // default
}

function matnrSequenceFrom(start18, count){
  // start18 es "último material creado"; el primero nuevo es +1
  const base = BigInt(start18);
  const out = [];
  for(let i=1;i<=count;i++){
    out.push(pad18((base + BigInt(i)).toString()));
  }
  return out;
}

function getFilenameBase(prefix){
  const buyer = normalizeName($("comprador").value);
  const date = $("fecha").value || todayDDMMYYYY();
  return `${prefix}_${buyer}_${date}`;
}

function downloadTxt(name, content){
  const blob = new Blob([content], {type:"text/plain;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 0);
}

function downloadXlsx(name, rows){
  // rows: array of objects with keys Material, UnM, "Precio c/IVA"
  const ws = XLSX.utils.json_to_sheet(rows, {header:["Material","UnM","Precio c/IVA"]});
  // asegurar encabezados exactos
  ws["A1"].v = "Material";
  ws["B1"].v = "UnM";
  ws["C1"].v = "Precio c/IVA";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "PVP");
  XLSX.writeFile(wb, name);
}

/* ===========================
   Builders (mínimo operativo)
   Nota: aquí mantenemos estructura; si tu backend ya reserva rango,
   podemos enchufar start18 desde API. Por ahora tomamos de localStorage.
===========================*/
function buildALTA(matnrs18){
  // Formato EXACTO según el Excel de ejemplo (columnas A-AH)
  const lines = [];
  items.forEach((it, i)=>{
    const MATNR = matnrs18[i];
    
    // Ajustar ALM según VAL (si es NO FARMA 3101, ALM debe ser 02)
    const almAjustado = adjustAlm(it.val, it.alm);
    
    // Calcular GRUPO_CARGA según VAL y ALM
    const grupoCarga = getGrupoCarga(it.val, it.alm);
    
    // DROGAS es opcional: solo si es FARMA (3100) Y tiene código de droga
    const esFarma = it.val === "3100";
    const tieneDroga = it.codigoDroga && it.codigoDroga.trim() !== "";
    const atinnDroga = (esFarma && tieneDroga) ? "DROGAS" : "";
    const atwrtDroga = (esFarma && tieneDroga) ? it.codigoDroga : "";
    
    // Clase Valor Compra: solo si tiene Factor de Fijación
    const tieneFactorFij = it.factorFij && it.factorFij.trim() !== "";
    const claseValorFinal = tieneFactorFij ? (it.claseValor || "") : "";
    
    const cols = [
      "HAWA",              // A - MTART (fijo)
      it.matkl,            // B - MATKL
      MATNR,               // C - MATNR (18 dígitos)
      "GAR",               // D - AREF_MATL (fijo)
      clampDesc40(it.desc), // E - MAKTX (Descripción)
      "EA",                // F - MEINS (fijo)
      it.ean,              // G - EAN11
      "HE",                // H - EAN_CAT (fijo)
      "",                  // I - EXTWG (vacío)
      "Z",                 // J - WMAAB (fijo)
      it.fiscal,           // K - TAKLV (0/1/2)
      it.val,              // L - WBKLA (3100/3101)
      "PY",                // M - WHERL (fijo)
      almAjustado,         // N - RAUBE (ajustado según VAL)
      it.temp,             // O - TEMPB (01/02)
      it.grupoR,           // P - WEKGR (106 u otro)
      "2",                 // Q - BBTYP (fijo)
      grupoCarga,          // R - LADGR (calculado según VAL y ALM)
      it.factorFij || "",  // S - Factor Fijación de precios
      it.marcaT || "",     // T - BRAND_ID (código marca)
      it.artAnt || "",     // U - BISMT (artículo antiguo)
      atinnDroga,          // V - ATINN (DROGAS solo si FARMA y tiene código)
      atwrtDroga,          // W - ATWRT (código droga)
      "FABRICANTES",       // X - ATINN_1 (fijo)
      it.fabricante || "", // Y - ATWRT_1 (valor fabricante)
      "D100",              // Z - PLANT (fijo)
      "Z",                 // AA - ABC_ID (fijo)
      it.fiscal === "2" ? "02" : "01", // AB - ACCT_ASSGT (01 o 02 según IVA)
      it.ventaLibre || "VTL", // AC - MATL_GRP_1 (VTL/CON)
      "",                  // AD - MATL_GRP_2 (vacío)
      it.origen || "IMP",  // AE - MATL_GRP_3 (IMP/NAC/MIX)
      claseValorFinal,     // AF - Clase Valor Compra (BRT/NET solo si tiene Factor Fij)
      "",                  // AG - PRICE_FIXING (vacío)
      clampDesc40(it.desc) // AH - MATL_DESCR (repite descripción)
    ];
    lines.push(cols.join("\t"));
  });
  return lines.join("\n");
}

function buildREG(matnrs18){
  const lines = [];
  items.forEach((it, i)=>{
    const matnrNoZeros = String(matnrs18[i]).replace(/^0+/,"") || "0";
    const lifnr = it.provRuc || "";
    const ekgrp = it.grupoR || "106"; // ✅ Usar el grupo de compra del item (111, 106, etc.)
    const mwskz = fiscalToMwskz(it.fiscal);
    
    // Debug: mostrar en consola el mapeo
    if(i < 3) console.log(`Item ${i+1}: grupoR="${it.grupoR}" fiscal="${it.fiscal}" -> mwskz="${mwskz}"`);
    
    const netpr = it.netpr || "";
    const waers = CONSTS.WAERS;
    const cols = [lifnr, matnrNoZeros, "1000","0","X","3", ekgrp, "1","0004", mwskz, netpr, waers, "1","UN","1"];
    lines.push(cols.join("\t"));
  });
  return lines.join("\n");
}

function buildDESC(matnrs18){
  const lines = [];
  let any = false;
  items.forEach((it,i)=>{
    if(!it.descuento || it.descuento==="0") return;
    any = true;
    const matnrNoZeros = String(matnrs18[i]).replace(/^0+/,"") || "0";
    const lifnr = it.provRuc || "";
    const desde = it.desde || todayDDMMYYYY();
    const cols = [lifnr, matnrNoZeros, "1000", desde, it.descuento];
    lines.push(cols.join("\t"));
  });
  return any ? lines.join("\n") : "";
}

function buildPVP(matnrs18){
  // XLSX requerido:
  // Material | UnM | Precio c/IVA
  const rows = [];
  items.forEach((it,i)=>{
    const matnrNoZeros = String(matnrs18[i]).replace(/^0+/,"") || "0";
    if(!it.pvp) return;
    rows.push({
      "Material": matnrNoZeros,
      "UnM": "UN",
      "Precio c/IVA": Number(it.pvp)
    });
  });
  return rows;
}

function exportAll(){
  if(!validatedOk){
    const ok = validateAll();
    if(!ok){ setStatus('Hay errores. Corregí antes de exportar.','err'); return; }
  }

  const v = runValidations(true);
  if(!v.ok) { runValidations(false); return; }

  const buyer = $("comprador").value.trim();
  const date = $("fecha").value || todayDDMMYYYY();

  // ✅ MATNR base: usamos el valor del input o el fetched como fallback
  const inputLast = $("ultimoMatnr") ? normalizeMatnr18($("ultimoMatnr").value) : "";
  const last18 = inputLast || lastSapMatnr18Fetched || "000000000010000000";

  const matnrs18 = matnrSequenceFrom(last18, items.length);

  const alta = buildALTA(matnrs18);
  const reg  = buildREG(matnrs18);
  const desc = buildDESC(matnrs18);
  const pvpRows = buildPVP(matnrs18);

  downloadTxt(`${getFilenameBase("ALTA")}.txt`, alta);
  downloadTxt(`${getFilenameBase("REG")}.txt`, reg);
  if(desc) downloadTxt(`${getFilenameBase("DESC")}.txt`, desc);
  // si más adelante querés ZSDCPF separado, lo agregamos acá sin tocar el resto.

  downloadXlsx(`${getFilenameBase("PVP")}.xlsx`, pvpRows);

  setStatus("✅ Archivos exportados correctamente.", "ok");
}

function clearAll(){
  if(!confirm("¿Limpiar todos los ítems cargados?")) return;
  items = [];
  renderItems();
  showErrors([]);
  setStatus("Estado: esperando validación...", "muted");
}


window.addEventListener('load', ()=>{ attemptFetchUltimoMatnr(); });
