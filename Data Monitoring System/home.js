function setActive(element) {
    document.querySelectorAll(".menu li").forEach(li => {
        li.classList.remove("active");
    });
    element.classList.add("active");
}

// SAMPLE DATA
const data = [
    {id: 1, client: "ABC Corp", status: "Pending", dept: "Sales Desk"},
    {id: 2, client: "XYZ Ltd", status: "Completed", dept: "Engineering"},
    {id: 3, client: "Juan Dela Cruz", status: "On Delivery", dept: "Delivery"},
    {id: 4, client: "Tech Solutions", status: "Pending", dept: "QA"},
];

const table = document.getElementById("tableData");

data.forEach(item => {
    const row = `
        <tr>
            <td>${item.id}</td>
            <td>${item.client}</td>
            <td>${item.status}</td>
            <td>${item.dept}</td>
        </tr>
    `;
    table.innerHTML += row;
});


//-------
function loadPage(element, page) {
    document.getElementById("contentFrame").src = page;

    document.querySelectorAll(".menu li").forEach(li => {
        li.classList.remove("active");
    });

    element.classList.add("active");
}