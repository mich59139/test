async function loadCSV(file) {
  const resp = await fetch(file);
  const text = (await resp.text()).trim();
  const lines = text.split(/\r?\n/);
  const separator = lines[0].includes(";") ? ";" : ",";
  const headers = lines[0].split(separator).map(h => h.trim());
  const data = lines.slice(1).map(line => {
    const values = line.split(separator);
    return values.map(v => v ? v.replace(/"/g, '').trim() : ""); // Nettoyage ici
  });
  return {headers, data};
}

function getUniqueColumnValues(data, index) {
  return [...new Set(
    data.map(row => row[index])
      .filter(Boolean)
      .flatMap(v => v.split(",").map(s => s.replace(/"/g, '').trim()))
  )].sort((a, b) => a.localeCompare(b, "fr"));
}

async function init() {
  const {headers, data} = await loadCSV("articles.csv");
  let table = null;
  $(document).ready(function () {
    // Ajoute une colonne d'actions (boutons)
    table = $('#articlesTable').DataTable({
      data: data.map(row => [...row, ""]),
      columns: [
        ...headers.map(h => ({title: h})),
        {
          title: "Actions",
          data: null,
          orderable: false,
          defaultContent: `
            <button class="validateBtn">Valider</button>
            <button class="editBtn">Modifier</button>
            <button class="deleteBtn">Supprimer</button>
          `
        }
      ],
      pageLength: 50,
      lengthMenu: [[50, 100, -1], [50, 100, "Toutes"]],
      language: {
        url: "https://cdn.datatables.net/plug-ins/1.13.6/i18n/fr-FR.json"
      }
    });

    // Remplir listes déroulantes
    const idxAuteur = headers.indexOf("Auteur(s)");
    const idxVille = headers.indexOf("Ville(s)");
    const idxTheme = headers.indexOf("Theme(s)");
    fillSelect("addAuteur", getUniqueColumnValues(data, idxAuteur));
    fillSelect("addVille", getUniqueColumnValues(data, idxVille));
    fillSelect("addTheme", getUniqueColumnValues(data, idxTheme));

    function fillSelect(elementId, values) {
      const sel = document.getElementById(elementId);
      if (sel) {
        sel.innerHTML = '';
        values.forEach(val => {
          const opt = document.createElement("option");
          opt.value = val;
          opt.text = val;
          sel.add(opt);
        });
      }
    }

    $("#showAddForm").on("click", function() {
      $("#addFormContainer").show();
    });
    $("#cancelAdd").on("click", function() {
      $("#addFormContainer").hide();
      window.rowToEdit = null;
    });

    // Modification/édition
    $('#articlesTable tbody').on('click', '.editBtn', function() {
      const data = table.row($(this).closest('tr')).data();
      $("#addForm [name='Année']").val(data[0]);
      $("#addForm [name='Numéro']").val(data[1]);
      $("#addForm [name='Titre']").val(data[2]);
      $("#addForm [name='Page(s)']").val(data[3]);
      $("#addForm [name='Auteur(s)']").val(data[4]);
      $("#addForm [name='Ville(s)']").val(data[5]);
      $("#addForm [name='Theme(s)']").val(data[6]);
      $("#addForm [name='Epoque']").val(data[7]);
      $("#addFormContainer").show();
      window.rowToEdit = $(this).closest('tr');
    });

    // Validation visuelle
    $('#articlesTable tbody').on('click', '.validateBtn', function() {
      $(this).closest('tr').css("background", "#e7fbe8");
    });

    // Suppression
    $('#articlesTable tbody').on('click', '.deleteBtn', function() {
      table.row($(this).closest('tr')).remove().draw();
      window.rowToEdit = null;
    });

    // Ajout ou édition
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
        fd.get("Epoque"),
        ""
      ].map(cell => cell ? cell.replace(/"/g,'') : ""); // nettoyage guillemets

      if (window.rowToEdit) {
        table.row(window.rowToEdit).data(newRow).draw();
        window.rowToEdit = null;
      } else {
        table.row.add(newRow).draw();
      }
      e.target.reset();
      $("#addFormContainer").hide();
    });
  });
}

window.onload = init;
