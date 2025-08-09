// === Config dépôt ===
const OWNER = "mich59139";
const REPO  = "test";
const BRANCH = "main";
const CSV_PATH = "data/articles.csv";

// === URLs ===
const RAW_URL = `https://raw.githubusercontent.com/${OWNER}/${REPO}/${BRANCH}/${CSV_PATH}?` + Date.now();
const API_CONTENTS_URL = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${CSV_PATH}`;

// === État ===
let articles = [];
let token = null;     // stocké en mémoire seulement
let latestSha = null; // sha du fichier pour PUT

// === Utils ===
const norm = s => (s ?? "").toString().replace(/\u00A0/g," ").replace(/\u200B/g,"").trim();
const deaccent = s => norm(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "");

function normalizeKeys(row){
  const out = {};
  for (const k of Object.keys(row)) {
    const nk0 = deaccent(k).replace(/\s+/g," ").replace(/[’']/g,"'");
    let nk = nk0;
    if (/^annee$/i.test(nk)) nk = "Année";
    else if (/^numero$/i.test(nk)) nk = "Numéro";
    else if (/^titre$/i.test(nk)) nk = "Titre";
    else if (/^pages?$/i.test(nk) || /^page\(s\)$/i.test(nk)) nk = "Page(s)";
    else if (/^auteurs?(\(s\))?$/i.test(nk)) nk = "Auteur(s)";
    else if (/^villes?(\(s\))?$/i.test(nk)) nk = "Ville(s)";
    else if (/^themes?(\(s\))?$/i.test(nk)) nk = "Theme(s)";
    else if (/^epoque|periode$/i.test(nk)) nk = "Epoque";
    out[nk] = norm(row[k]);
  }
  return out;
}

function csvFromRows(rows) {
  const headers = ["Année","Numéro","Titre","Page(s)","Auteur(s)","Ville(s)","Theme(s)","Epoque"];
  const lines = [headers.join(",")].concat(
    rows.map(r => headers
