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

async function init() {
  const {headers, data} = await loadCSV("articles.csv");

  // Initialisation DataTable
  $(document).ready(function () {
    $('#articlesTable').DataTable({
      data: data,
      columns: headers.map(h => ({title: h})),
      pageLength: 50,
      lengthMenu: [[50, 100, -1], [50, 100, "Toutes"]],
      language: {
        url: "https://cdn.datatables.net/plug-ins/1.13.6/i18n/fr-FR.json"
      }
    });
  });
}

window.onload = init;
