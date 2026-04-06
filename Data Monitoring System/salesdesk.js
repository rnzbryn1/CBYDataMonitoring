let salesData = JSON.parse(localStorage.getItem("salesData")) || [];
let filteredData = [...salesData];
let editIndex = null;

window.onload = function () {
    renderTable(filteredData);
};

// ADD / UPDATE
function addData() {
    const record = {
        date: date.value,
        dr: dr.value,
        po: po.value,
        client: client.value,
        item: item.value,
        qty: qty.value,
        uom: uom.value,
        remarks: remarks.value
    };

    if (editIndex !== null) {
        salesData[editIndex] = record;
        editIndex = null;
    } else {
        salesData.push(record);
    }

    saveAndRender();
    clearForm();
}

// SAVE + REFRESH
function saveAndRender() {
    localStorage.setItem("salesData", JSON.stringify(salesData));
    filteredData = [...salesData];
    renderTable(filteredData);
}

// RENDER
function renderTable(data) {
    const table = document.getElementById("tableData");
    table.innerHTML = "";

    data.forEach((d, index) => {
        table.innerHTML += `
            <tr>
                <td>${d.date}</td>
                <td>${d.dr}</td>
                <td>${d.po}</td>
                <td>${d.client}</td>
                <td>${d.item}</td>
                <td>${d.qty}</td>
                <td>${d.uom}</td>
                <td>${d.remarks}</td>
                <td>
                    <button class="edit "onclick="editData(${index})">Edit</button>
                    <button class="delete" onclick="deleteData(${index})">Delete</button>
                </td>
            </tr>
        `;
    });
}

// EDIT
function editData(index) {
    const d = salesData[index];

    date.value = d.date;
    dr.value = d.dr;
    po.value = d.po;
    client.value = d.client;
    item.value = d.item;
    qty.value = d.qty;
    uom.value = d.uom;
    remarks.value = d.remarks;

    editIndex = index;
}

// DELETE
function deleteData(index) {
    salesData.splice(index, 1);
    saveAndRender();
}

// SEARCH
function searchData() {
    const value = document.getElementById("search").value.toLowerCase();

    filteredData = salesData.filter(d =>
        Object.values(d).some(val =>
            String(val).toLowerCase().includes(value)
        )
    );

    renderTable(filteredData);
}

// SORT
function sortData(field) {
    if (!field) return;

    filteredData.sort((a, b) => {
        if (field === "date") {
            return new Date(a.date) - new Date(b.date);
        }
        return a[field].localeCompare(b[field]);
    });

    renderTable(filteredData);
}

// EXPORT TO EXCEL
function exportToExcel() {
    const ws = XLSX.utils.json_to_sheet(salesData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "SalesDesk");

    XLSX.writeFile(wb, "SalesDesk.xlsx");
}

// CLEAR FORM
function clearForm() {
    document.querySelectorAll(".form input").forEach(i => i.value = "");
}