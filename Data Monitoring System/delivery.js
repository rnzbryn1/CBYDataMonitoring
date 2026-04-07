// ================================
// SUPABASE READY (future use)
// ================================
import { SUPABASE_CONFIG } from './config.js';

const { createClient } = supabase;
const supabaseClient = createClient(
    SUPABASE_CONFIG.url,
    SUPABASE_CONFIG.anonKey
);

//--GLOBAL STATE
let editingId = null;

const USE_SUPABASE = false; 

// ================================
// LOCAL STORAGE KEYS
// ================================
const LS_KEY = "delivery_app";

// ================================
// STATE
// ================================
let db = JSON.parse(localStorage.getItem(LS_KEY)) || {
    categories: []
};

let currentCategory = null;
let dateSortAsc = true;

// ================================
// SAVE LOCAL
// ================================
function saveLocal() {
    localStorage.setItem(LS_KEY, JSON.stringify(db));
}

// ================================
// INIT
// ================================
window.onload = function () {
    renderCategories();
};

// ================================
// CATEGORY
// ================================
function renderCategories() {
    const container = document.getElementById("categoryCards");

    container.innerHTML = db.categories.map(c => {
        const bgColor = getPastelColor(c.name);

        const isActive = currentCategory && currentCategory.name === c.name
            ? "active"
            : "";

        return `
        <div class="category-card ${isActive}" style="background:${bgColor};">

            <div class="card-menu">
                <button class="menu-btn" onclick="toggleMenu(event, '${c.name}')">⋮</button>

                <div class="dropdown" id="menu-${c.name}">
                    <button onclick="deleteCategory('${c.name}')">Delete</button>
                </div>
            </div>

            <div onclick="switchCategory('${c.name}')">
                <div class="card-icon">${c.name[0]}</div>
                <span>${c.name}</span>
            </div>

        </div>
        `;
    }).join("");
}

window.createCategory = function () {
    const name = document.getElementById("newCategoryName").value.trim();
    if (!name) return;

    db.categories.push({
        name,
        columns: [],
        entries: []
    });

    saveLocal();
    closeModal();
    renderCategories();
};

window.deleteCategory = function (name) {
    if (!confirm(`Delete "${name}"? All data will be lost.`)) return;

    db.categories = db.categories.filter(c => c.name !== name);

    // reset current
    if (currentCategory?.name === name) {
        currentCategory = null;
        document.getElementById("moduleWorkspace").style.display = "none";
    }

    saveLocal();
    renderCategories();
};

// ================================
// SWITCH
// ================================
window.switchCategory = function (name) {
    currentCategory = db.categories.find(c => c.name === name);

    document.getElementById("moduleWorkspace").style.display = "block";

    renderCategories(); 
    renderUI();
    renderTable(currentCategory.entries);
};

// ================================
// COLUMN
// ================================
window.addColumn = function () {
    const name = document.getElementById("newColumnName").value;
    const type = document.getElementById("newColumnType").value;

    if (!name) return;

    currentCategory.columns.push({ name, type });

    saveLocal();
    closeColumnModal();
    renderUI();
    renderTable(currentCategory.entries);
};

window.deleteColumn = function (index) {
    const colName = currentCategory.columns[index].name;

    if (!confirm(`Delete column "${colName}"? This will remove data in all records.`)) return;

    // remove column
    currentCategory.columns.splice(index, 1);

    // remove data from all entries
    currentCategory.entries = currentCategory.entries.map(entry => {
    delete entry.content[colName];
    return entry;
    });

    saveLocal();
    renderUI();
    renderTable(currentCategory.entries);
};

// ================================
// UI RENDER
// ================================
function renderUI() {
    const form = document.getElementById("dynamicForm");

    form.innerHTML = currentCategory.columns.map((c, index) => `
        <div class="input-box">

            <div class="field-header">

                <div class="field-menu">
                <label>${c.name}</label>
                    <button class="menu-btn" onclick="toggleFieldMenu(event, ${index})">⋮</button>

                    <div class="dropdown" id="field-menu-${index}">
                        <button onclick="deleteColumn(${index})">Delete</button>
                    </div>
                </div>
            </div>

            <input type="${c.type}" id="input_${c.name}">
        </div>
    `).join("") + `<button onclick="saveData()" class="save-btn">Save</button>`;

    const headers = document.getElementById("tableHeaders");
    headers.innerHTML = `
        <tr>
            ${currentCategory.columns.map(c => `<th>${c.name}</th>`).join("")}
            <th>Action</th>
        </tr>
    `;
}

// ================================
// SAVE ENTRY
// ================================
window.saveData = function () {
    const content = {};

    currentCategory.columns.forEach(c => {
        content[c.name] = document.getElementById(`input_${c.name}`).value;
    });

    if (editingId) {
        // ✅ EDIT MODE
        const index = currentCategory.entries.findIndex(e => e.id === editingId);

        if (index !== -1) {
            currentCategory.entries[index].content = content;
        }

        editingId = null;
        document.querySelector(".save-btn").innerText = "Save";

    } else {
        // ✅ NEW ENTRY
        currentCategory.entries.unshift({
            id: Date.now(),
            content
        });
    }

    saveLocal();
    renderTable(currentCategory.entries);

    // clear inputs
    currentCategory.columns.forEach(c => {
        document.getElementById(`input_${c.name}`).value = "";
    });
};

// ================================
// TABLE
// ================================
function renderTable(entries) {
    const body = document.getElementById("tableData");

    if (!entries.length) {
        body.innerHTML = `<tr><td colspan="100%">No data</td></tr>`;
        return;
    }

    body.innerHTML = entries.map(e => `
        <tr>
            ${currentCategory.columns.map(c => `<td>${e.content[c.name] || "-"}</td>`).join("")}
            <td class="action-buttons">
                <button class="edit-btn" onclick="editEntry(${e.id})">Edit</button>
                <button class="del-btn" onclick="deleteEntry(${e.id})">Delete</button>
            </td>
        </tr>
    `).join("");
}

// ================================
// DELETE
// ================================
window.deleteEntry = function (id) {
    if(!confirm("Are you sure you want to delete this record?")) return;

    currentCategory.entries = currentCategory.entries.filter(e => e.id !== id);
    saveLocal();
    renderTable(currentCategory.entries);
};

// ================================
// EDIT
// ================================
window.editEntry = function (id) {
    const entry = currentCategory.entries.find(e => e.id === id);
    if (!entry) return;

    currentCategory.columns.forEach(c => {
        const input = document.getElementById(`input_${c.name}`);
        if (input) {
            input.value = entry.content[c.name] || "";
        }
    });

    editingId = id;

    document.querySelector(".save-btn").innerText = "Update";

    window.scrollTo({ top: 0, behavior: "smooth" });
};

// ================================
// SEARCH
// ================================
window.searchData = function () {
    const term = document.getElementById("search").value.toLowerCase();

    const filtered = currentCategory.entries.filter(e =>
        JSON.stringify(e.content).toLowerCase().includes(term)
    );

    renderTable(filtered);
};

// ================================
// SORT DATE
// ================================
window.sortByDate = function () {
    const dateCol = currentCategory.columns.find(c => c.type === "date");
    if (!dateCol) return alert("No date field");

    currentCategory.entries.sort((a, b) => {
        const d1 = new Date(a.content[dateCol.name] || 0);
        const d2 = new Date(b.content[dateCol.name] || 0);

        return dateSortAsc ? d1 - d2 : d2 - d1;
    });

    dateSortAsc = !dateSortAsc;
    renderTable(currentCategory.entries);
};

// ================================
// EXPORT
// ================================
window.exportToExcel = function () {
    const formatted = currentCategory.entries.map(e => e.content);

    const ws = XLSX.utils.json_to_sheet(formatted);
    const wb = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(wb, ws, "Delivery");

    XLSX.writeFile(wb, `${currentCategory.name}.xlsx`);
};

// ================================
// MODALS
// ================================
window.openModal = () => document.getElementById("categoryModal").style.display = "block";
window.closeModal = () => document.getElementById("categoryModal").style.display = "none";

window.openColumnModal = () => document.getElementById("columnModal").style.display = "block";
window.closeColumnModal = () => document.getElementById("columnModal").style.display = "none";


// ================================
// Function drop down to para doon sa cateogry
// ================================
window.toggleMenu = function (event, name) {
    event.stopPropagation();

    const menu = document.getElementById(`menu-${name}`);
    const isOpen = menu.style.display === "block";

    // close all first
    document.querySelectorAll(".dropdown").forEach(d => d.style.display = "none");

    // toggle behavior
    if (!isOpen) {
        menu.style.display = "block";
    }
};

window.addEventListener("click", () => {
    document.querySelectorAll(".dropdown").forEach(d => d.style.display = "none");
});

// click outside = close
window.onclick = function () {
    document.querySelectorAll(".dropdown").forEach(d => d.style.display = "none");
};

// ================================
// Function drop down to para doon sa column
// ================================
window.toggleFieldMenu = function (event, index) {
    event.stopPropagation();

    const menu = document.getElementById(`field-menu-${index}`);
    const isOpen = menu.style.display === "block";

    // close all
    document.querySelectorAll(".dropdown").forEach(d => d.style.display = "none");

    // toggle
    if (!isOpen) {
        menu.style.display = "block";
    }
};

function getPastelColor(str) {
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }

    const hue = hash % 360;

    // pastel = mataas lightness, mababang saturation
    return `hsl(${hue}, 70%, 85%)`;
}