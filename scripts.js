const $ = (id) => document.getElementById(id);
  const tbody = () => $("itemsTable").querySelector("tbody");

  function downloadTxt(filename, content){
    const blob = new Blob([content], {type:"text/plain;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function isEmpty(v){ return !v || !String(v).trim(); }
  function sanitizeNum(v){
    return (v ?? "").toString().trim().replace(/\s+/g,"").replace(",", ".");
  }
  function clamp40(s){
    const t = (s ?? "").toString().trim().replace(/\s+/g," ");
    return t.length > 40 ? t.slice(0,40) : t;
  }
  function pad18(n){
    const s = String(n);
    return s.length >= 18 ? s.slice(-18) : ("0".repeat(18 - s.length) + s);
  }
  function parse18(str){
    const s = (str ?? "").toString().trim();
    if(!/^\d{1,18}$/.test(s)) return null;
    return BigInt(s);
  }
  function matExternal(matnr18){
    const s = (matnr18 ?? "").toString().replace(/^0+/,"");
    return s === "" ? "0" : s;
  }

  function createInput(value="", placeholder=""){
    const i=document.createElement("input");
    i.value=value; i.placeholder=placeholder;
    return i;
  }
  function createSelect(opts, value){
    const s=document.createElement("select");
    opts.forEach(o=>{
      const op=document.createElement("option");
      op.value=o.v; op.textContent=o.t;
      if(o.v===value) op.selected=true;
      s.appendChild(op);
    });
    return s;
  }
  function tdWrap(el){
    const td=document.createElement("td");
    td.appendChild(el);
    return td;
  }

  function setStatus(text, tone){
    const box = $("statusBox");
    box.textContent = text;
    box.style.borderColor =
      tone==="ok" ? "rgba(35,197,94,.25)" :
      tone==="bad" ? "rgba(239,68,68,.25)" :
      "rgba(255,255,255,.12)";
    box.style.color =
      tone==="ok" ? "rgba(200,255,220,.92)" :
      tone==="bad" ? "rgba(255,210,210,.92)" :
      "var(--muted)";
  }

  function addRow(pref={}){
    const tr=document.createElement("tr");

    // ===== ALTA (inputs del comprador / reglas) =====
    const matkl = createInput(pref.matkl||"", "NF0404102");
    const desc = createInput(pref.desc||"", "BIOFARM AGUA FLORIDA 30ML UNID.");
    const ean = createInput(pref.ean||"", "7842674000039");

    const fiscal = createSelect([{v:"1",t:"1 (5%)"},{v:"2",t:"2 (10%)"}], pref.fiscal||"2");
    const valor = createSelect([{v:"3100",t:"3100 FARMA"},{v:"3101",t:"3101 NOFARMA"}], pref.valor||"3100");

    const almacen = createSelect([
      {v:"01",t:"01 Farma"},
      {v:"02",t:"02 NoFarma"},
      {v:"03",t:"03 Pañales"},
      {v:"04",t:"04 Controlados"},
      {v:"05",t:"05 Refrigerados"}
    ], pref.almacen||"01");

    const temp = createSelect([{v:"01",t:"01 Refrigerado"},{v:"02",t:"02 No refrigerado"}], pref.temp||"02");

    const grupoCarga = createInput(pref.grupoCarga||"0001", "0001");
    const factor = createInput(pref.factor||"", "Opcional");
    const marca = createInput(pref.marca||"", "2033");
    const artAnt = createInput(pref.artAnt||"", "Opcional");

    const tieneDroga = createSelect([{v:"NO",t:"NO"},{v:"SI",t:"SI"}], pref.tieneDroga||"NO");
    const codDroga = createInput(pref.codDroga||"", "D694");

    const fabricante = createInput(pref.fabricante||"", "F462");
    const origen = createSelect([{v:"NAC",t:"NAC"},{v:"IMP",t:"IMP"},{v:"MIX",t:"MIX"}], pref.origen||"NAC");
    const brtNet = createSelect([{v:"",t:"(vacío)"},{v:"BRT",t:"BRT"},{v:"NET",t:"NET"}], pref.brtNet||"BRT");

    // ===== REG por fila (comprador modifica B,H,K,L y WAERS M) =====
    const regProveedor = createInput(pref.regProveedor || "", "80001556-8");
    const regEkgrp = createInput(pref.regEkgrp || $("grupoCompra").value.trim() || "102", "102");
    const regMwsKz = createSelect([{v:"A1",t:"A1"},{v:"A2",t:"A2"}], pref.regMwsKz || "A2");
    const regNetpr = createInput(pref.regNetpr || "", "58766");
    const regWaers = createSelect([{v:"PYG",t:"PYG"},{v:"USD",t:"USD"}], pref.regWaers || "PYG");

    // ===== ZSDCPF =====
    const pvp = createInput(pref.pvp||"", "69900");

    // ===== DESC opcional =====
    const descInt = createInput(pref.descInt||"", "Ej: 7");
    const descDesde = createInput(pref.descDesde||"", "ddmmyyyy (Ej: 12012026)");

    function syncRules(){
      const isFarma = valor.value === "3100";
      if(isFarma && (grupoCarga.value.trim()==="" || grupoCarga.value==="0000")) grupoCarga.value="0001";

      const on = tieneDroga.value==="SI";
      codDroga.disabled = !on;
      if(!on) codDroga.value="";

      // Si no cargan proveedor REG, sugerir del input
      if(isEmpty(regProveedor.value) && !isEmpty($("comprador").value)) {
        // no autollenamos con comprador, solo ejemplo; dejamos tal cual
      }
    }
    valor.addEventListener("change", syncRules);
    tieneDroga.addEventListener("change", syncRules);
    syncRules();

    const delBtn = document.createElement("button");
    delBtn.textContent="Quitar";
    delBtn.className="secondary";
    delBtn.onclick=()=>tr.remove();

    // Append en el mismo orden del THEAD
    tr.appendChild(tdWrap(matkl));
    tr.appendChild(tdWrap(desc));
    tr.appendChild(tdWrap(ean));
    tr.appendChild(tdWrap(fiscal));
    tr.appendChild(tdWrap(valor));
    tr.appendChild(tdWrap(almacen));
    tr.appendChild(tdWrap(temp));
    tr.appendChild(tdWrap(grupoCarga));
    tr.appendChild(tdWrap(factor));
    tr.appendChild(tdWrap(marca));
    tr.appendChild(tdWrap(artAnt));
    tr.appendChild(tdWrap(tieneDroga));
    tr.appendChild(tdWrap(codDroga));
    tr.appendChild(tdWrap(fabricante));
    tr.appendChild(tdWrap(origen));
    tr.appendChild(tdWrap(brtNet));

    tr.appendChild(tdWrap(regProveedor));
    tr.appendChild(tdWrap(regEkgrp));
    tr.appendChild(tdWrap(regMwsKz));
    tr.appendChild(tdWrap(regNetpr));
    tr.appendChild(tdWrap(regWaers));

    tr.appendChild(tdWrap(pvp));

    tr.appendChild(tdWrap(descInt));
    tr.appendChild(tdWrap(descDesde));

    tr.appendChild(tdWrap(delBtn));

    tbody().appendChild(tr);
  }

  function clearAll(){
    tbody().innerHTML="";
    setStatus("Estado: esperando validación…");
    $("btnExport").disabled = true;
  }

  function seedDemo(){
    clearAll();
    $("comprador").value="Compras Demo";
    $("grupoCompra").value="102";
    $("ultimoMat").value="000000000010032320";

    addRow({
      matkl:"NF0404102",
      desc:"BIOFARM AGUA FLORIDA 30ML UNID.",
      ean:"7842674000039",
      fiscal:"2",
      valor:"3101",
      almacen:"02",
      temp:"02",
      grupoCarga:"0002",
      factor:"1.49",
      marca:"4363",
      artAnt:"682663",
      tieneDroga:"NO",
      fabricante:"F21491",
      origen:"NAC",
      brtNet:"BRT",
      // REG
      regProveedor:"3954757-4",
      regEkgrp:"110",
      regMwsKz:"A2",
      regNetpr:"8182",
      regWaers:"PYG",
      // ZSDCPF
      pvp:"69900",
      // DESC
      descInt:"7",
      descDesde:"12012026"
    });

    addRow({
      matkl:"FA0209102",
      desc:"GLUCOTIN LIMA-LIMON CJ X 30 SOBRES",
      ean:"7840036107891",
      fiscal:"2",
      valor:"3100",
      almacen:"01",
      temp:"02",
      grupoCarga:"0001",
      factor:"",
      marca:"2033",
      artAnt:"682751",
      tieneDroga:"SI",
      codDroga:"D694",
      fabricante:"F462",
      origen:"NAC",
      brtNet:"",
      // REG
      regProveedor:"800001916-4",
      regEkgrp:"102",
      regMwsKz:"A1",
      regNetpr:"80667",
      regWaers:"PYG",
      // ZSDCPF
      pvp:"59900",
      // DESC
      descInt:"",
      descDesde:""
    });

    setStatus("Demo cargada. Validá y generá vista previa.", "ok");
  }

  function readItems(){
    const rows = [...tbody().querySelectorAll("tr")];
    return rows.map(tr=>{
      const cells=[...tr.querySelectorAll("td")];
      const v = (i)=> cells[i].querySelector("input,select")?.value ?? "";

      // Índices (IMPORTANTE): deben coincidir con el orden del THEAD / addRow
      return {
        // ALTA
        matkl: v(0).trim(),
        desc: v(1),
        ean: v(2).trim(),
        fiscal: v(3).trim(),
        valor: v(4).trim(),
        almacen: v(5).trim(),
        temp: v(6).trim(),
        grupoCarga: v(7).trim(),
        factor: v(8).trim(),
        marca: v(9).trim(),
        artAnt: v(10).trim(),
        tieneDroga: v(11).trim(),
        codDroga: v(12).trim(),
        fabricante: v(13).trim(),
        origen: v(14).trim(),
        brtNet: v(15).trim(),

        // REG
        regProveedor: v(16).trim(),
        regEkgrp: v(17).trim(),
        regMwsKz: v(18).trim(),
        regNetpr: sanitizeNum(v(19)),
        regWaers: v(20).trim(),

        // ZSDCPF
        pvp: sanitizeNum(v(21)),

        // DESC
        descInt: (v(22) ?? "").toString().trim(),
        descDesde: (v(23) ?? "").toString().trim()
      };
    });
  }

  function runValidations(){
    const issues = [];
    const warnings = [];

    const grupoCompra = $("grupoCompra").value.trim();
    const ultimoMatStr = $("ultimoMat").value.trim();
    const ultimoMat = parse18(ultimoMatStr);

    if(isEmpty(grupoCompra) || !/^\d+$/.test(grupoCompra)) issues.push("Grupo de compra (P) es obligatorio y numérico.");
    if(!ultimoMat) issues.push("Último material inválido (debe ser numérico).");

    const items = readItems();
    if(items.length===0) issues.push("Debés agregar al menos 1 ítem.");

    items.forEach((it, idx)=>{
      const n = idx+1;

      // ALTA
      if(isEmpty(it.matkl)) issues.push(`Fila ${n}: MATKL obligatorio.`);
      const d = clamp40(it.desc);
      if(isEmpty(d)) issues.push(`Fila ${n}: Descripción obligatoria.`);
      if(d.length > 40) issues.push(`Fila ${n}: Descripción excede 40 caracteres (se truncará).`);

      if(isEmpty(it.ean)) issues.push(`Fila ${n}: EAN obligatorio.`);
      if(!isEmpty(it.ean) && !/^\d{8,14}$/.test(it.ean)) warnings.push(`Fila ${n}: EAN parece inválido (largo/formato).`);

      if(!["1","2"].includes(it.fiscal)) issues.push(`Fila ${n}: Fiscal (K) debe ser 1 o 2.`);
      if(!["3100","3101"].includes(it.valor)) issues.push(`Fila ${n}: Categoría valoración debe ser 3100/3101.`);
      if(!/^(0[1-5])$/.test(it.almacen)) issues.push(`Fila ${n}: Cond. almacenaje debe ser 01..05.`);
      if(!/^(0[1-2])$/.test(it.temp)) issues.push(`Fila ${n}: Temperatura debe ser 01 o 02.`);
      if(isEmpty(it.grupoCarga)) issues.push(`Fila ${n}: Grupo de carga obligatorio.`);
      if(isEmpty(it.marca)) issues.push(`Fila ${n}: Código marca obligatorio.`);

      if(it.tieneDroga==="SI" && isEmpty(it.codDroga)) issues.push(`Fila ${n}: Si tiene droga, código de droga es obligatorio.`);
      if(it.tieneDroga==="NO" && !isEmpty(it.codDroga)) warnings.push(`Fila ${n}: Código de droga cargado pero "¿Droga?"=NO.`);

      if(isEmpty(it.fabricante)) issues.push(`Fila ${n}: Código fabricante obligatorio.`);
      if(!["NAC","IMP","MIX"].includes(it.origen)) issues.push(`Fila ${n}: Origen debe ser NAC/IMP/MIX.`);

      if(it.valor==="3100" && it.almacen!=="01") warnings.push(`Fila ${n}: 3100 FARMA debería ser almacenaje 01.`);
      if(it.valor==="3101" && it.almacen==="01") warnings.push(`Fila ${n}: 3101 NOFARMA normalmente no debería ser almacenaje 01.`);

      // REG (corregido)
      if(isEmpty(it.regProveedor)) issues.push(`Fila ${n}: Proveedor (REG) obligatorio.`);
      if(isEmpty(it.regEkgrp) || !/^\d+$/.test(it.regEkgrp)) issues.push(`Fila ${n}: EKGRP (REG) obligatorio y numérico.`);
      if(!["A1","A2"].includes(it.regMwsKz)) issues.push(`Fila ${n}: MWSKZ (REG) debe ser A1 o A2.`);
      if(isEmpty(it.regNetpr) || isNaN(Number(it.regNetpr)) || Number(it.regNetpr) <= 0){
        issues.push(`Fila ${n}: NETPR (REG) obligatorio y > 0.`);
      }
      if(!["PYG","USD"].includes(it.regWaers)) issues.push(`Fila ${n}: WAERS (REG) debe ser PYG o USD.`);

      // ZSDCPF
      if(isEmpty(it.pvp) || isNaN(Number(it.pvp)) || Number(it.pvp) <= 0){
        issues.push(`Fila ${n}: PVP (ZSDCPF) obligatorio y > 0.`);
      }

      // DESC opcional
      const hasDesc = !isEmpty(it.descInt) || !isEmpty(it.descDesde);
      if(hasDesc){
        if(isEmpty(it.descInt)) issues.push(`Fila ${n}: Cargaste fecha DESC pero falta descuento entero.`);
        if(isEmpty(it.descDesde)) issues.push(`Fila ${n}: Cargaste descuento pero falta fecha DESDE (ddmmyyyy).`);
        if(!isEmpty(it.descInt) && !/^\d+$/.test(it.descInt)) issues.push(`Fila ${n}: Descuento debe ser entero (sin %).`);
        if(!isEmpty(it.descDesde) && !/^\d{8}$/.test(it.descDesde)) issues.push(`Fila ${n}: Fecha DESC debe ser ddmmyyyy (8 dígitos).`);
      }
    });

    if(issues.length===0){
      setStatus(`✅ Validación OK. Warnings: ${warnings.length}. Ya podés exportar.`, "ok");
      $("btnExport").disabled = false;
    }else{
      setStatus(`❌ Hay ${issues.length} errores bloqueantes. Corregí antes de exportar.`, "bad");
      $("btnExport").disabled = true;
    }

    // Si hay errores/warnings, los mostramos en un alert (sin panel de vista previa).
    const details = []
      .concat(issues.map(x=>"ERROR: "+x))
      .concat(warnings.map(x=>"WARN:  "+x))
      .join("\n");

    if(details){
      // Evitamos spamear alerts en cada tecla: sólo cuando se presiona "Validar lote".
      // Si querés, podés comentar este bloque.
      if(document.activeElement && document.activeElement.tagName === "BUTTON"){
        alert(details);
      }
    }
  }

  // ====== ALTA A–AH (34 columnas) ======
  function buildALTA(items){
    const ultimoMat = parse18($("ultimoMat").value.trim());
    const are = $("constARE").value.trim() || "GAR";
    const um = $("constUM").value.trim() || "EA";
    const tipoEan = $("constTipoEan").value.trim() || "HE";
    const pais = $("constPais").value.trim() || "PY";
    const grupoCompra = $("grupoCompra").value.trim();
    const constQ = $("constQ").value.trim() || "2";

    let current = ultimoMat;

    const lines = items.map(it=>{
      current = current + 1n;
      const matnr = pad18(current.toString());

      const desc = clamp40(it.desc);
      const ivaCode = (it.fiscal === "1") ? "01" : "02";

      const drogasTxt = (it.tieneDroga==="SI") ? "DROGAS" : "";
      const drogaCod = (it.tieneDroga==="SI") ? it.codDroga : "";

      const cols = [
        "HAWA", it.matkl, matnr, are, desc, um, it.ean, tipoEan,
        "", "Z", it.fiscal, it.valor, pais, it.almacen, it.temp,
        grupoCompra, constQ, it.grupoCarga, it.factor || "", it.marca,
        it.artAnt || "", drogasTxt, drogaCod, "FABRICANTES", it.fabricante,
        "D100", "Z", ivaCode, "VTL", "", it.origen, it.brtNet || "", "", desc
      ];
      return cols.join("\t");
    });

    return lines.join("\n");
  }

  // ====== REG (15 columnas TAB) - FORMATO CORRECTO ======
  function buildREGWithMatnr(items){
    const ultimoMat = parse18($("ultimoMat").value.trim());
    let current = ultimoMat;

    // fijos (amarillos)
    const EKORG = "1000";
    const ESOKZ = "0";
    const RELIF = "X";
    const APLFZ = "3";
    const NORMB = "1";
    const BSTAE = "0004";
    const PEINH = "1";
    const BPRME = "UN";
    const BPUMN = "1";

    const lines = items.map(it=>{
      current = current + 1n;

      // MATNR en REG va sin ceros
      const matnr18 = pad18(current.toString());
      const MATNR = matExternal(matnr18);

      const LIFNR = it.regProveedor;
      const EKGRP = it.regEkgrp;
      const MWSKZ = it.regMwsKz;
      const NETPR = it.regNetpr;
      const WAERS = it.regWaers;

      const cols = [
        LIFNR, MATNR, EKORG, ESOKZ, RELIF, APLFZ,
        EKGRP, NORMB, BSTAE, MWSKZ, NETPR, WAERS,
        PEINH, BPRME, BPUMN
      ];
      return cols.join("\t");
    });

    return lines.join("\n");
  }

  // ====== DESC opcional ======
  function buildDESCWithMatnr(items){
    const ultimoMat = parse18($("ultimoMat").value.trim());
    let current = ultimoMat;

    const lines = [];

    items.forEach(it=>{
      current = current + 1n;

      const has = !isEmpty(it.descInt) && !isEmpty(it.descDesde);
      if(!has) return;

      const matnr18 = pad18(current.toString());
      const MATNR = matExternal(matnr18);

      lines.push([it.regProveedor, MATNR, "1000", it.descDesde, it.descInt].join("\t"));
    });

    return lines.join("\n");
  }

  // ====== ZSDCPF ======
  function buildZSDCPFWithMatnr(items){
    const ultimoMat = parse18($("ultimoMat").value.trim());
    let current = ultimoMat;
    const um = $("constUM").value.trim() || "EA";

    return items.map(it=>{
      current = current + 1n;
      const matnr18 = pad18(current.toString());
      return [matnr18, um, it.pvp].join("\t");
    }).join("\n");
  }

  function exportAll(){
    runValidations();
    if($("btnExport").disabled) return;

    const lote = $("loteId").value.trim() || "LOTE";
    const items = readItems();

    const alta = buildALTA(items);
    const reg  = buildREGWithMatnr(items);
    const desc = buildDESCWithMatnr(items);
    const zsd  = buildZSDCPFWithMatnr(items);

    downloadTxt(`ALTA_${lote}.txt`, alta);
    downloadTxt(`REG_${lote}.txt`, reg);
    if(desc) downloadTxt(`DESC_${lote}.txt`, desc);
    downloadTxt(`ZSDCPF_${lote}.txt`, zsd);

    setStatus("✅ TXT exportados. (DESC sólo si corresponde).", "ok");
  }

  // init
  addRow();