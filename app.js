/* ========= CONFIG ========= */
const GITHUB_OWNER  = "mich59139";
const GITHUB_REPO   = "test";
const GITHUB_BRANCH = "main";
const CSV_PATH      = "data/articles.csv";

/* ========= DEBUG HEADER ========= */
document.addEventListener("DOMContentLoaded", () => {
  const dbg = document.createElement("div");
  dbg.style.padding = "8px";
  dbg.style.background = "#ffe7ba";
  dbg.style.border = "1px solid #ccc";
  dbg.style.fontSize = "14px";
  dbg.innerHTML = `
    <b>Config effective</b> :
    owner=<code>${GITHUB_OWNER}</code> |
    repo=<code>${GITHUB_REPO}</code> |
    branch=<code>${GITHUB_BRANCH}</code> |
    path=<code>${CSV_PATH}</code>
    <br>Test Repo: <span id="dbg-repo">...</span>
    | Test Branch: <span id="dbg-branch">...</span>
    | Test File: <span id="dbg-file">...</span>
  `;
  document.body.prepend(dbg);
  runDebugChecks();
});

async function runDebugChecks() {
  const repoUrl   = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;
  const branchUrl = `${repoUrl}/branches/${encodeURIComponent(GITHUB_BRANCH)}`;
  const fileUrl   = `${repoUrl}/contents/${CSV_PATH}?ref=${encodeURIComponent(GITHUB_BRANCH)}`;

  console.log("[DEBUG] Repo URL:", repoUrl);
  console.log("[DEBUG] Branch URL:", branchUrl);
  console.log("[DEBUG] File URL:", fileUrl);

  // Repo test
  const repoRes = await fetch(repoUrl);
  document.getElementById("dbg-repo").textContent = repoRes.status;
  
  // Branch test
  const brRes = await fetch(branchUrl);
  document.getElementById("dbg-branch").textContent = brRes.status;

  // File test
  const fileRes = await fetch(fileUrl);
  document.getElementById("dbg-file").textContent = fileRes.status;

  if (repoRes.ok && brRes.ok && fileRes.ok) {
    console.log("[DEBUG] Tous les accès sont OK → chargement du CSV...");
    loadCsvFromApi();
  } else {
    console.warn("[DEBUG] Un ou plusieurs accès échouent. Pas de chargement CSV.");
  }
}

/* ========= TON CHARGEMENT CSV EXISTANT ========= */
async function loadCsvFromApi() {
  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${CSV_PATH}`;
  console.log("[DEBUG] Chargement depuis RAW:", rawUrl);
  const res = await fetch(rawUrl);
  if (!res.ok) {
    console.error("[DEBUG] Erreur RAW:", res.status);
    return;
  }
  const csvText = await res.text();
  console.log("[DEBUG] CSV chargé:", csvText.slice(0,200), "...");
  // Ici, tu mets ton code actuel qui parse et affiche la table
}
