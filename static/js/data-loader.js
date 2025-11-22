const API_BASE = window.HUGO_API_BASE;

let flats = [];
let residents = [];
let payments = [];

// -----------------------------------------------------
// Helper: date formatter
// -----------------------------------------------------
function formatDateTime(dt) {
    if (!dt) return "-";
    return new Date(dt).toLocaleString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
    });
}

// -----------------------------------------------------
// Helper: fetch JSON
// -----------------------------------------------------
async function fetchJson(url) {
    return await fetch(url, { cache: "no-store" }).then(r => r.json());
}

// -----------------------------------------------------
// Init load
// -----------------------------------------------------
document.addEventListener("DOMContentLoaded", loadAllData);

async function loadAllData() {
    const ts = Date.now();

    const [f, r, p] = await Promise.all([
        fetchJson(`${API_BASE}?type=flats&ts=${ts}`),
        fetchJson(`${API_BASE}?type=residents&ts=${ts}`),
        fetchJson(`${API_BASE}?type=payments&ts=${ts}`)
    ]);

    flats = f;
    residents = r.map(x => ({ ...x, FlatNo: String(x.FlatNo).trim() }));
    payments = p.map(x => ({ ...x, FlatNo: String(x.FlatNo).trim() }));

    renderFlatsTable();
}

// -----------------------------------------------------
// Render Flat Table
// -----------------------------------------------------
function renderFlatsTable() {
    const tbody = document.getElementById("flats-body");
    tbody.innerHTML = "";

    const tplRow = document.getElementById("tpl-flat-row");
    const tplDetailRow = document.getElementById("tpl-detail-row");

    flats.forEach(f => {
        const flatNo = String(f.FlatNo).trim();

        // Main row
        const row = tplRow.content.cloneNode(true);
        row.querySelector(".col-flat-no").textContent = flatNo;
        row.querySelector(".col-floor").textContent = f.Floor;
        row.querySelector(".col-tower").textContent = f.Tower;

        row.querySelector(".btn-view").onclick = () => toggleDetails(flatNo);

        tbody.appendChild(row);

        // Details row
        const detailRow = tplDetailRow.content.cloneNode(true);
        detailRow.querySelector(".details-row").id = `details-${flatNo}`;
        tbody.appendChild(detailRow);
    });
}

// -----------------------------------------------------
// Toggle details
// -----------------------------------------------------
function toggleDetails(flatNo) {
    const row = document.getElementById(`details-${flatNo}`);
    const container = row.querySelector(".detail-container");

    if (row.classList.contains("d-none")) {
        row.classList.remove("d-none");
        renderDetails(flatNo, container);
    } else {
        row.classList.add("d-none");
    }
}

// -----------------------------------------------------
// Render Details (using templates only)
// -----------------------------------------------------
function renderDetails(flatNo, container) {
    const flat = flats.find(x => x.FlatNo == flatNo);
    const resList = residents.filter(x => x.FlatNo == flatNo);
    const payList = payments.filter(x => x.FlatNo == flatNo).slice(0, 6);

    const tpl = document.getElementById("tpl-detail-container");
    const clone = tpl.content.cloneNode(true);

    // Fill basic info
    clone.querySelector(".detail-flat-title").textContent = `Flat ${flatNo} – Details`;
    clone.querySelector(".detail-floor").textContent = flat.Floor;
    clone.querySelector(".detail-tower").textContent = flat.Tower;

    // Fill residents
    renderResidents(clone.querySelector(".detail-residents"), resList);

    // Fill payments
    renderPayments(clone.querySelector(".detail-payments"), payList);

    // Replace old content
    container.innerHTML = "";
    container.appendChild(clone);
}

// -----------------------------------------------------
// Render Residents (template-based)
// -----------------------------------------------------
function renderResidents(target, list) {
    const tpl = document.getElementById("tpl-resident-item");
    const noTpl = document.getElementById("tpl-no-data");

    target.innerHTML = "";

    if (list.length === 0) {
        target.appendChild(noTpl.content.cloneNode(true));
        return;
    }

    list.forEach(r => {
        const item = tpl.content.cloneNode(true);
        item.querySelector(".resident-type").textContent = r.ResidentType;
        item.querySelector(".resident-name").textContent = r.Name;

        const phone = item.querySelector(".resident-phone");
        phone.textContent = r.Phone;
        phone.href = `tel:${r.Phone}`;

        const email = item.querySelector(".resident-email");
        email.textContent = r.Email;
        email.href = `mailto:${r.Email}`;

        target.appendChild(item);
    });
}

// -----------------------------------------------------
// Render Payments (template-based)
// -----------------------------------------------------
function renderPayments(target, list) {
    const tpl = document.getElementById("tpl-payment-row");
    const noTpl = document.getElementById("tpl-no-data");

    target.innerHTML = "";

    if (list.length === 0) {
        target.appendChild(noTpl.content.cloneNode(true));
        return;
    }

    list.forEach(p => {
        const row = tpl.content.cloneNode(true);

        row.querySelector(".pay-month").textContent = formatDateTime(p.Month);
        row.querySelector(".pay-paidon").textContent = formatDateTime(p.PaidOn);
        row.querySelector(".pay-amount").textContent = p.Amount;
        row.querySelector(".pay-mode").textContent = p.Mode;

        // Only place where small inline HTML is needed (badge)
        const status = row.querySelector(".pay-status");
        if (p.Status === "Paid") {
            status.innerHTML = `<span class="badge bg-success">Paid</span>`;
        } else {
            status.innerHTML = `<span class="badge bg-danger">Unpaid</span>`;
        }

        target.appendChild(row);
    });
}
