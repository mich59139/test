/* ========= CONFIG ========= */
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";
const CSV_URL_BASE  = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;

let GHTOKEN = null;
let articles = [];
let currentPage = 1;
const rowsPerPage = 50;

/* ========= BADGE HELPERS ========= */
function setBadge(id, ok) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = ok ? "✅" : "❌";
    el.style.color = ok ? "green" : "red";
  }
}

/* ========= LECTURE PUBLIQUE ========= */
async function probePublicAndLoad() {
  const repoUrl   = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const branchUrl = `${repoUrl}/branches/${encodeURIComponent(GITHUB_BRANCH)}`;
  const fileUrl   = `${repoUrl}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;
  const rawUrl    = `${CSV_URL_BASE}?ts=${Date.now()}`;

  try {
    const [rRepo, rBr, rFile] = await Promise.all([
      fetch(repoUrl),
      fetch(branchUrl),
      fetch(fileUrl),
    ]);
    setBadge("status-repo",   rRepo.ok);
    setBadge("status-branch", rBr.ok);
    setBadge("status-file",   rFile.ok);

    if (rRepo.ok && rBr.ok && rFile.ok) {
      const r = await fetch(rawUrl, { cache: "no-store" });
      if (r.ok) {
        const text = await r.text();
        articles = parseCsvFlexible(text);
        populateFilters();
        populateDatalists();
        currentPage = 1;
        render();
      }
    }
  } catch (e) {
    console.error("probePublicAndLoad error", e);
  }
}

/* ========= PARSER CSV SIMPLE ========= */
function parseCsvFlexible(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const headers = lines[0].split(",");
  return lines.slice(1).map(line => {
    const cols = line.split(",");
    let obj = {};
    headers.forEach((h, i) => obj[h.trim()] = cols[i] ? cols[i].trim() : "");
    return obj;
  });
}

/* ========= RENDER TABLE ========= */
function render() {
  const tbody = document.getElementById("articles-body");
  if (!tbody) return;
  tbody.innerHTML = "";
  const start = (currentPage - 1) * rowsPerPage;
  const pageItems = articles.slice(start, start + rowsPerPage);
  if (!pageItems.length) {
    tbody.innerHTML = `<tr><td colspan="8">Aucun article trouvé.</td></tr>`;
    return;
  }
  pageItems.forEach(row => {
    const tr = document.createElement("tr");
    Object.values(row).forEach(val => {
      const td = document.createElement("td");
      td.textContent = val;
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
}

/* ========= FORM FILTERS ========= */
function populateFilters() {
  // TODO: remplir tes selects/inputs
}
function populateDatalists() {
  // TODO: remplir tes listes déroulantes
}

/* ========= CONNEXION GITHUB ========= */
async function githubLoginInline() {
  const token = prompt("Colle ton token GitHub :");
  if (token) {
    GHTOKEN = token.trim();
    localStorage.setItem("ghtoken", GHTOKEN);
  }
}

async function verifyGithubTarget() {
  if (!GHTOKEN) return;
  const headers = { Authorization: `token ${GHTOKEN}` };
  const repoUrl   = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const branchUrl = `${repoUrl}/branches/${encodeURIComponent(GITHUB_BRANCH)}`;
  const fileUrl   = `${repoUrl}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

  const [rRepo, rBr, rFile] = await Promise.all([
    fetch(repoUrl, { headers }),
    fetch(branchUrl, { headers }),
    fetch(fileUrl, { headers }),
  ]);
  setBadge("status-auth", !!GHTOKEN);
  setBadge("status-repo",   rRepo.ok);
  setBadge("status-branch", rBr.ok);
  setBadge("status-file",   rFile.ok);
}

/* ========= CREER CSV SI MANQUANT ========= */
async function initCsvIfMissing() {
  if (!GHTOKEN) { alert("Connectez-vous d’abord (🔐)."); return; }
  const headers = { Authorization:`token ${GHTOKEN}`, "Content-Type":"application/json", "Accept":"application/vnd.github+json" };
  const fileUrl = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${CSV_PATH}`;
  const get = await fetch(fileUrl + `?ref=${encodeURIComponent(GITHUB_BRANCH)}`, { headers });
  if (get.ok) { alert("Le fichier existe déjà."); return; }
  if (get.status !== 404) { alert("Erreur: "+get.status); return; }
  const header = "Année,Numéro,Titre,Page(s),Auteur(s),Ville(s),Theme(s),Epoque\n";
  const body = { message:"init: create data/articles.csv", content:btoa(unescape(encodeURIComponent(header))), branch:GITHUB_BRANCH };
  const put = await fetch(fileUrl, { method:"PUT", headers, body: JSON.stringify(body) });
  if (!put.ok) { alert("Échec création: "+put.status+"\n"+await put.text()); return; }
  alert("CSV initialisé ✅");
  await probePublicAndLoad();
}

/* ========= INIT PAGE ========= */
document.addEventListener("DOMContentLoaded", async () => {
  // Charger token si déjà stocké
  GHTOKEN = localStorage.getItem("ghtoken") || null;
  if (GHTOKEN) setBadge("status-auth", true);

  // Charger en lecture publique
  await probePublicAndLoad();

  // Bouton login
  document.getElementById("login-btn")?.addEventListener("click", async () => {
    await githubLoginInline();
    setBadge("status-auth", !!GHTOKEN);
    await verifyGithubTarget();
  });

  // Bouton init
  document.getElementById("init-btn")?.addEventListener("click", initCsvIfMissing);
});
