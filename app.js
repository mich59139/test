async function loadCSV(file) {
  const resp = await fetch(file);
  const text = (await resp.text()).trim();
  const lines = text.split(/\r?\n/);
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map(h => h.trim());
  const data = lines.slice(1).map(line => {
    const values = line.split(separator);
    return values.map(v => v ? v.trim() : "");
  });
  return {headers, data};
}

function getUniqueColumnValues(data, index) {
  return [...new Set(data.map(row => row[index]).filter(Boolean).flatMap(v => v.split(",").map(s => s.trim())))]
    .sort((a, b) => a.localeCompare(b, "fr"));
}

async function init() {
  const {headers, data} = await loadCSV("articles.csv");
  let table = null;
  $(document).ready(function () {
    table = $('#articlesTable').DataTable({
      data: data,
      columns: headers.map(h => ({title: h})),
      pageLength: 50,
      lengthMenu: [[50, 100, -1], [50, 100, "Toutes"]],
      language: {
        url: "https://cdn.datatables.net/plug-ins/1.13.6/i18n/fr-FR.json"
      }
    });

    // Remplir les listes pour le formulaire d'ajout
    const idxAuteur = headers.indexOf("Auteur(s)");
    const idxVille = headers.indexOf("Ville(s)");
    const idxTheme = headers.indexOf("Theme(s)");
    ["addAuteur", "addVille", "addTheme"].forEach((id, idx) => {
      const arr =
        idx === 0 ? getUniqueColumnValues(data, idxAuteur)
        : idx === 1 ? getUniqueColumnValues(data, idxVille)
        : getUniqueColumnValues(data, idxTheme);
      const sel = document.getElementById(id);
      if (sel) {
        sel.innerHTML = '';
        arr.forEach(val => {
          const opt = document.createElement("option");
          opt.value = val; opt.text = val;
          sel.add(opt);
        });
      }
    });

    $("#showAddForm").on("click", function() {
      $("#addFormContainer").show();
    });
    $("#cancelAdd").on("click", function() {
      $("#addFormContainer").hide();
    });
    $("#addForm").on("submit", function(e){
      e.preventDefault();
      const fd = new FormData(e.target);
      const newRow = [
        fd.get("Année"),
        fd.get("Numéro"),
        fd.get("Titre"),
        fd.get("Page(s)"),
        fd.get("Auteur(s)"),
        fd.get("Ville(s)"),
        fd.get("Theme(s)"),
        fd.get("Epoque")
      ];
      table.row.add(newRow).draw();
      e.target.reset();
      $("#addFormContainer").hide();
    });
  });
}

window.onload = init;
