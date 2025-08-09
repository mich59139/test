/* ========= CONFIG ========= */
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";
// Lecture via RAW (pas d’API → pas de 403)
const RAW_URL       = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;

let GHTOKEN  = localStorage.getItem("ghtoken") || null;
let ARTICLES = [];
let currentPage = 1;
let sortCol = null, sortDir = "asc";

/* ========= UTILS ========= */
const HEADERS = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
const esc = v => { const s=(v??"").toString(); return /[",\n]/.test(s)?`"${s.replaceAll('"','""')}"`:s; };
const toCSV = rows => [HEADERS.join(",")].concat(rows.map(r=>HEADERS.map(h=>esc(r[h])).join(","))).join("\n");
const decodeB64 = b64 => decodeURIComponent(escape(atob(b64)));
const encodeB64 = str => btoa(unescape(encodeURIComponent(str)));
const setBadge = (id, ok, extra="") => { const el=document.getElementById(id); if(!el)return; el.textContent = ok?`✅${extra}`:`❌`; el.style.color = ok? "#16a34a":"#dc2626"; };
const uniqSorted = a => [...new Set(a.filter(Boolean))].sort((x,y)=>(""+x).localeCompare(""+y,"fr"));
const sleep = ms => new Promise(res => setTimeout(res, ms));

/* ========= PARSEUR ROBUSTE ========= */
function stripAccents(s){ return (s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,""); }
function normalizeHeader(h) {
  const t = stripAccents((h||"").trim()).replace(/\s+/g," ").replace(/[’']/g,"'").toLowerCase();
  if (t==="annee" || t==="année") return "Année";
  if (t==="numero" || t==="numéro" || t==="n°" || t==="no" || t==="n°/numero") return "Numéro";
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
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // BOM
  if (!text.endsWith("\n")) text += "\n";                  // ne pas perdre la dernière ligne

  const res = Papa.parse(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: "",            // auto ("," ";" "\t")
    newline: "",              // auto
    transformHeader: normalizeHeader
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

  const cleaned = rows.filter(r => Object.values(r).some(v => (v ?? "").toString().trim() !== ""));
  console.log(`[RAW] lignes: ${cleaned.length}`, { firstRow: cleaned[0], lastRow: cleaned.at(-1) });
  return cleaned;
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
      document.getElementById("articles-body").innerHTML = `<tr><td colspan="8">Erreur RAW: ${r.status}</td></tr>`;
      setBadge("status-repo", false); setBadge("status-branch", false); setBadge("status-file", false);
      return;
    }
    const text = await r.text();
    ARTICLES = parseCsvFlexible(text);
    populateFilters();
    populateDatalists();  // suggestions pour la saisie
    resetFiltersUI();
    render();
    setBadge("status-repo", true);
    setBadge("status-branch", true);
    setBadge("status-file", true, ` (${ARTICLES.length})`);
  } catch (e) {
    console.error(e);
    document.getElementById("articles-body").innerHTML = `<tr><td colspan="8">Impossible de charger les données.</td></tr>`;
    setBadge("status-repo", false); setBadge("status-branch", false); setBadge("status-file", false);
  }
}
window._reloadRaw = async ()=>{ await probePublicAndLoad(); };

/* ========= UI ========= */
function populateFilters(){
  const an=document.getElementById("filter-annee");
  const nu=document.getElementById("filter-numero");
  if (an) an.innerHTML = `<option value="">(toutes)</option>` + uniqSorted(ARTICLES.map(r=>r["Année"])).map(v=>`<option>${v}</option>`).join("");
  if (nu) nu.innerHTML = `<option value="">(tous)</option>`   + uniqSorted(ARTICLES.map(r=>r["Numéro"])).map(v=>`<option>${v}</option>`).join("");
}
function populateDatalists(){
  const fill = (id, arr) => {
    const el = document.getElementById(id);
    if (!el) return;
    const opts = uniqSorted(arr).slice(0,1000).map(v=>`<option value="${String(v).replaceAll('"','&quot;')}">`).join("");
    el.innerHTML = opts;
  };
  fill("dl-annee",   ARTICLES.map(r=>r["Année"]));
  fill("dl-numero",  ARTICLES.map(r=>r["Numéro"]));
  // éclater multi-valeurs par virgule / point-virgule
  const splitMulti = v => (v||"").split(/[;,]\s*/g).map(s=>s.trim()).filter(Boolean);
  fill("dl-auteurs", ARTICLES.flatMap(r=>splitMulti(r["Auteur(s)"])));
  fill("dl-villes",  ARTICLES.flatMap(r=>splitMulti(r["Ville(s)"])));
  fill("dl-themes",  ARTICLES.flatMap(r=>splitMulti(r["Theme(s)"])));
  fill("dl-epoque",  ARTICLES.map(r=>r["Epoque"]));
}
function applyFiltersSortPaginate(){
  const term=(document.getElementById("search")?.value||"").toLowerCase();
  const an=document.getElementById("filter-annee")?.value||"";
  const nu=document.getElementById("filter-numero")?.value||"";
  let data=ARTICLES.filter(r=>{
    const okS=!term||Object.values(r).some(v=> (v||"").toString().toLowerCase().includes(term));
    const okA=!an||r["Année"]===an;
    const okN=!nu||r["Numéro"]===nu;
    return okS&&okA&&okN;
  });
  if (sortCol){
    const dir=sortDir==="asc"?1:-1;
    data.sort((a,b)=> (""+a[sortCol]).localeCompare(""+b[sortCol],"fr")*dir);
  }
  const limit=document.getElementById("limit")?.value||"50";
  const per=(limit==="all")?data.length:parseInt(limit,10);
  const start=(currentPage-1)*per;
  return {data,page:data.slice(start,start+per),total:data.length,per};
}
function render(){
  const tb=document.getElementById("articles-body"); if(!tb) return;
  const {page,total,per}=applyFiltersSortPaginate();
  if (!page.length) { tb.innerHTML=`<tr><td colspan="8">Aucun article trouvé.</td></tr>`; }
  else {
    tb.innerHTML = page.map(r=>`
      <tr>
        <td>${r["Année"]||""}</td>
        <td>${r["Numéro"]||""}</td>
        <td>${r["Titre"]||""}</td>
        <td>${r["Page(s)"]||""}</td>
        <td>${r["Auteur(s)"]||""}</td>
        <td>${r["Ville(s)"]||""}</td>
        <td>${r["Theme(s)"]||""}</td>
        <td>${r["Epoque"]||""}</td>
      </tr>
    `).join("");
  }
  const max=Math.max(1, Math.ceil(total/(per||1)));
  document.getElementById("pageinfo").textContent=`Page ${currentPage} / ${max} — ${total} résultats`;
  document.getElementById("prev").disabled=currentPage<=1;
  document.getElementById("next").disabled=currentPage>=max;
}
function wireSorting(){
  document.querySelectorAll("th[data-col]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const col=th.getAttribute("data-col");
      if (sortCol===col) sortDir = (sortDir==="asc")?"desc":"asc"; else { sortCol=col; sortDir="asc"; }
      currentPage=1; render();
    });
  });
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

  for (let attempt = 1; attempt <= 5; attempt++) {
    // 1) Lire dernière version
    let sha = null, remoteRows = [];
    const get = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });

    if (get.status === 404) {
      remoteRows = [];
    } else if (get.ok) {
      const j   = await get.json();
      sha       = j.sha;
      const csv = decodeB64(j.content);
      remoteRows = parseCsvFlexible(csv);
    } else {
      const body = await get.text();
      throw new Error(`GET ${get.status}\n${body}`);
    }

    // 2) Fusion (anti-doublon sur Année+Numéro+Titre)
    const seen   = new Set(remoteRows.map(key));
    const merged = [...remoteRows];
    if (newRow && !seen.has(key(newRow))) merged.push(newRow);

    // 3) Commit
    const body = {
      message: sha ? "maj UI (merge append)" : "init + ajout",
      content: encodeB64(toCSV(merged)),
      branch,
      ...(sha ? { sha } : {})
    };

    const put = await fetch(url, { method:"PUT", headers, body: JSON.stringify(body) });

    if (put.ok) {
      const txt = await put.text(); let commitUrl="";
      try { commitUrl = (JSON.parse(txt)?.commit?.html_url) || ""; } catch {}
      setTimeout(async ()=>{ await probePublicAndLoad(); resetFiltersUI(); render(); }, 1000);
      alert(`Enregistré ✅${commitUrl?`\nCommit: ${commitUrl}`:""}`);
      return;
    }

    if (put.status === 409) {
      const wait = 300 * attempt; // backoff
      console.warn(`[SAVE] 409 conflit, retry dans ${wait} ms (tentative ${attempt}/5)`);
      await sleep(wait);
      continue;
    }

    const errTxt = await put.text();
    throw new Error(`PUT ${put.status}\n${errTxt}`);
  }

  throw new Error("Conflit 409 persistant après 5 tentatives.");
}

/* ========= INIT CSV SI MANQUANT ========= */
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
  alert("CSV initialisé ✅"); await probePublicAndLoad(); resetFiltersUI(); render();
}

/* ========= IMPORT / EXPORT ========= */
async function pickLocalCsvText() {
  return new Promise((resolve, reject) => {
    const input = document.getElementById("import-file");
    if (!input) return reject(new Error("input#import-file manquant"));
    input.onchange = async () => {
      const file = input.files?.[0];
      input.value = "";
      if (!file) return reject(new Error("Aucun fichier sélectionné"));
      try { resolve(await file.text()); } catch (e) { reject(e); }
    };
    input.click();
  });
}
function validateImportedRows(rows) {
  if (!Array.isArray(rows) || rows.length===0) throw new Error("CSV vide");
  const must = ["Année","Numéro","Titre"];
  const missing = must.filter(k => !(k in rows[0]));
  if (missing.length) {
    throw new Error("Colonnes manquantes: " + missing.join(", ") + 
      "\nAttendu: Année, Numéro, Titre, Page(s), Auteur(s), Ville(s), Theme(s), Epoque");
  }
}
async function saveWholeCsvToGithub(importRows, mode /* 'merge' | 'replace' */) {
  if (!GHTOKEN) { alert("🔐 Connectez-vous d’abord."); throw new Error("no token"); }

  const headers = {
    Authorization: `token ${GHTOKEN}`,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json"
  };
  const url    = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const branch = GITHUB_BRANCH;

  const key = r => [r["Année"], r["Numéro"], r["Titre"]]
                    .map(v => (v||"").toLowerCase().trim()).join("¦");

  for (let attempt=1; attempt<=5; attempt++){
    let sha=null, remote=[];
    const get = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers });
    if (get.status===404) remote=[];
    else if (get.ok){ const j=await get.json(); sha=j.sha; remote=parseCsvFlexible(decodeB64(j.content)); }
    else { throw new Error(`GET ${get.status}\n${await get.text()}`); }

    let merged=[];
    if (mode==="replace") {
      merged = importRows;
    } else {
      const seen = new Set(remote.map(key));
      merged = remote.slice();
      for (const r of importRows) if (!seen.has(key(r))) merged.push(r);
    }

    const body = {
      message: mode==="replace" ? "import: remplacement complet" : "import: fusion",
      content: encodeB64(toCSV(merged)),
      branch,
      ...(sha ? { sha } : {})
    };
    const put = await fetch(url, { method:"PUT", headers, body: JSON.stringify(body) });

    if (put.ok) {
      const txt=await put.text(); let commitUrl="";
      try { commitUrl = (JSON.parse(txt)?.commit?.html_url) || ""; } catch {}
      setTimeout(async ()=>{ await probePublicAndLoad(); resetFiltersUI(); render(); }, 1200);
      alert(`Import ${mode==="replace"?"(remplacement)": "(fusion)"} OK ✅${commitUrl?`\nCommit: ${commitUrl}`:""}`);
      return;
    }
    if (put.status===409) { const wait = 300*attempt; await sleep(wait); continue; }
    throw new Error(`PUT ${put.status}\n${await put.text()}`);
  }
  throw new Error("Conflit 409 persistant après 5 tentatives.");
}
window._importCsv = async (mode) => {
  try {
    if (!mode) mode = "merge";
    const text = await pickLocalCsvText();
    const rows = parseCsvFlexible(text);
    validateImportedRows(rows);
    const msg = mode==="replace"
      ? `⚠️ Remplacer TOUTE la base par ${rows.length} lignes ?`
      : `Fusionner ${rows.length} lignes avec la base existante ?`;
    if (!confirm(msg)) return;
    await saveWholeCsvToGithub(rows, mode);
  } catch(e) {
    console.error("[IMPORT]", e);
    alert("Échec import : " + (e?.message || e));
  }
};
window._exportCsv = ()=> {
  const blob = new Blob([toCSV(ARTICLES||[])], {type:"text/csv;charset=utf-8"});
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "articles_export.csv";
  a.click();
  URL.revokeObjectURL(a.href);
};

/* ========= HANDLERS GLOBAUX (onclick HTML) ========= */
window._save = async ()=>{ try{
  if (!ARTICLES.length){ alert("Rien à enregistrer."); return; }
  await saveToGitHubMerged(ARTICLES[0]);
} catch(e){ alert("Save: "+(e?.message||e)); } };

window._init = async ()=>{ try{ await initCsvIfMissing(); }catch(e){ alert("Init: "+e.message); } };

window._add = async (ev)=>{ try{
  if (ev && typeof ev.preventDefault === "function") ev.preventDefault();
  const get=id=>document.getElementById(id)?.value?.trim()||"";
  const row={ "Année":get("add-annee"), "Numéro":get("add-numero"), "Titre":get("add-titre"),
              "Page(s)":get("add-pages"), "Auteur(s)":get("add-auteurs"), "Ville(s)":get("add-villes"),
              "Theme(s)":get("add-themes"), "Epoque":get("add-epoque") };
  if (!row["Titre"]) { alert("Le champ Titre est obligatoire."); return; }
  ARTICLES.unshift(row); currentPage=1; render();
  if (!GHTOKEN){ alert("Ajout local OK. Pour enregistrer, cliquez 🔐 puis réessayez."); return; }
  const btn=document.getElementById("add-btn"); if (btn) btn.disabled=true;
  try { await saveToGitHubMerged(row); }
  finally { if (btn) btn.disabled=false; }
} catch(e){ alert("Add: "+(e?.message||e)); } };

/* ========= EVENTS ========= */
document.addEventListener("DOMContentLoaded", async ()=>{
  await probePublicAndLoad();
  document.getElementById("prev")?.addEventListener("click", ()=>{ currentPage=Math.max(1,currentPage-1); render(); });
  document.getElementById("next")?.addEventListener("click", ()=>{ currentPage=currentPage+1; render(); });
  document.getElementById("filter-annee")?.addEventListener("change", ()=>{ document.getElementById("filter-numero").value=""; currentPage=1; render(); });
  document.getElementById("filter-numero")?.addEventListener("change", ()=>{ document.getElementById("filter-annee").value=""; currentPage=1; render(); });
  document.getElementById("limit")?.addEventListener("change", ()=>{ currentPage=1; render(); });
  document.getElementById("search")?.addEventListener("input", ()=>{ currentPage=1; render(); });

  // Tri
  document.querySelectorAll("th[data-col]").forEach(th=>{
    th.addEventListener("click", ()=>{
      const col=th.getAttribute("data-col");
      if (sortCol===col) sortDir = (sortDir==="asc")?"desc":"asc"; else { sortCol=col; sortDir="asc"; }
      currentPage=1; render();
    });
  });

  setBadge("status-auth", !!GHTOKEN);
});
