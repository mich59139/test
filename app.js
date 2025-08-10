/* ========= CONFIG ========= */
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";
const RAW_URL       = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;

const SNAPSHOT_ENABLED = false;

let GHTOKEN  = localStorage.getItem("ghtoken") || null;
let ARTICLES = [];
let currentPage = 1;
let sortCol = null, sortDir = "asc";
let EDIT_INLINE_IDX = null;
let EDIT_INLINE_DRAFT = null;

// Mode brouillon / undo / redo
let DRAFT_MODE = false;
let PENDING_DIRTY = false;
let UNDO_STACK = [];
let REDO_STACK = [];

/* ========= UTILS ========= */
const HEADERS = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
const esc = v => { const s=(v??"").toString(); return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s; };
const toCSV = rows => [HEADERS.join(",")].concat(rows.map(r=>HEADERS.map(h=>esc(r[h])).join(","))).join("\n");
const decodeB64 = b64 => decodeURIComponent(escape(atob(b64)));
const encodeB64 = str => btoa(unescape(encodeURIComponent(str)));
const setBadge = (id, ok, extra="") => { const el=document.getElementById(id); if(!el)return; el.textContent = ok?`✅${extra}`:`❌`; el.style.color = ok? "#16a34a":"#dc2626"; };
const uniqSorted = a => [...new Set(a.filter(Boolean))].sort((x,y)=>(""+x).localeCompare(""+y,"fr"));
const sleep = ms => new Promise(res => setTimeout(res, ms));
const showLoading = (on=true) => { const el=document.getElementById("loading"); if (el) el.classList.toggle("hidden", !on); };
const splitMulti = v => (v||"").split(/[;,]\s*/g).map(s=>s.trim()).filter(Boolean);

/* ========= UNDO/REDO & DRAFT ========= */
function pushUndo(){
  UNDO_STACK.push(JSON.parse(JSON.stringify(ARTICLES)));
  REDO_STACK = [];
  updateUndoRedoButtons();
}
function updateUndoRedoButtons(){
  const u=document.getElementById("btn-undo");
  const r=document.getElementById("btn-redo");
  if (u) u.disabled = UNDO_STACK.length===0;
  if (r) r.disabled = REDO_STACK.length===0;
}
function markDirty(on=true){
  PENDING_DIRTY = on;
  const saveAllBtn = document.getElementById("draft-saveall");
  if (saveAllBtn) saveAllBtn.disabled = !PENDING_DIRTY;
  const tgl = document.getElementById("draft-toggle");
  if (tgl) {
    tgl.textContent = `📝 Mode brouillon : ${DRAFT_MODE ? "ON" : "OFF"}`;
    tgl.classList.toggle("on", DRAFT_MODE);
  }
}

/* ========= PARSEUR ROBUSTE ========= */
function stripAccents(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function normalizeHeader(h) {
  const t = stripAccents((h||"").trim()).replace(/\s+/g," ").replace(/[’']/g,"'").toLowerCase();
  if (t==="annee" || t==="année") return "Année";
  if (t==="numero" || t==="numéro" || t==="n°" || t==="no") return "Numéro";
  if (t.startsWith("titre")) return "Titre";
  if (t==="page" || t==="pages" || t==="page(s)") return "Page(s)";
  if (t.startsWith("auteur")) return "Auteur(s)";
  if (t.startsWith("ville")) return "Ville(s)";
  if (t.startsWith("theme") || t.startsWith("thème")) return "Theme(s)";
  if (t==="epoque" || t==="époque" || t==="periode" || t==="période") return "Epoque";
  return (h||"").trim();
}
function parseCsvFlexible(text) {
  if (!text) return [];
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  if (!text.endsWith("\n")) text += "\n";

  const res = Papa.parse(text, {
    header: true, skipEmptyLines: "greedy",
    delimiter: "", newline: "", transformHeader: normalizeHeader
  });

  const rows = (res.data || []).map(row => ({
    "Année":     row["Année"]    ?? row["annee"] ?? "",
    "Numéro":    row["Numéro"]   ?? row["numero"] ?? "",
    "Titre":     row["Titre"]    ?? "",
    "Page(s)":   row["Page(s)"]  ?? row["Pages"] ?? "",
    "Auteur(s)": row["Auteur(s)"]?? row["Auteurs"] ?? "",
    "Ville(s)":  row["Ville(s)"] ?? row["Villes"] ?? "",
    "Theme(s)":  row["Theme(s)"] ?? row["Thème(s)"] ?? row["Themes"] ?? "",
    "Epoque":    row["Epoque"]   ?? row["Période"] ?? row["Periode"] ?? ""
  }));

  return rows.filter(r => Object.values(r).some(v => (v ?? "").toString().trim() !== ""));
}

/* ========= RESET FILTRES ========= */
function resetFiltersUI() {
  const fA = document.getElementById("filter-annee");
  const fN = document.getElementById("filter-numero");
  const s  = document.getElementById("search");
  const l  = document.getElementById("limit");
  if (fA) fA.value = "";
  if (fN) fN.value = "";
  if (s)  s.value  = "";
  if (l)  l.value  = "50";
  currentPage = 1;
}

/* ========= LECTURE PUBLIQUE (RAW) ========= */
async function probePublicAndLoad() {
  try {
    const r = await fetch(`${RAW_URL}?ts=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) {
      document.getElementById("articles-body").innerHTML = `<tr><td colspan="9">Erreur RAW: ${r.status}</td></tr>`;
      setBadge("status-repo", false); setBadge("status-branch", false); setBadge("status-file", false);
      return;
    }
    const text = await r.text();
    ARTICLES = parseCsvFlexible(text);
    populateFilters();
    populateDatalists();
    resetFiltersUI();
    render();
    setBadge("status-repo", true);
    setBadge("status-branch", true);
    setBadge("status-file", true, ` (${ARTICLES.length})`);
  } catch (e) {
    console.error(e);
    document.getElementById("articles-body").innerHTML = `<tr><td colspan="9">Impossible de charger les données.</td></tr>`;
    setBadge("status-repo", false); setBadge("status-branch", false); setBadge("status-file", false);
  }
}
window._reloadRaw = async ()=>{ await probePublicAndLoad(); };

/* ========= LECTURE FRAÎCHE (API) ========= */
async function loadFreshFromAPI(){
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const headers = { "Accept":"application/vnd.github+json" };
  if (GHTOKEN) headers.Authorization = `token ${GHTOKEN}`;

  const r = await fetch(url, { headers, cache: "no-store" });
  if (!r.ok) throw new Error(`API GET ${r.status}`);
  const j = await r.json();
  const csv = decodeB64(j.content || "");
  ARTICLES = parseCsvFlexible(csv);
  populateFilters();
  populateDatalists();
  currentPage = 1;
  render();
  setBadge("status-file", true, ` (${ARTICLES.length})`);
}

/* ========= UI ========= */
function populateFilters(){
  const an=document.getElementById("filter-annee");
  const nu=document.getElementById("filter-numero");
  if (an) an.innerHTML = `<option value="">(toutes)</option>` + uniqSorted(ARTICLES.map(r=>r["Année"])).map(v=>`<option>${v}</option>`).join("");
  if (nu) nu.innerHTML = `<option value="">(tous)</option>`   + uniqSorted(ARTICLES.map(r=>r["Numéro"])).map(v=>`<option>${v}</option>`).join("");
}

/* Dédoublonnage intelligent pour Epoque + dédupe auteurs/villes/thèmes */
function populateDatalists(){
  const fill = (id, values) => {
    const el = document.getElementById(id);
    if (!el) return;
    const opts = values.map(v=>`<option value="${String(v).replaceAll('"','&quot;')}">`).join("");
    el.innerHTML = opts;
  };

  // utilitaires
  const stripAcc = s => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g,"");
  const canon = s => stripAcc(String(s||"").trim()).replace(/\s+/g," ").toLowerCase();

  // Epoque : garder la première forme rencontrée, dédoublonner par canon
  const epoquesCanonMap = new Map();
  for (const r of ARTICLES){
    const raw = r["Epoque"];
    if (!raw) continue;
    const c = canon(raw);
    if (!c) continue;
    if (!epoquesCanonMap.has(c)) epoquesCanonMap.set(c, raw.trim());
  }
  const epoquesVals = Array.from(epoquesCanonMap.values());
  epoquesVals.sort((a,b)=>{
    const na = parseInt(String(a).match(/\d{3,4}/)?.[0]||"",10);
    const nb = parseInt(String(b).match(/\d{3,4}/)?.[0]||"",10);
    if (!isNaN(na) && !isNaN(nb)) return na - nb;
    return (""+a).localeCompare(""+b, "fr", { sensitivity:"base" });
  });

  // Auteurs/Villes/Thèmes : split + set (on garde la forme d’origine)
  const uniqFromSplit = arr => {
    const seen = new Set();
    const out  = [];
    for (const v of arr) {
      for (const piece of splitMulti(v)) {
        const key = canon(piece);
        if (key && !seen.has(key)) { seen.add(key); out.push(piece.trim()); }
      }
    }
    return uniqSorted(out);
  };

  fill("dl-annee",   uniqSorted(ARTICLES.map(r=> (r["Année"]||"").toString().trim()).filter(Boolean)));
  fill("dl-numero",  uniqSorted(ARTICLES.map(r=> (r["Numéro"]||"").toString().trim()).filter(Boolean)));
  fill("dl-auteurs", uniqFromSplit(ARTICLES.map(r=>r["Auteur(s)"]||"")));
  fill("dl-villes",  uniqFromSplit(ARTICLES.map(r=>r["Ville(s)"]||"")));
  fill("dl-themes",  uniqFromSplit(ARTICLES.map(r=>r["Theme(s)"]||"")));
  fill("dl-epoque",  epoquesVals);
}

function applyFiltersSortPaginate(){
  const term=(document.getElementById("search")?.value||"").toLowerCase();
  const an=document.getElementById("filter-annee")?.value||"";
  const nu=document.getElementById("filter-numero")?.value||"";

  let data = ARTICLES.map((r,i)=>({ ...r, __idx:i }))
    .filter(r=>{
      const okS=!term||Object.values(r).some(v=> (v||"").toString().toLowerCase().includes(term));
      const okA=!an||r["Année"]===an;
      const okN=!nu||r["Numéro"]===nu;
      return okS&&okA&&okN;
    });

  let col = sortCol, dir = sortDir;
  if (!col){ col = "Année"; dir = "desc"; } // récents d'abord

  if (col){
    const factor = dir === "asc" ? 1 : -1;
    const asNum = v => {
      const n = parseInt(String(v).replace(/[^\d-]/g,""), 10);
      return isNaN(n) ? null : n;
    };
    const numericCols = new Set(["Année","Numéro"]);
    data.sort((a,b)=>{
      if (numericCols.has(col)) {
        const na = asNum(a[col]), nb = asNum(b[col]);
        if (na!==null && nb!==null) return (na-nb)*factor;
      }
      return (""+a[col]).localeCompare(""+b[col], "fr", { sensitivity:"base" })*factor;
    });
  }

  const limit=document.getElementById("limit")?.value||"50";
  const per=(limit==="all")?data.length:parseInt(limit,10);
  const start=(currentPage-1)*per;
  return {data,page:data.slice(start,start+per),total:data.length,per};
}

function render(){
  const tb=document.getElementById("articles-body"); if(!tb) return;
  const {page,total,per}=applyFiltersSortPaginate();
  if (!page.length) { tb.innerHTML=`<tr><td colspan="9">Aucun article trouvé.</td></tr>`; }
  else {
    tb.innerHTML = page.map(r=>{
      const editing = EDIT_INLINE_IDX === r.__idx;
      if (!editing) {
        
        return `
          <tr class="row" ondblclick="window._inlineEdit?.(${r.__idx})" onclick="window._editRow?.(${r.__idx})">
            <td data-label="Année" class="col-annee">${r["Année"]||""}</td>
            <td data-label="Numéro" class="col-numero">${r["Numéro"]||""}</td>
            <td data-label="Titre" class="col-titre">${r["Titre"]||""}</td>
            <td data-label="Page(s)" class="col-pages">${r["Page(s)"]||""}</td>
            <td data-label="Auteur(s)" class="col-auteurs">${r["Auteur(s)"]||""}</td>
            <td data-label="Ville(s)" class="col-villes">${r["Ville(s)"]||""}</td>
            <td data-label="Thème(s)" class="col-themes">${r["Theme(s)"]||""}</td>
            <td data-label="Période" class="col-epoque">${r["Epoque"]||""}</td>
            <td class="actions" data-label="Actions">
              <button class="edit" onclick="window._inlineEdit?.($${r.__idx})" aria-label="Modifier la ligne">✎</button>
              <button class="del"  onclick="window._deleteRow?.($${r.__idx})" aria-label="Supprimer la ligne">🗑</button>
            </td>
          </tr>
        `;
    
      } else {
        const d = EDIT_INLINE_DRAFT;
        const input = (id,val,list="") =>
          `<input id="${id}" value="${(val??"").toString().replaceAll('"','&quot;')}" ${list?`list="${list}"`:""} class="cell-input">`;
        return `
          <tr class="editing">
            <td>${input("ei-annee", d["Année"], "dl-annee")}</td>
            <td>${input("ei-numero", d["Numéro"], "dl-numero")}</td>
            <td>${input("ei-titre", d["Titre"])}</td>
            <td>${input("ei-pages", d["Page(s)"])}</td>
            <td>${input("ei-auteurs", d["Auteur(s)"], "dl-auteurs")}</td>
            <td>${input("ei-villes", d["Ville(s)"], "dl-villes")}</td>
            <td>${input("ei-themes", d["Theme(s)"], "dl-themes")}</td>
            <td>${input("ei-epoque", d["Epoque"], "dl-epoque")}</td>
            <td class="actions">
              <button class="edit" onclick="window._inlineSave?.()">💾</button>
              <button class="del"  onclick="window._inlineCancel?.()">✖</button>
            </td>
          </tr>
        `;
      }
    }).join("");
  }
  const max=Math.max(1, Math.ceil(total/(per||1)));
  document.getElementById("pageinfo").textContent=`Page ${currentPage} / ${max} — ${total} résultats`;
  document.getElementById("prev").disabled=currentPage<=1;
  document.getElementById("next").disabled=currentPage>=max;
}

/* ========= LOGIN / LOGOUT ========= */
async function githubLoginInline(){
  const t=prompt("Collez votre token GitHub (scope public_repo si repo public) :");
  if (!t) return;
  GHTOKEN=t.trim();
  localStorage.setItem("ghtoken", GHTOKEN);
  setBadge("status-auth", true);
  alert("Connecté à GitHub ✅");
}
window._login  = async ()=>{ try{ await githubLoginInline(); }catch(e){ alert(e); } };
window._logout = ()=>{ localStorage.removeItem("ghtoken"); GHTOKEN=null; setBadge("status-auth", false); alert("Déconnecté."); };

/* ========= SAVE (anti‑409 retry+merge) ========= */
async function saveToGitHubMerged(newRow){
  if (!GHTOKEN){ alert("🔐 Connectez-vous d’abord."); throw new Error("no token"); }

  const headers = {
    Authorization: `token ${GHTOKEN}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };
  const url    = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const branch = GITHUB_BRANCH;

  const key = r => [r["Année"], r["Numéro"], r["Titre"]]
                    .map(v => (v||"").toLowerCase().trim())
                    .join("¦");

  showLoading(true);
  try {
    for (let attempt = 1; attempt <= 5; attempt++) {
      // 1) Lire dernière version
      let sha = null, remoteRows = [];
      const get = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });

      if (get.status === 404) remoteRows = [];
      else if (get.ok) {
        const j   = await get.json(); sha = j.sha;
        const csv = decodeB64(j.content); remoteRows = parseCsvFlexible(csv);
      } else {
        const body = await get.text(); throw new Error(`GET ${get.status}\n${body}`);
      }

      // 2) Fusion (anti-doublon)
      const seen   = new Set(remoteRows.map(key));
      const merged = [...remoteRows];
      if (newRow && !seen.has(key(newRow))) merged.push(newRow);

      // 3) Commit
      const body = {
        message: sha ? "maj UI (merge append)" : "init + ajout",
        content: encodeB64(toCSV(merged)),
        branch, ...(sha ? { sha } : {})
      };

      const put = await fetch(url, { method:"PUT", headers, body: JSON.stringify(body) });
      if (put.ok) {
        try { await loadFreshFromAPI(); } catch { await probePublicAndLoad(); }
        alert(`Enregistré ✅`);
        return;
      }
      if (put.status === 409) { await sleep(300*attempt); continue; }
      const errTxt = await put.text(); throw new Error(`PUT ${put.status}\n${errTxt}`);
    }
    throw new Error("Conflit 409 persistant après 5 tentatives.");
  } finally {
    showLoading(false);
  }
}

/* ========= Enregistrer tout ========= */
async function saveAllRowsToGithub(rows, message="commit groupé"){
  if (!GHTOKEN){ alert("🔐 Connectez-vous d’abord."); throw new Error("no token"); }
  const headers = { Authorization:`token ${GHTOKEN}`, "Accept":"application/vnd.github+json", "Content-Type":"application/json" };
  const url    = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const branch = GITHUB_BRANCH;

  showLoading(true);
  try {
    for (let attempt=1; attempt<=5; attempt++){
      let sha=null;
      const get = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
      if (get.status===404) sha=null;
      else if (get.ok){ const j=await get.json(); sha=j.sha; }
      else { throw new Error(`GET ${get.status}\n${await get.text()}`); }

      const body = { message, content: encodeB64(toCSV(rows)), branch, ...(sha?{sha}:{}) };
      const put  = await fetch(url, { method:"PUT", headers, body: JSON.stringify(body) });
      if (put.ok){
        try { await loadFreshFromAPI(); } catch { await probePublicAndLoad(); }
        return;
      }
      if (put.status===409){ await sleep(250*attempt); continue; }
      throw new Error(`PUT ${put.status}\n${await put.text()}`);
    }
    throw new Error("Conflit 409 persistant.");
  } finally { showLoading(false); }
}

/* ========= INIT CSV ========= */
async function initCsvIfMissing(){
  if (!GHTOKEN){ alert("🔐 Connectez-vous d’abord."); return; }
  const headers = { Authorization:`token ${GHTOKEN}`, "Accept":"application/vnd.github+json", "Content-Type":"application/json" };
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const get = await fetch(`${url}?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (get.ok){ alert("Le fichier existe déjà — aucune action."); return; }
  if (get.status!==404){ const t=await get.text(); alert(`Erreur: ${get.status}\n${t}`); return; }
  const body = { message:"init: create data/articles.csv", content: encodeB64(HEADERS.join(",")+"\n"), branch:GITHUB_BRANCH };
  const put = await fetch(url, { method:"PUT", headers, body: JSON.stringify(body) });
  if (!put.ok){ const t=await put.text(); alert(`Création KO: ${put.status}\n${t}`); return; }
  alert("CSV initialisé ✅"); await loadFreshFromAPI().catch(probePublicAndLoad);
}

/* ========= ÉDITION INLINE / SUPPRESSION ========= */
window._inlineEdit = (idx) => {
  EDIT_INLINE_IDX = idx;
  EDIT_INLINE_DRAFT = { ...ARTICLES[idx] };
  render();
  setTimeout(()=> document.getElementById("ei-titre")?.focus(), 0);
};
window._inlineCancel = () => {
  EDIT_INLINE_IDX = null;
  EDIT_INLINE_DRAFT = null;
  render();
};
window._inlineSave = async () => {
  if (EDIT_INLINE_IDX==null) return;
  const get = id => document.getElementById(id)?.value?.trim() || "";
  const updated = {
    "Année":   get("ei-annee"),
    "Numéro":  get("ei-numero"),
    "Titre":   get("ei-titre"),
    "Page(s)": get("ei-pages"),
    "Auteur(s)":get("ei-auteurs"),
    "Ville(s)": get("ei-villes"),
    "Theme(s)": get("ei-themes"),
    "Epoque":   get("ei-epoque")
  };
  if (!updated["Titre"]) { alert("Le champ Titre est obligatoire."); return; }

  const key = r => [r["Année"], r["Numéro"], r["Titre"]].map(v=>(v||"").toLowerCase()).join("¦");
  const newKey = key(updated);
  for (let i=0;i<ARTICLES.length;i++){
    if (i===EDIT_INLINE_IDX) continue;
    if (key(ARTICLES[i])===newKey){ alert("Doublon détecté (Année+Numéro+Titre)."); return; }
  }

  pushUndo();
  ARTICLES[EDIT_INLINE_IDX] = updated;
  EDIT_INLINE_IDX = null; EDIT_INLINE_DRAFT = null;
  render(); populateDatalists(); updateUndoRedoButtons();

  if (!GHTOKEN){ alert("Modifié localement. Cliquez 🔐 pour enregistrer ensuite."); return; }
  if (DRAFT_MODE){ markDirty(true); return; }
  try {
    showLoading(true);
    await saveAllRowsToGithub(ARTICLES, "maj UI (édition inline)");
  } catch(e){
    alert("Échec sauvegarde : " + (e?.message||e));
  } finally {
    showLoading(false);
  }
};

window._delete = async (idx) => {
  try{
    const r = ARTICLES[idx];
    if (!r) return;

    const ok = confirm(`Supprimer cet article ?\n\n${r["Année"]||""} • ${r["Numéro"]||""}\n${r["Titre"]||""}`);
    if (!ok) return;

    // 1) Suppression locale + UI
    pushUndo();
    ARTICLES.splice(idx,1);
    render(); populateDatalists(); updateUndoRedoButtons();

    // 2) Pas de token => local uniquement
    if (!GHTOKEN){
      alert("Supprimé localement. Cliquez 🔐 puis « Enregistrer tout » pour committer.");
      return;
    }

    // 3) Mode brouillon => marquer comme modifié, pas de commit immédiat
    if (DRAFT_MODE){
      markDirty(true);
      alert("Suppression stockée en brouillon. Cliquez « Enregistrer tout » pour committer.");
      return;
    }

    // 4) Commit complet (anti‑409) + reload frais
    showLoading(true);
    await saveAllRowsToGithub(ARTICLES, "maj UI (suppression)");
    try { await loadFreshFromAPI(); } catch { await probePublicAndLoad(); }
    alert("Enregistré ✅");
  } catch(e){
    console.error(e);
    alert("Échec suppression : " + (e?.message||e));
  } finally {
    showLoading(false);
  }
};

/* ========= AJOUT (réutilisé par le modal) ========= */
window._add = async (ev)=>{ try{
  if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
  const get=id=>document.getElementById(id)?.value?.trim()||"";
  const row={ "Année":get("add-annee"), "Numéro":get("add-numero"), "Titre":get("add-titre"),
              "Page(s)":get("add-pages"), "Auteur(s)":get("add-auteurs"), "Ville(s)":get("add-villes"),
              "Theme(s)":get("add-themes"), "Epoque":get("add-epoque") };
  if (!row["Titre"]) { alert("Le champ Titre est obligatoire."); return; }

  const key = r => [r["Année"], r["Numéro"], r["Titre"]].map(v=>(v||"").toLowerCase()).join("¦");
  if (ARTICLES.some(r=>key(r)===key(row))) { alert("Doublon (Année+Numéro+Titre) — ajout annulé."); return; }

  pushUndo();
  ARTICLES.unshift(row); currentPage=1; render(); populateDatalists(); updateUndoRedoButtons();

  if (!GHTOKEN){ alert("Ajout local OK. Cliquez 🔐 puis « Enregistrer tout » pour committer."); return; }
  if (DRAFT_MODE){ markDirty(true); alert("Ajout stocké en brouillon. Cliquez « Enregistrer tout » pour committer."); return; }

  const btn=document.getElementById("add-btn"); if (btn) btn.disabled=true;
  try { await saveToGitHubMerged(row); }
  finally { if (btn) btn.disabled=false; }
} catch(e){ alert("Add: "+(e?.message||e)); } };

/* ========= MODE BROUILLON / SAVE ALL / SNAPSHOT ========= */
window._toggleDraft = ()=>{
  DRAFT_MODE = !DRAFT_MODE;
  const tgl = document.getElementById("draft-toggle");
  if (tgl) {
    tgl.textContent = `📝 Mode brouillon : ${DRAFT_MODE ? "ON" : "OFF"}`;
    tgl.classList.toggle("on", DRAFT_MODE);
  }
  const saveAllBtn = document.getElementById("draft-saveall");
  if (saveAllBtn) saveAllBtn.disabled = !PENDING_DIRTY;
  alert(DRAFT_MODE
    ? "Mode brouillon activé : vos changements restent locaux. Cliquez « Enregistrer tout » pour committer."
    : "Mode brouillon désactivé : les actions peuvent committer immédiatement.");
};

window._saveAll = async ()=>{
  if (!PENDING_DIRTY){ alert("Aucun changement à enregistrer."); return; }
  if (!GHTOKEN){ alert("🔐 Connectez-vous d’abord pour committer."); return; }
  try{
    showLoading(true);
    await saveAllRowsToGithub(ARTICLES, "commit groupé (mode brouillon)");
    UNDO_STACK=[]; REDO_STACK=[]; updateUndoRedoButtons(); markDirty(false);
    alert("Toutes les modifications locales ont été enregistrées ✅");
  } catch(e){
    alert("Échec de l’enregistrement groupé : " + (e?.message||e));
  } finally { showLoading(false); }
};

window._snapshot = ()=>{
  if (!SNAPSHOT_ENABLED) {
    alert("La fonction Snapshot est désactivée.");
    return;
  }
};

/* ========= MODAL D’AJOUT ========= */
function openModal(){
  const ov = document.getElementById("add-modal");
  if (!ov) return;
  ov.classList.remove("hidden");
  ov.setAttribute("aria-hidden", "false");

  // focus 1er champ
  setTimeout(()=> document.getElementById("add-annee")?.focus(), 0);

  // auto-normalisation légère sur Epoque (capitalise 1re lettre) au blur
  const epochInput = document.getElementById("add-epoque");
  if (epochInput){
    epochInput.addEventListener("blur", ()=>{
      let v = epochInput.value.trim();
      if (!v) return;
      epochInput.value = v.charAt(0).toUpperCase() + v.slice(1);
    }, { once:false });
  }

  // fermer en cliquant à l’extérieur
  const onClickOutside = (e)=>{ if (e.target === ov) { window._closeAddModal(); } };
  ov.addEventListener("click", onClickOutside, { once:true });

  // fermer avec Echap
  const onKey = (e)=>{ if (e.key === "Escape") { window._closeAddModal(); } };
  document.addEventListener("keydown", onKey, { once:true });
}
function closeModal(){
  const ov = document.getElementById("add-modal");
  if (!ov) return;
  ov.classList.add("hidden");
  ov.setAttribute("aria-hidden", "true");
}
window._openAddModal  = ()=> openModal();
window._closeAddModal = ()=> closeModal();

window._submitAddModal = async ()=>{
  const titre = document.getElementById("add-titre")?.value?.trim() || "";
  if (!titre) { alert("Le champ Titre est obligatoire."); document.getElementById("add-titre")?.focus(); return; }
  try{
    await window._add?.(); // lit les champs #add-...
    closeModal();
    ["add-annee","add-numero","add-titre","add-pages","add-auteurs","add-villes","add-themes","add-epoque"]
      .forEach(id=>{ const el=document.getElementById(id); if (el) el.value=""; });
  }catch(e){ console.warn(e); }
};

/* ========= EVENTS ========= */
document.addEventListener("DOMContentLoaded", async ()=>{
  await probePublicAndLoad();
  document.getElementById("prev")?.addEventListener("click", ()=>{ currentPage=Math.max(1,currentPage-1); render(); });
  document.getElementById("next")?.addEventListener("click", ()=>{ currentPage=currentPage+1; render(); });
  document.getElementById("filter-annee")?.addEventListener("change", ()=>{ document.getElementById("filter-numero").value=""; currentPage=1; render(); });
  document.getElementById("filter-numero")?.addEventListener("change", ()=>{ document.getElementById("filter-annee").value=""; currentPage=1; render(); });
  document.getElementById("limit")?.addEventListener("change", ()=>{ currentPage=1; render(); });
  document.getElementById("search")?.addEventListener("input", ()=>{ currentPage=1; render(); });

  document.querySelectorAll("th[data-col]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const col=th.getAttribute("data-col");
      if (sortCol===col) sortDir = (sortDir==="asc")?"desc":"asc"; else { sortCol=col; sortDir="asc"; }
      currentPage=1; render();
    });
  });

  // Raccourcis clavier pour édition inline
  document.addEventListener("keydown", (e)=>{
    if (EDIT_INLINE_IDX==null) return;
    if (e.key==="Enter") { e.preventDefault(); window._inlineSave?.(); }
    if (e.key==="Escape") { e.preventDefault(); window._inlineCancel?.(); }
  });

  updateUndoRedoButtons();
  markDirty(false);
  setBadge("status-auth", !!GHTOKEN);
});


// ===== Aide (modal) =====
document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("help-btn");
  const ov  = document.getElementById("help-modal");
  const closeBtn = document.getElementById("help-close");
  const okBtn = document.getElementById("help-ok");
  if (btn && ov){
    btn.addEventListener("click", ()=>{ ov.classList.remove("hidden"); ov.setAttribute("aria-hidden","false"); });
  }
  const close = ()=>{ if (!ov) return; ov.classList.add("hidden"); ov.setAttribute("aria-hidden","true"); };
  if (closeBtn) closeBtn.addEventListener("click", close);
  if (okBtn) okBtn.addEventListener("click", close);
  if (ov) ov.addEventListener("click", (e)=>{ if (e.target===ov) close(); });
  document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") close(); });
});


function rebuildNumeroOptions(selectedYear){
  const nu = document.getElementById("filter-numero");
  if (!nu) return;
  // Collect numbers from full ARTICLES dataset
  const vals = ARTICLES
    .filter(r => !selectedYear || r["Année"] === selectedYear)
    .map(r => (r["Numéro"]||"").toString().trim())
    .filter(Boolean);
  const uniq = [...new Set(vals)].sort((a,b)=>(""+a).localeCompare(""+b,"fr",{numeric:true,sensitivity:"base"}));
  const current = nu.value;
  nu.innerHTML = '<option value="">(tous)</option>' + uniq.map(v=>`<option>${v}</option>`).join("");
  // If previous selection still valid, keep it
  if (current && (!selectedYear || uniq.includes(current))) nu.value = current;
  else nu.value = "";
}
