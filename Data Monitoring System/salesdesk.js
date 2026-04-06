import { SUPABASE_CONFIG } from './config.js';
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

// This is our "Fast Cache"
let localSalesData = []; 

window.onload = async function () {
    await initialFetch();
    setupRealtime();
};

// 1. FETCH ONCE (The only heavy lift)
async function initialFetch() {
    const { data, error } = await supabaseClient
        .from('sales_records')
        .select('*')
        .order('date', { ascending: false });

    if (!error) {
        localSalesData = data;
        renderTable(localSalesData);
    }
}

// 2. REALTIME (The "Magic" - Updates only what changed)
function setupRealtime() {
    supabaseClient
        .channel('sales-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'sales_records' }, (payload) => {
            if (payload.eventType === 'INSERT') {
                localSalesData.unshift(payload.new); // Add to top of list
            } else if (payload.eventType === 'DELETE') {
                localSalesData = localSalesData.filter(item => item.id !== payload.old.id);
            } else if (payload.eventType === 'UPDATE') {
                const index = localSalesData.findIndex(item => item.id === payload.new.id);
                if (index !== -1) localSalesData[index] = payload.new;
            }
            // Re-render from local memory (Instant)
            renderTable(localSalesData);
        })
        .subscribe();
}

// 3. UPDATED RENDER FUNCTION
function renderTable(data) {
    const tableBody = document.getElementById("tableData");
    
    // Create the rows as a single string to avoid multiple DOM updates
    const rows = data.map(d => `
        <tr>
            <td>${d.date || ''}</td>
            <td>${d.dr_number || ''}</td>
            <td>${d.po_number || ''}</td>
            <td>${d.client || ''}</td>
            <td>${d.item_description || ''}</td>
            <td>${d.qty || ''}</td>
            <td>${d.uom || ''}</td>
            <td class="source-tag">${d.source_type || 'Sales'}</td>
            <td>
                <button class="edit" onclick="editData('${d.id}')">Edit</button>
                <button class="delete" onclick="deleteData('${d.id}')">Delete</button>
            </td>
        </tr>
    `).join('');

    tableBody.innerHTML = rows;
}

// 4. SEARCH (Now works instantly on local memory)
window.searchData = function() {
    const term = document.getElementById("search").value.toLowerCase();
    const filtered = localSalesData.filter(d => 
        d.client?.toLowerCase().includes(term) || 
        d.dr_number?.toLowerCase().includes(term) ||
        d.item_description?.toLowerCase().includes(term)
    );
    renderTable(filtered);
};