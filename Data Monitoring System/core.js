// Import SupabaseService for database operations
import { SupabaseService } from './supabase-service.js';

// Note: Supabase client is initialized in supabase-service.js
// This prevents "Multiple GoTrueClient instances" warning

export const AppCore = {
    state: {
        moduleName:             '',
        departmentId:           1,              // NEW - required for new schema
        currentTemplateId:      null,           // NEW - keep ID reference
        currentTemplate:        null,
        allTemplates:           [],
        allColumns:             [],             // NEW - reusable encoding_columns
        localEntries:           [],
        editingId:              null,
        editingValues:          {},             // NEW - current entry values being edited
        dateSortAsc:            true,
        cache:                  {},
        isLoading:              false,
        _importWorkbook:        null,
        _importExcelCols:       [],   // detected Excel column names
        tableEventsInitialized: false
    },

    // ============================================================
    // INIT
    // ============================================================
    initModule: async function (moduleName, departmentId = 1) {
        this.state.moduleName = moduleName;
        this.state.departmentId = departmentId;
        this.syncWithWindow();
        
        try {
            // Verify department exists and use it; if not, find the first available
            try {
                const departments = await SupabaseService.client
                    .from('departments')
                    .select('id, name')
                    .eq('id', departmentId)
                    .single();
                
                if (departments.error) {
                    // Department not found, fetch the first available
                    const { data: allDepts, error: deptError } = await SupabaseService.client
                        .from('departments')
                        .select('id, name')
                        .limit(1);
                    
                    if (deptError || !allDepts || !allDepts.length) {
                        this.showToast('No departments found. Please create a department first.', 'error');
                        return;
                    }
                    
                    this.state.departmentId = allDepts[0].id;
                    console.log(`Using department: ${allDepts[0].name} (ID: ${allDepts[0].id})`);
                }
            } catch (deptCheckError) {
                console.warn('Could not verify department:', deptCheckError.message);
            }
            
            // Load both templates and columns from new schema
            this.state.allTemplates = await SupabaseService.getTemplates(this.state.departmentId);
            this.state.allColumns = await SupabaseService.getColumns(this.state.departmentId);
            this.renderCategoryCards();
        } catch (error) {
            this.showToast('Failed to load templates: ' + error.message, 'error');
        }
    },    

    syncWithWindow: function () {
        window.switchTemplate    = (id)        => this.switchTemplate(id);
        window.loadEntries     = (templateId) => this.loadEntries(templateId);
        window.saveData          = ()          => this.saveData();
        window.editEntry         = (id)        => this.editEntry(id);
        window.closeEditModal    = ()          => this.closeEditModal();
        window.saveEditEntry     = ()          => this.saveEditEntry();
        window.deleteEntry       = (id)        => this.deleteEntry(id);
        window.searchData        = ()          => this.searchData();
        window.sortByDate        = ()          => this.sortByDate();
        window.exportToExcel     = ()          => this.exportToExcel();


        window.openModal         = ()          => document.getElementById('categoryModal').style.display = 'block';
        window.closeModal        = ()          => document.getElementById('categoryModal').style.display = 'none';
        window.openColumnModal   = ()          => document.getElementById('columnModal').style.display = 'block';
        window.closeColumnModal  = ()          => document.getElementById('columnModal').style.display = 'none';

        window.filterCategoryCards = () => this.filterCategoryCards();

        window.createNewTemplate = ()          => this.createNewTemplate();
        window.addColumnToTemplate = ()        => this.addColumnToTemplate();
        window.deleteColumn      = (id, name)  => this.deleteColumn(id, name);
        window.deleteTemplate    = (id, name)  => this.deleteTemplate(id, name);
        window.renameCategory = (id, name) => this.renameCategory(id, name);
        window.renameColumn   = (id, name) => this.renameColumn(id, name);
        window.toggleMenu        = (event, id) => this.toggleMenu(event, `menu-${id}`);

        window.openImportModal   = ()          => this.openImportModal();
        window.closeImportModal  = ()          => this.closeImportModal();
        window.loadSheets        = ()          => this.loadSheets();
        window.previewSheet      = ()          => this.previewSheet();
        window.confirmImport     = ()          => this.confirmImport();
        window.deleteSelected    = ()          => this.deleteSelected();

        window.addEventListener('click', () => {
            document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none');
        });

        this.ensureContextMenu();

        // CONTEXT MENU ACTIONS
        document.getElementById('ctxEdit')?.addEventListener('click', () => {
            if (this.state.currentRowId) {
                this.editEntry(this.state.currentRowId);
            }
        });

        document.getElementById('ctxDelete')?.addEventListener('click', () => {
            if (this.state.currentRowId) {
                this.deleteEntry(this.state.currentRowId);
            }
        });     

        document.getElementById('ctxCompute')?.addEventListener('click', () => {
            console.log('Compute clicked'); 
            this.openComputeModal();
        });
    },

    ensureContextMenu: function () {
        this.injectContextMenuStyles();
        if (document.getElementById('contextMenu')) return;

        const menu = document.createElement('div');
        menu.id = 'contextMenu';
        menu.className = 'context-menu';

        const editBtn = document.createElement('button');
        editBtn.id = 'ctxEdit';
        editBtn.type = 'button';
        editBtn.textContent = 'Edit Row';

        const deleteBtn = document.createElement('button');
        deleteBtn.id = 'ctxDelete';
        deleteBtn.type = 'button';
        deleteBtn.textContent = 'Delete Row';
        deleteBtn.className = 'delete';

        const computeBtn = document.createElement('button');
        computeBtn.id = 'ctxCompute';   
        computeBtn.type = 'button';
        computeBtn.textContent = 'Compute';

        menu.appendChild(computeBtn);
        menu.appendChild(editBtn);
        menu.appendChild(deleteBtn);
        document.body.appendChild(menu);
        this.injectContextMenuStyles();
    },

    injectContextMenuStyles: function () {
        if (document.getElementById('appcore-context-menu-styles')) return;

        const style = document.createElement('style');
        style.id = 'appcore-context-menu-styles';
        style.textContent = `
            .context-menu {
                position: absolute;
                display: none;
                min-width: 160px;
                background: #ffffff;
                border-radius: 10px;
                box-shadow: 0 8px 25px rgba(0,0,0,0.15);
                padding: 6px 0;
                z-index: 9999;
                animation: fadeInMenu 0.15s ease;
                border: 1px solid #eee;
            }

            .context-menu button {
                width: 100%;
                padding: 10px 14px;
                border: none;
                background: transparent;
                text-align: left;
                font-size: 14px;
                cursor: pointer;
                display: flex;
                align-items: center;
                gap: 10px;
                transition: background 0.2s ease, padding-left 0.2s ease;
            }

            .context-menu button:hover {
                background: #f5f7fb;
                padding-left: 18px;
            }

            .context-menu button:active {
                background: #eaeef5;
            }

            .context-menu button.delete {
                color: #ef4444;
            }

            .context-menu button.delete:hover {
                background: #fee2e2;
            }

            tbody td.cell-focused,
            tbody td[contenteditable="true"]:focus {
                background: #eff6ff;
                box-shadow: inset 0 0 0 1.5px #2563eb;
                border-radius: 4px;
            }

            tbody td.cell-selected {
                background: #dbeafe !important;
                box-shadow: inset 0 0 0 1px #3b82f6;
                border-radius: 2px;
                user-select: none;
            }

            @keyframes fadeInMenu {
                from {
                    opacity: 0;
                    transform: scale(0.95) translateY(-5px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }

            tr.row-selected td {
                background: #e0f2fe !important;
            }
        `;

        document.head.appendChild(style);
    },

    // ============================================================
    // TOAST
    // ============================================================
    showToast: function (message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type} show`;
        toast.innerText = message;
        document.body.appendChild(toast);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 500);
        }, 3000);
    },

    // ============================================================
    // TEMPLATE SWITCHING
    // ============================================================
    switchTemplate: async function (templateId) {
        if (this.state.isLoading) return;
        
        const workspace = document.getElementById('moduleWorkspace');
        workspace.style.display = 'block';
        workspace.style.opacity = '0.4';
        workspace.style.pointerEvents = 'none';
        this.state.isLoading = true;

        try {
            const cacheKey = `template-${templateId}`;
            
            if (this.state.cache[cacheKey]) {
                // Use cached data
                this.state.currentTemplate = this.state.cache[cacheKey].template;
                this.state.localEntries = this.state.cache[cacheKey].entries;
            } else {
                // Load from Supabase
                this.state.currentTemplate = await SupabaseService.getTemplate(templateId);
                this.state.localEntries = await SupabaseService.getEntries(templateId);
                
                // Cache it
                this.state.cache[cacheKey] = {
                    template: this.state.currentTemplate,
                    entries: this.state.localEntries
                };
            }

            this.state.currentTemplateId = templateId;
            this.updateActiveUI(templateId);
            this.renderAll();
        } catch (error) {
            this.showToast('Switch failed: ' + error.message, 'error');
        } finally {
            workspace.style.opacity = '1';
            workspace.style.pointerEvents = 'auto';
            this.state.isLoading = false;
        }
    },
    // ============================================================
    // REFRESH DATA
    // ============================================================
    loadEntries: async function (templateId) {
        try {
            // Fetch fresh entries from Supabase
            const entries = await SupabaseService.getEntries(templateId);
            this.state.localEntries = entries;

            // Update cache so the fresh data persists
            const cacheKey = `template-${templateId}`;
            if (this.state.cache[cacheKey]) {
                this.state.cache[cacheKey].entries = entries;
            }

            // Re-render the table with the new data
            this.renderTable(this.state.localEntries);
        } catch (error) {
            console.error('Error refreshing entries:', error);
            this.showToast('Error refreshing data', 'error');
        }
    },

    updateActiveUI: function (templateId) {
        document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
        const activeCard = document.getElementById(`card-${templateId}`);
        if (activeCard) activeCard.classList.add('active');
    },

    // ============================================================
    // RENDER
    // ============================================================
    renderAll: function () {
        const form = document.getElementById('dynamicForm');
        if (!form) return;

        const title = document.getElementById('entryFormTitle');
        if (title && this.state.currentTemplate) {
            title.innerText = `${this.state.currentTemplate.name} Entry Form`;
        }

        // Use columns from encoding_template_columns
        const columns = this.state.currentTemplate.columns || [];
        
        form.innerHTML = columns.map(col => {
            const colDef = col.encoding_columns; // join from template_columns
            return `
                <div class="input-box">
                    <label>${colDef.column_name}</label>
                    <input type="text"
                        id="input_${colDef.id}"
                        data-column-id="${colDef.id}"
                        data-column-name="${colDef.column_name}"
                        placeholder="Enter ${colDef.column_name}">
                </div>
            `;
        }).join('') + `<button onclick="saveData()" class="save-btn" id="mainSaveBtn">Save Record</button>`;

        const headers = document.getElementById('tableHeaders');
        headers.innerHTML = `<tr>
            <th><input type="checkbox" id="selectAll"></th>
            ${columns.map(col => {
                const colDef = col.encoding_columns;
                return `
                    <th data-col-id="${colDef.id}" data-col-name="${colDef.column_name}">
                        <div class="th-inner">
                            <span class="th-text">${colDef.column_name}</span>
                            <button class="del-col-btn" title="Delete column"
                                onclick="deleteColumn('${colDef.id}', '${colDef.column_name}')">✕</button>
                        </div>
                    </th>
                `;
            }).join('')}
        </tr>`;

        this.renderTable(this.state.localEntries);
        this.setupTableEditing();
        this.enableColumnDrag();
    },

    renderTable: function (entries) {
        const body = document.getElementById('tableData');
        if (!body) return;

        // Count and log empty entries
        const emptyEntries = entries.filter(e => !e.valueDetails || e.valueDetails.length === 0);
        if (emptyEntries.length > 0) {
            console.warn(`⚠️ FOUND ${emptyEntries.length} completely EMPTY entries in database!`);
            console.warn('Empty entry IDs:', emptyEntries.slice(0, 10).map(e => e.id.substring(0, 8)));
            console.log('Delete these empty entries? They shouldnt be imported.');
        }

        console.log(`Rendering ${entries.length} entries... (${emptyEntries.length} are empty)`);

        if (!entries.length) {
            body.innerHTML = `<tr><td colspan="100%" class="no-data">No records found.</td></tr>`;
            return;
        }

        const columns = this.state.currentTemplate.columns || [];

        body.innerHTML = entries.map(entry => {
            // For each entry, we need to get the values from valueDetails
            const valueMap = {};
            if (entry.valueDetails) {
                entry.valueDetails.forEach(v => {
                    valueMap[v.column_id] = v.value || v.value_number || '';
                });
            }
            
            const isEmpty = !entry.valueDetails || entry.valueDetails.length === 0;

            return `
                <tr data-entry-id="${entry.id}" style="${isEmpty ? 'background-color: #ffcccc;' : ''}">
                    <td><input type="checkbox" class="rowCheckbox" data-id="${entry.id}"></td>
                    ${columns.map(col => {
                        const colDef = col.encoding_columns;
                        const val = valueMap[colDef.id] || '';
                        return `
                            <td contenteditable="true" 
                                data-col-id="${colDef.id}" 
                                data-col-name="${colDef.column_name}">${val}</td>
                        `;
                    }).join('')}
                </tr>
            `;
        }).join('');
    },

    formatDisplayValue: function (raw, colType) {
        if (colType === 'date') {
            if (raw instanceof Date && !isNaN(raw.getTime())) {
                return this.formatDateDisplay(raw);
            }
            return String(raw ?? '');
        }
        if (raw instanceof Date && !isNaN(raw.getTime())) {
            return raw.toString();
        }
        return String(raw ?? '');
    },

    // ============================================================
    // INLINE TABLE EDITING + MULTI-CELL SELECTION
    // ============================================================
    setupTableEditing: function () {
        if (this.state.tableEventsInitialized) return;
        const body = document.getElementById('tableData');
        if (!body) return;

        // ---- selection state ----
        let isSelecting   = false;
        let selStartTd    = null;
        let selEndTd      = null;

        const getCellPos = (td) => {
            const row = td.closest('tr');
            const rows = Array.from(body.rows);
            const ri = rows.indexOf(row);
            const cells = Array.from(row.querySelectorAll('td[data-col-id]'));
            const ci = cells.indexOf(td);
            return { ri, ci };
        };

        const clearSelection = () => {
            body.querySelectorAll('td.cell-selected').forEach(c => c.classList.remove('cell-selected'));
            selStartTd = null;
            selEndTd   = null;
        };

        const applySelection = (startTd, endTd) => {
            body.querySelectorAll('td.cell-selected').forEach(c => c.classList.remove('cell-selected'));
            const s = getCellPos(startTd);
            const e = getCellPos(endTd);
            const minR = Math.min(s.ri, e.ri), maxR = Math.max(s.ri, e.ri);
            const minC = Math.min(s.ci, e.ci), maxC = Math.max(s.ci, e.ci);
            const rows = Array.from(body.rows);
            for (let r = minR; r <= maxR; r++) {
                if (!rows[r]) continue;
                const cells = Array.from(rows[r].querySelectorAll('td[data-col-name]'));
                for (let c = minC; c <= maxC; c++) {
                    if (cells[c]) cells[c].classList.add('cell-selected');
                }
            }
        };

        // mousedown — start selection or focus single cell
        body.addEventListener('mousedown', (e) => {
            const td = e.target.closest('td[data-col-id]');
            if (!td) { clearSelection(); return; }

            if (e.shiftKey && selStartTd) {
                // Shift+click extends selection
                selEndTd = td;
                applySelection(selStartTd, selEndTd);
                e.preventDefault();
                return;
            }

            clearSelection();
            isSelecting = true;
            selStartTd  = td;
            selEndTd    = td;
            td.classList.add('cell-selected');
        });

        // mouseover — drag to extend selection
        body.addEventListener('mouseover', (e) => {
            if (!isSelecting || !selStartTd) return;
            const td = e.target.closest('td[data-col-id]');
            if (!td) return;
            selEndTd = td;
            applySelection(selStartTd, selEndTd);
        });

        document.addEventListener('mouseup', () => { isSelecting = false; });

        // focusin — single cell edit focus
        body.addEventListener('focusin', (e) => {
            const td = e.target;
            if (td.tagName !== 'TD' || !td.isContentEditable) return;
            td.classList.add('cell-focused');
        });

        body.addEventListener('focusout', (e) => {
            const td = e.target;
            if (td.tagName !== 'TD' || !td.isContentEditable) return;
            td.classList.remove('cell-focused');
            this.onTableCellBlur(td);
        });

        // keydown — Ctrl+C copies selection, Enter blurs cell
        body.addEventListener('keydown', (e) => {
            // Ctrl+C or Cmd+C — copy selected cells
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const selected = body.querySelectorAll('td.cell-selected');
                if (!selected.length) return; // let browser handle normal copy

                e.preventDefault();
                // Group selected cells by row for TSV output
                const rowMap = new Map();
                selected.forEach(td => {
                    const row = td.closest('tr');
                    const rows = Array.from(body.rows);
                    const ri = rows.indexOf(row);
                    if (!rowMap.has(ri)) rowMap.set(ri, []);
                    rowMap.get(ri).push(td.textContent);
                });
                const tsv = Array.from(rowMap.keys()).sort((a,b) => a-b)
                    .map(ri => rowMap.get(ri).join('\t')).join('\n');
                navigator.clipboard.writeText(tsv).catch(() => {});
                this.showToast(`Copied ${selected.length} cell(s)`);
                return;
            }

            this.onTableCellKeyDown(e);
        });

        body.addEventListener('paste', (e) => this.onTableCellPaste(e));

        // Click outside table clears selection
        document.addEventListener('click', (e) => {
            if (!body.contains(e.target)) clearSelection();
        });

        this.state.tableEventsInitialized = true;

        //Select All Funtion para sa mga cells to ya
        document.addEventListener('change', (e) => {
            if (e.target.id === 'selectAll') {
                document.querySelectorAll('.rowCheckbox')
                    .forEach(cb => cb.checked = e.target.checked);
            }
        });
        
        //Right Click Logic
        this.state.currentRowId = null;
        const menu = document.getElementById('contextMenu');
        
        body.addEventListener('contextmenu', (e) => {
            const td = e.target.closest('td[data-col-name]');
            if (!td) return;

            e.preventDefault();

            // this part is for getting cell or column especially for computation
            this.state.currentCell = td;
            this.state.currentColName = td.dataset.colName;

            const row = td.closest('tr');

            // CLEAR previous row highlight
            body.querySelectorAll('tr.row-selected')
                .forEach(r => r.classList.remove('row-selected'));

            // HIGHLIGHT buong row
            row.classList.add('row-selected');

            this.state.currentRowId = row.dataset.entryId;

            // Show menu
            menu.style.display = 'block';
            menu.style.top = e.pageY + 'px';
            menu.style.left = e.pageX + 'px';
        });

        // Hide menu on click
        document.addEventListener('click', () => {
            menu.style.display = 'none';


            document.querySelectorAll('tr.row-selected')
                .forEach(r => r.classList.remove('row-selected'));
        });

        menu.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        //Renaming Column
        const headerRow = document.getElementById('tableHeaders');

            if (headerRow && !this.state.headerRenameInitialized) {
                headerRow.addEventListener('dblclick', async (e) => {
                    const th = e.target.closest('th[data-col-id]');
                    if (!th) return;

                    const colId   = th.dataset.colId;
                    const oldName = th.dataset.colName;

                    await this.renameColumn(colId, oldName);
                });

                this.state.headerRenameInitialized = true;
            }

            this.state.tableEventsInitialized = true;     
    },

    parseTabular: function (text) {
        return text.replace(/\r/g, '').split('\n').filter(l => l !== '').map(l => l.split('\t'));
    },

    getTableCellInfo: function (td) {
        if (!td || td.tagName !== 'TD') return null;
        const row     = td.closest('tr');
        const entryId = row?.dataset.entryId;
        const colId = td.dataset.colId;
        const colName = td.dataset.colName;
        return entryId && (colId || colName) ? { entryId, colId, colName } : null;
    },

    onTableCellBlur: async function (td) {
        const info = this.getTableCellInfo(td);
        if (!info) return;
        
        const newValue = td.textContent.trim();
        const colId = info.colId;
        
        try {
            const values = {};
            values[colId] = newValue;
            await SupabaseService.updateEntryValues(info.entryId, values);
            
            // Update cache
            const cacheKey = `template-${this.state.currentTemplate.id}`;
            delete this.state.cache[cacheKey];
        } catch (err) {
            this.showToast('Save failed: ' + err.message, 'error');
        }
    },

    onTableCellKeyDown: function (e) {
        const td = e.target;
        if (td.tagName !== 'TD' || !td.isContentEditable) return;
        if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
    },

    onTableCellPaste: function (e) {
        const text = e.clipboardData?.getData('text/plain') || '';
        if (!text) return;

        // Use focused cell or the first selected cell as paste anchor
        const td = e.target?.closest?.('td[data-col-id]')
            || document.querySelector('#tableData td.cell-selected');
        if (!td) return;

        e.preventDefault();

        const pasted = this.parseTabular(text);
        if (!pasted.length) return;

        const tbody          = document.getElementById('tableData');
        const rows           = Array.from(tbody.rows);
        const startRowIndex  = rows.indexOf(td.closest('tr'));
        const columns        = this.state.currentTemplate.columns || [];
        const columnIds      = columns.map(col => col.encoding_columns.id);
        const startColIndex  = columnIds.indexOf(td.dataset.colId);
        const changedEntries = new Map();

        pasted.forEach((rowValues, rowOffset) => {
            const targetRow = rows[startRowIndex + rowOffset];
            if (!targetRow) return;
            const entryId = targetRow.dataset.entryId;
            const entry   = this.state.localEntries.find(e => e.id === entryId);
            if (!entry) return;
            
            const values = {};
            rowValues.forEach((cellValue, colOffset) => {
                const colId = columnIds[startColIndex + colOffset];
                if (!colId) return;
                const cell = targetRow.querySelector(`td[data-col-id="${colId}"]`);
                if (!cell) return;
                const normalized = cellValue.trim();
                values[colId] = normalized;
                cell.textContent = normalized;
            });
            
            if (Object.keys(values).length > 0) {
                changedEntries.set(entryId, values);
            }
        });

        if (!changedEntries.size) return;
        
        changedEntries.forEach(async (values, entryId) => {
            try {
                await SupabaseService.updateEntryValues(entryId, values);
                const cacheKey = `template-${this.state.currentTemplate.id}`;
                delete this.state.cache[cacheKey];
            } catch (err) {
                this.showToast('Save failed: ' + err.message, 'error');
            }
        });
    },

    saveEntryField: async function (entryId, values) {
        try {
            await SupabaseService.updateEntryValues(entryId, values);
            const cacheKey = `template-${this.state.currentTemplate.id}`;
            delete this.state.cache[cacheKey];
        } catch (err) {
            this.showToast('Save failed: ' + err.message, 'error');
        }
    },

    editEntry: async function (id) {
        try {
            const entry = await SupabaseService.getEntry(id);
            this.state.editingId = id;
            this.state.editingValues = entry.values;

            const editForm = document.getElementById('editForm');
            const columns = this.state.currentTemplate.columns || [];

            editForm.innerHTML = columns.map(col => {
                const colDef = col.encoding_columns;
                const val = entry.values[colDef.column_name] || '';
                return `
                    <div class="input-box">
                        <label>${colDef.column_name}</label>
                        <input type="text"
                            id="edit_input_${colDef.id}"
                            data-column-id="${colDef.id}"
                            data-column-name="${colDef.column_name}"
                            value="${val.toString().replace(/"/g, '&quot;')}"
                            placeholder="Enter ${colDef.column_name}">
                    </div>
                `;
            }).join('');

            document.getElementById('editModal').style.display = 'block';
        } catch (error) {
            this.showToast('Failed to load entry: ' + error.message, 'error');
        }
    },

    closeEditModal: function () {
        document.getElementById('editModal').style.display = 'none';
        this.state.editingId = null;
    },

    saveEditEntry: async function () {
        if (!this.state.editingId) return;

        try {
            const values = {};
            // Fixes data bleeding by scoping to #editForm
            const inputs = document.querySelectorAll('#editForm [data-column-id]');
            
            inputs.forEach(input => {
                values[input.dataset.columnId] = input.value;
            });

            await SupabaseService.updateEntryValues(this.state.editingId, values);
            
            this.closeEditModal();
            this.showToast('Entry updated successfully!');
            await this.loadEntries(this.state.currentTemplateId);
        } catch (error) {
            console.error('Error updating entry:', error);
            this.showToast('Error updating entry', 'error');
        }
    },

    // ============================================================
    // TEMPLATES
    // ============================================================
    refreshTemplates: async function () {
        try {
            this.state.allTemplates = await SupabaseService.getTemplates(this.state.departmentId);
            this.state.allColumns = await SupabaseService.getColumns(this.state.departmentId);
            this.renderCategoryCards();
        } catch (error) {
            this.showToast('Failed to load templates: ' + error.message, 'error');
        }
    },

    renderCategoryCards: function (filteredTemplates) {
        const container = document.getElementById('categoryCards');
        if (!container) return;
        const templates = filteredTemplates || this.state.allTemplates;
        container.innerHTML = templates.map(t => {
            const hue   = Math.abs(t.name.split('').reduce((a, b) => (((a << 5) - a) + b.charCodeAt(0)) | 0, 0)) % 360;
            const color = `hsla(${hue}, 60%, 82%, 1)`;
            return `
            <div class="category-card" id="card-${t.id}" style="background-color:${color};" onclick="switchTemplate('${t.id}')">
                <div class="card-menu" onclick="event.stopPropagation()">
                    <button class="menu-btn" onclick="toggleMenu(event, '${t.id}')">⋮</button>
                    <div class="dropdown" id="menu-${t.id}">
                        <button onclick="renameCategory('${t.id}', '${t.name}')">✏️ Rename</button>
                        <button onclick="deleteTemplate('${t.id}', '${t.name}')">🗑️ Delete</button>
                    </div>
                </div>
                <div class="card-icon">${t.name.substring(0, 2).toUpperCase()}</div>
                <span class="card-label">${t.name}</span>
            </div>`;
        }).join('');
    },

    filterCategoryCards: function () {
        const searchInput = document.getElementById('categorySearch');
        if (!searchInput) return;
        const term = searchInput.value.toLowerCase();
        const filtered = this.state.allTemplates.filter(t => t.name.toLowerCase().includes(term));
        this.renderCategoryCards(filtered);
    },

    createNewTemplate: async function () {
        const name = document.getElementById('newCategoryName').value.trim();
        const templateType = document.getElementById('newTemplateType').value || 'encoding';
        if (!name) return this.showToast('Template name is required.', 'error');

        try {
            const template = await SupabaseService.createTemplate(
                this.state.departmentId,
                name,
                null,
                templateType // Pass template type
            );

            this.state.allTemplates.push(template);
            this.renderCategoryCards();
            this.showToast(`Template created (Type: ${templateType})!`);
            document.getElementById('newCategoryName').value = '';
            document.getElementById('newTemplateType').value = 'encoding';
            window.closeModal();
        } catch (error) {
            this.showToast('Failed: ' + error.message, 'error');
        }
    },

    deleteTemplate: async function (id, name) {
        if (!confirm(`Delete "${name}"? All data will be lost.`)) return;

        try {
            await SupabaseService.deleteTemplate(id);
            this.state.allTemplates = this.state.allTemplates.filter(t => t.id !== id);
            const cacheKey = `template-${id}`;
            delete this.state.cache[cacheKey];
            
            if (this.state.currentTemplate?.id === id) {
                this.state.currentTemplate = null;
                document.getElementById('moduleWorkspace').style.display = 'none';
            }

            this.renderCategoryCards();
            this.showToast('Template deleted.');
        } catch (error) {
            this.showToast('Failed: ' + error.message, 'error');
        }
    },

    // ============================================================
    // COLUMNS
    // ============================================================
    addColumnToTemplate: async function () {
        const name = document.getElementById('newColumnName').value.trim();
        if (!name) return this.showToast('Column name is required.', 'error');
        if (!this.state.currentTemplate) return this.showToast('No template selected.', 'error');

        try {
            // Create reusable column
            const column = await SupabaseService.createColumn(
                this.state.departmentId,
                name,
                'text'
            );

            // Add to current template
            await SupabaseService.addColumnToTemplate(
                this.state.currentTemplate.id,
                column.id
            );

            // Refresh
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);
            this.renderAll();
            this.showToast('Column added!');
            document.getElementById('newColumnName').value = '';
            window.closeColumnModal();
        } catch (error) {
            this.showToast('Failed to add column: ' + error.message, 'error');
        }
    },

    deleteColumn: async function (columnId, columnName) {
        if (!confirm(`Delete column "${columnName}"? This affects all records.`)) return;

        try {
            // Remove from template
            await SupabaseService.removeColumnFromTemplate(
                this.state.currentTemplate.id,
                columnId
            );

            // Refresh
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);

            const cacheKey = `template-${this.state.currentTemplate.id}`;
            delete this.state.cache[cacheKey];

            this.renderAll();
            this.showToast('Column deleted.');
        } catch (error) {
            this.showToast('Failed: ' + error.message, 'error');
        }
    },

    // ============================================================
    // ENTRIES — SAVE / DELETE
    // ============================================================
       saveData: async function () {
        const core = AppCore;

        if (!core.state.currentTemplateId) {
            core.showToast('Please select a template first', 'error');
            return;
        }

        try {
            // 1. Create the base entry record
            const entry = await SupabaseService.createEntry(
                core.state.currentTemplateId, 
                core.state.departmentId
            );

            // 2. Collect values from the dynamic form
            const values = {};
            const inputs = document.querySelectorAll('#dynamicForm [data-column-id]');
            
            inputs.forEach(input => {
                if (input.value && input.value.trim() !== '') {
                    values[input.dataset.columnId] = input.value;
                }
            });

            // 3. Save the values if any were entered
            if (Object.keys(values).length > 0) {
                await SupabaseService.updateEntryValues(entry.id, values);
            }

            // 4. UI Feedback
            inputs.forEach(input => input.value = '');
            core.showToast('Data saved successfully!');
            
            // 5. Refresh Table using the now-defined function
            await core.loadEntries(core.state.currentTemplateId);

        } catch (error) {
            console.error('Error saving data:', error);
            core.showToast('Error saving data: ' + error.message, 'error');
        }
    },

    deleteEntry: async function (id) {
        if (!confirm('Are you sure you want to delete this record?')) return;

        try {
            await SupabaseService.deleteEntry(id);
            this.showToast('Record deleted!');

            const cacheKey = `template-${this.state.currentTemplate.id}`;
            delete this.state.cache[cacheKey];
            this.state.localEntries = await SupabaseService.getEntries(this.state.currentTemplate.id);
            this.renderTable(this.state.localEntries);
        } catch (error) {
            this.showToast('Failed to delete: ' + error.message, 'error');
        }
    },

    // ============================================================
    // SEARCH & SORT
    // ============================================================
    searchData: function () {
        const term     = document.getElementById('search').value.toLowerCase();
        const filtered = this.state.localEntries.filter(e => {
            // Search across all values in the entry
            const values = e.valueDetails || [];
            return values.some(v => 
                String(v.value || v.value_number || '').toLowerCase().includes(term)
            );
        });
        this.renderTable(filtered);
    },

    sortByDate: function () {
        const columns = this.state.currentTemplate.columns || [];
        const dateColDef = columns.find(col => col.encoding_columns.column_type === 'date');
        if (!dateColDef) return this.showToast('No date column found.', 'error');
        
        const dateColId = dateColDef.encoding_columns.id;
        
        this.state.localEntries.sort((a, b) => {
            const aVal = a.valueDetails?.find(v => v.column_id === dateColId)?.value || '0';
            const bVal = b.valueDetails?.find(v => v.column_id === dateColId)?.value || '0';
            const d1 = new Date(aVal);
            const d2 = new Date(bVal);
            return this.state.dateSortAsc ? d1 - d2 : d2 - d1;
        });
        this.state.dateSortAsc = !this.state.dateSortAsc;
        this.renderTable(this.state.localEntries);
    },

    // ============================================================
    // EXPORT
    // ============================================================
    exportToExcel: function () {
        if (!this.state.currentTemplate) 
            return this.showToast('No template selected.', 'error');

        if (!this.state.localEntries.length) 
            return this.showToast('No data to export.', 'error');

        const columns = this.state.currentTemplate.columns || [];

        // Build ordered data from new schema
        const formatted = this.state.localEntries.map(entry => {
            const row = {};
            columns.forEach(col => {
                const colDef = col.encoding_columns;
                const valueEntry = entry.valueDetails?.find(v => v.column_id === colDef.id);
                row[colDef.column_name] = valueEntry?.value || valueEntry?.value_number || '';
            });
            return row;
        });

        const ws = XLSX.utils.json_to_sheet(formatted);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, this.state.currentTemplate.name);
        XLSX.writeFile(wb, `${this.state.currentTemplate.name}.xlsx`);
        this.showToast('Exported successfully!');
    },

    // ============================================================
    // DATE PARSING UTILITIES  (FIX #1)
    // Handles: serial, YYYY-MM-DD, DD-Mon-YY, DD-Mon-YYYY,
    //          MM/DD/YYYY, DD/MM/YYYY, Month DD YYYY, etc.
    // ============================================================
    MONTH_MAP: {
        jan:'01',feb:'02',mar:'03',apr:'04',may:'05',jun:'06',
        jul:'07',aug:'08',sep:'09',oct:'10',nov:'11',dec:'12'
    },

    excelSerialToISO: function (serial) {
        const num = parseInt(serial, 10);
        if (isNaN(num) || num < 1) return null;
        const date = new Date(Date.UTC(1899, 11, 30) + num * 86400000);
        return this._dateToISO(date);
    },

    _dateToISO: function (date) {
        const yyyy = date.getUTCFullYear();
        const mm   = String(date.getUTCMonth() + 1).padStart(2, '0');
        const dd   = String(date.getUTCDate()).padStart(2, '0');
        return `${yyyy}-${mm}-${dd}`;
    },

    formatDateDisplay: function (date) {
        if (!(date instanceof Date) || isNaN(date.getTime())) return '';
        const day   = date.getUTCDate();
        const mon   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][date.getUTCMonth()];
        const year  = String(date.getUTCFullYear()).slice(-2);
        return `${day}-${mon}-${year}`;
    },

    isExcelSerial: function (value) {
        const num = Number(value);
        return Number.isInteger(num) && num > 1 && num < 100000;
    },

    // FIX #1: Parse any common date string into YYYY-MM-DD
    anyDateToISO: function (raw) {
        if (!raw && raw !== 0) return '';
        if (raw instanceof Date && !isNaN(raw.getTime())) return this._dateToISO(raw);
        if (typeof raw === 'number') return this.excelSerialToISO(raw) || '';

        const s = String(raw).trim();
        if (!s) return '';

        // Already ISO: 2024-10-15
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

        // Excel serial number
        if (this.isExcelSerial(s)) return this.excelSerialToISO(s);

        // DD-Mon-YY or DD-Mon-YYYY  e.g. 15-Oct-24, 15-Oct-2024
        const dMonY = s.match(/^(\d{1,2})[-\/\s]([A-Za-z]{3,})[-\/\s](\d{2,4})$/);
        if (dMonY) {
            const dd   = dMonY[1].padStart(2, '0');
            const mon  = this.MONTH_MAP[dMonY[2].toLowerCase().substring(0, 3)];
            let   year = dMonY[3];
            if (year.length === 2) year = parseInt(year) < 50 ? '20' + year : '19' + year;
            if (mon) return `${year}-${mon}-${dd}`;
        }

        // Mon-DD-YYYY or Mon DD YYYY  e.g. Oct-15-2024, October 15 2024
        const monDY = s.match(/^([A-Za-z]{3,})[-\/\s](\d{1,2})[-\/\s](\d{2,4})$/);
        if (monDY) {
            const mon  = this.MONTH_MAP[monDY[1].toLowerCase().substring(0, 3)];
            const dd   = monDY[2].padStart(2, '0');
            let   year = monDY[3];
            if (year.length === 2) year = parseInt(year) < 50 ? '20' + year : '19' + year;
            if (mon) return `${year}-${mon}-${dd}`;
        }

        // MM/DD/YYYY or DD/MM/YYYY — try MM/DD/YYYY first (US), fallback
        const slashParts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
        if (slashParts) {
            let [, p1, p2, year] = slashParts;
            if (year.length === 2) year = parseInt(year) < 50 ? '20' + year : '19' + year;
            const mm = p1.padStart(2, '0');
            const dd = p2.padStart(2, '0');
            return `${year}-${mm}-${dd}`;
        }

        // Try native Date parse as last resort
        const d = new Date(s);
        if (!isNaN(d.getTime())) return this._dateToISO(d);

        return s; // return as-is if nothing matched
    },

    // ============================================================
    // IMPORT FROM EXCEL
    // ============================================================
    _el: function (id) { return document.getElementById(id); },

    openImportModal: function () {
        if (!this.state.currentTemplate)
            return this.showToast('Select a template first.', 'error');
        const columns = this.state.currentTemplate.columns || [];
        if (!columns.length)
            return this.showToast('Add columns to template before importing.', 'error');
        document.getElementById('importModal').style.display = 'block';
    },

    closeImportModal: function () {
        const modal = this._el('importModal');
        if (modal) modal.style.display = 'none';

        const safe = (id, prop, val) => { const el = this._el(id); if (el) el[prop] = val; };
        safe('importFile',        'value',     '');
        safe('importHeaderRow',   'value',     '1');
        safe('importSheet',       'innerHTML', '<option>— load a file first —</option>');
        safe('importSheet',       'disabled',  true);
        safe('importConfirmBtn',  'disabled',  true);
        safe('importPreview',     'innerHTML', '');
        safe('importExcelHeaders','innerHTML', '');
        safe('importColMapping',  'innerHTML', '');

        this.state._importWorkbook  = null;
        this.state._importExcelCols = [];
    },

    loadSheets: function () {
        const file = this._el('importFile')?.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const workbook = XLSX.read(e.target.result, { type: 'array', cellDates: true });
                this.state._importWorkbook = workbook;

                const sheetSelect = this._el('importSheet');
                sheetSelect.innerHTML = workbook.SheetNames.map(
                    name => `<option value="${name}">${name}</option>`
                ).join('');
                sheetSelect.disabled = false;
                sheetSelect.onchange = () => this.previewSheet();
                this.previewSheet();
            } catch (err) {
                this.showToast('Could not read file: ' + err.message, 'error');
            }
        };
        reader.readAsArrayBuffer(file);
    },

    previewSheet: function () {
        if (!this.state._importWorkbook) return;

        const sheetSelect = this._el('importSheet');
        const headerInput = this._el('importHeaderRow');
        const preview     = this._el('importPreview');
        const confirmBtn  = this._el('importConfirmBtn');
        const excelHdrs   = this._el('importExcelHeaders');
        const colMapping  = this._el('importColMapping');

        if (!sheetSelect || !preview || !confirmBtn) return;

        const sheetName = sheetSelect.value;
        const headerRow = Math.max(1, parseInt(headerInput?.value || '1') || 1);
        const ws        = this.state._importWorkbook.Sheets[sheetName];

        let rows = [];
        try {
            rows = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRow - 1, raw: false });
        } catch (err) {
            preview.innerHTML   = `<span style="color:#ef4444;">Error reading sheet: ${err.message}</span>`;
            confirmBtn.disabled = true;
            return;
        }

        if (!rows.length) {
            preview.innerHTML   = '<span style="color:#ef4444;">No data found. Try a different header row number.</span>';
            if (excelHdrs) excelHdrs.innerHTML = '';
            if (colMapping) colMapping.innerHTML = '';
            confirmBtn.disabled = true;
            return;
        }

        const excelCols = Object.keys(rows[0]);
        this.state._importExcelCols = excelCols;

        // Show detected Excel columns
        if (excelHdrs) {
            excelHdrs.innerHTML = `
                <p class="import-section-label">Detected Excel columns (row ${headerRow})</p>
                <div class="import-excel-cols">${excelCols.join(' &middot; ')}</div>
            `;
        }

        // Build a dropdown per DB column so user can pick which Excel column maps to it
        if (colMapping) {
            const columns = this.state.currentTemplate.columns || [];
            const optionsHtml = `<option value="">(skip)</option>` +
                excelCols.map(c => `<option value="${c.replace(/"/g, '&quot;')}">${c}</option>`).join('');

            colMapping.innerHTML = `
                <p class="import-section-label" style="margin-top:12px;">Map columns</p>
                <div class="col-mapping-grid">
                    ${columns.map(col => {
                        const colDef = col.encoding_columns;
                        // Auto-select exact match (case-insensitive)
                        const autoMatch = excelCols.find(
                            ec => ec.trim().toLowerCase() === colDef.column_name.trim().toLowerCase()
                        ) || '';
                        return `
                        <div class="col-mapping-row">
                            <span class="col-mapping-label" title="${colDef.column_type}">${colDef.column_name}
                                <small class="col-type-badge">${colDef.column_type}</small>
                            </span>
                            <select class="col-mapping-select" data-db-col="${colDef.column_name}" data-col-type="${colDef.column_type}">
                                ${optionsHtml}
                            </select>
                        </div>`;
                    }).join('')}
                </div>
            `;

            // Set auto-matched selections
            columns.forEach(col => {
                const colDef = col.encoding_columns;
                const autoMatch = excelCols.find(
                    ec => ec.trim().toLowerCase() === colDef.column_name.trim().toLowerCase()
                );
                if (autoMatch) {
                    const sel = colMapping.querySelector(`select[data-db-col="${colDef.column_name}"]`);
                    if (sel) sel.value = autoMatch;
                }
            });
        }

        preview.innerHTML = `
            <div class="import-preview-box">
                <div><strong>${rows.length.toLocaleString()} data rows</strong> found in sheet</div>
                <div style="font-size:11px;color:#64748b;margin-top:4px;">
                    Select which Excel column maps to each of your DB columns above.
                    Columns set to "(skip)" will not be stored — those fields will simply be absent.
                </div>
            </div>
        `;

        confirmBtn.disabled = false;
    },

    // FIX #1: Convert a value based on the column type
    convertValue: function (raw, colType) {
        if (colType === 'date') {
            if (raw instanceof Date && !isNaN(raw.getTime())) {
                return this.formatDateDisplay(raw);
            }
            if (typeof raw === 'number') {
                const date = new Date(Date.UTC(1899, 11, 30) + raw * 86400000);
                return this.formatDateDisplay(date);
            }
            const s = String(raw ?? '').trim();
            return s;
        }

        const s = String(raw ?? '').trim();
        if (!s) return '';


        if (colType === 'number') {
            // Strip commas from numbers like "1,440"
            const cleaned = s.replace(/,/g, '');
            return isNaN(Number(cleaned)) ? s : cleaned;
        }

        return s;
    },

    // FIX #3 + #5: confirmImport now uses mapping UI and re-fetches ordered data
    confirmImport: async function () {
        if (!this.state._importWorkbook) return this.showToast('No file loaded.', 'error');
        if (!this.state.currentTemplate)  return this.showToast('No template selected.', 'error');

        const sheetName = this._el('importSheet')?.value;
        const headerRow = Math.max(1, parseInt(this._el('importHeaderRow')?.value || '1') || 1);
        const ws        = this.state._importWorkbook.Sheets[sheetName];
        let rows        = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRow - 1, raw: false });

        if (!rows.length) return this.showToast('No data rows to import.', 'error');

        // Read the manual column mapping from UI FIRST
        const mappingSelects = document.querySelectorAll('.col-mapping-select');
        const mapping = {}; // dbColName -> excelColName
        mappingSelects.forEach(sel => {
            const dbCol  = sel.dataset.dbCol;
            const excelCol = sel.value;
            if (dbCol && excelCol) mapping[dbCol] = excelCol;
        });

        console.log('Column mapping:', mapping);

        const columns = this.state.currentTemplate.columns || [];
        
        // Get list of mapped columns (those that are NOT skipped)
        const mappedExcelCols = [];
        columns.forEach(col => {
            const excelColName = mapping[col.encoding_columns.column_name];
            if (excelColName && excelColName !== '(skip)') {
                mappedExcelCols.push(excelColName);
            }
        });
        
        console.log(`Filtering by ${mappedExcelCols.length} mapped columns: ${mappedExcelCols.join(', ')}`);

        // FILTER BEFORE PROCESSING: Check if each row has ANY data in the MAPPED columns
        const rowsWithData = rows.filter((row, idx) => {
            // Get values ONLY from mapped columns (trim whitespace)
            const mappedValues = mappedExcelCols.map(colName => String(row[colName] || '').trim());
            // Keep row only if at least ONE mapped cell has actual data
            const hasData = mappedValues.some(v => v && v !== '');
            if (!hasData) {
                console.warn(`Row ${idx} skipped (all mapped columns empty):`, row);
            }
            return hasData;
        });

        console.log(`✓ Rows to import: ${rowsWithData.length}`);
        console.log(`✗ Completely empty rows (skipped): ${rows.length - rowsWithData.length}`);
        
        if (rowsWithData.length === 0) {
            return this.showToast('No rows with data found in mapped columns.', 'error');
        }

        console.log(`Starting batch import of ${rowsWithData.length} rows...`);
        console.log('First row sample:', JSON.stringify(rowsWithData[0]));

        const confirmBtn = this._el('importConfirmBtn');
        if (confirmBtn) { confirmBtn.disabled = true; confirmBtn.innerText = 'Importing...'; }

        try {
            
            // STEP 1: Batch create entries for all rows with any data
            console.log(`Creating ${rowsWithData.length} entries...`);
            const entries = await SupabaseService.createEntries(
                this.state.currentTemplate.id,
                this.state.departmentId,
                rowsWithData.length
            );
            console.log(`Created ${entries.length} entries`);

            // STEP 2: Build ALL values for ALL entries in memory first
            console.log(`Preparing values for all rows...`);
            const allValues = [];
            
            rowsWithData.forEach((row, idx) => {
                const entry = entries[idx];
                const values = {};
                
                columns.forEach(col => {
                    const colDef = col.encoding_columns;
                    const excelColName = mapping[colDef.column_name];
                    
                    if (!excelColName || excelColName === '(skip)') return;
                    
                    const rawVal = row[excelColName];
                    if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
                        const convertedVal = this.convertValue(String(rawVal).trim(), colDef.column_type);
                        values[colDef.id] = convertedVal;
                    }
                });

                // Add all value records for this entry to the batch
                Object.entries(values).forEach(([columnId, value]) => {
                    allValues.push({
                        entry_id: entry.id,
                        column_id: columnId,
                        value: typeof value === 'number' ? null : String(value),
                        value_number: typeof value === 'number' ? value : null
                    });
                });
                
                // Log first few rows for debugging
                if (idx < 3) {
                    console.log(`Row ${idx} values:`, JSON.stringify(values));
                }
            });

            // STEP 3: Insert ALL values in one batch call
            console.log(`Inserting ${allValues.length} column values in batch...`);
            if (allValues.length > 0) {
                const { error: valuesError } = await SupabaseService.client
                    .from('encoding_entry_values')
                    .upsert(allValues, { onConflict: 'entry_id,column_id' });
                
                if (valuesError) throw valuesError;
            }

            console.log(`All values inserted. Reloading entries...`);

            // Reload entries
            const cacheKey = `template-${this.state.currentTemplate.id}`;
            delete this.state.cache[cacheKey];
            this.state.localEntries = await SupabaseService.getEntries(this.state.currentTemplate.id);
            this.renderTable(this.state.localEntries);
            this.closeImportModal();
            this.showToast(`${rowsWithData.length} rows imported successfully!`);
        } catch (err) {
            console.error('Import error:', err);
            this.showToast('Import failed: ' + err.message, 'error');
        } finally {
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerText = 'Import'; }
        }
    },

    // ============================================================
    // DROPDOWN TOGGLE
    // ============================================================
    toggleMenu: function (event, menuId) {
        event.stopPropagation();
        const menu   = document.getElementById(menuId);
        if (!menu) return;
        const isOpen = menu.style.display === 'block';
        document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none');
        if (!isOpen) menu.style.display = 'block';
    },

    // ============================================================
    //Delete Selection
    // ============================================================
    deleteSelected: async function () {
        const checked = Array.from(document.querySelectorAll('.rowCheckbox:checked'))
            .map(cb => cb.dataset.id)
            .filter(id => id);

        if (!checked.length) return this.showToast('No selected rows.', 'error');

        if (!confirm(`Delete ${checked.length} records?`)) return;

        const deleteBtn = document.querySelector('[onclick*="deleteSelected"]');
        const originalText = deleteBtn?.innerText;
        if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.innerText = `Deleting ${checked.length}...`; }

        try {
            // Delete entries in batches of 100 (service layer handles batching)
            console.log(`Deleting ${checked.length} entries in chunks...`);
            await SupabaseService.deleteEntries(checked);
            console.log(`Deleted ${checked.length} entries`);

            // update UI
            this.state.localEntries = this.state.localEntries.filter(e => !checked.includes(e.id));
            this.renderTable(this.state.localEntries);

            this.showToast(`Deleted ${checked.length} records.`);
        } catch (err) {
            console.error('Delete error:', err);
            this.showToast('Delete failed: ' + err.message, 'error');
        } finally {
            if (deleteBtn) { deleteBtn.disabled = false; deleteBtn.innerText = originalText; }
        }
    },

    renameCategory: async function (id, oldName) {
        const newName = prompt('Enter new template name:', oldName);
        if (!newName || newName.trim() === oldName) return;

        try {
            await SupabaseService.updateTemplate(id, { name: newName.trim() });

            // update local state
            const template = this.state.allTemplates.find(t => t.id === id);
            if (template) template.name = newName.trim();

            this.renderCategoryCards();
            this.showToast('Template renamed!');
        } catch (err) {
            this.showToast('Rename failed: ' + err.message, 'error');
        }
    },    

    renameColumn: async function (id, oldName) {
        const newName = prompt('Enter new column name:', oldName);
        if (!newName || newName.trim() === oldName) return;

        try {
            // Update column in encoding_columns
            await SupabaseService.client
                .from('encoding_columns')
                .update({ column_name: newName.trim() })
                .eq('id', id);

            // Refresh the current template to get updated column names
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);
            this.renderAll();
            this.showToast('Column renamed!');
        } catch (err) {
            this.showToast('Rename failed: ' + err.message, 'error');
        }
    },

    //Column Drag
    enableColumnDrag: function () {
        const headerRow = document.querySelector('#tableHeaders tr');
        if (!headerRow) return;

        let dragStartIndex = null;

        const getIndex = (th) => {
            return Array.from(th.parentNode.children).indexOf(th);
        };

        headerRow.querySelectorAll('th').forEach((th, index) => {
            if (index === 0) return; // skip checkbox column

            th.setAttribute('draggable', true);

            th.addEventListener('dragstart', (e) => {
                dragStartIndex = getIndex(th);
                th.classList.add('dragging');
            });

            th.addEventListener('dragover', (e) => {
                e.preventDefault();
            });

            th.addEventListener('drop', (e) => {
                e.preventDefault();

                const dragEndIndex = getIndex(th);
                if (dragStartIndex === dragEndIndex) return;

                this.moveColumn(dragStartIndex, dragEndIndex);
            });

            th.addEventListener('dragend', () => {
                th.classList.remove('dragging');
            });
        });
    },   

    moveColumn: function (from, to) {
        const columns = this.state.currentTemplate.columns || [];
        if (!columns.length) return;

        // adjust index (skip checkbox column)
        from -= 1;
        to   -= 1;

        if (from < 0 || to < 0 || from >= columns.length || to >= columns.length) return;

        const moved = columns.splice(from, 1)[0];
        columns.splice(to, 0, moved);

        // Save updated positions to database
        Promise.all(columns.map((tc, idx) =>
            SupabaseService.client
                .from('encoding_template_columns')
                .update({ display_order: idx })
                .eq('id', tc.id)
        )).then(() => {
            this.renderAll();
        }).catch(err => {
            this.showToast('Failed to update column order: ' + err.message, 'error');
        });
    },

    //-----------------------------------------------------------------------------------------
    //-------------Para sa Computation ng mga cells gamit calculation types------------------
    //-----------------------------------------------------------------------------------------
    openComputeModal: function () {
        const modal = document.createElement('div');
        modal.className = 'compute-modal';

        const cols = this.state.currentTemplate?.columns || [];
        const colOptions = cols.map(c => `<option value="${c.encoding_columns.column_name}">${c.encoding_columns.column_name}</option>`).join('');

        const calculations = [
            { value: 'sum', label: 'Sum (Total)' },
            { value: 'average', label: 'Average' },
            { value: 'count', label: 'Count' },
            { value: 'max', label: 'Maximum' },
            { value: 'min', label: 'Minimum' },
            { value: 'deduct', label: 'Deduct (Subtract)' }
        ];
        const calcOptions = calculations.map(c => `<option value="${c.value}">${c.label}</option>`).join('');

        modal.innerHTML = `
            <div class="compute-box">
                <h3>Compute Calculation</h3>

                <label>Source Column</label>
                <select id="computeSourceColumn">
                    <option value="">-- Select Column --</option>
                    ${colOptions}
                </select>

                <label>Calculation Type</label>
                <select id="computeCalculationType">
                    <option value="">-- Select Calculation --</option>
                    ${calcOptions}
                </select>

                <label>Target Column Name</label>
                <input id="computeTargetColumn" placeholder="e.g., Total, Average, etc.">

                <label>Apply Mode</label>
                <select id="computeMode">
                    <option value="cell">Selected Cell</option>
                    <option value="column">Whole Column</option>
                </select>

                <div class="compute-actions">
                    <button id="runCompute">Apply</button>
                    <button id="closeCompute">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#closeCompute').onclick = () => modal.remove();

        modal.querySelector('#runCompute').onclick = () => {
            const sourceCol = modal.querySelector('#computeSourceColumn').value;
            const calcType = modal.querySelector('#computeCalculationType').value;
            const targetCol = modal.querySelector('#computeTargetColumn').value;
            const mode = modal.querySelector('#computeMode').value;

            if (!sourceCol || !calcType || !targetCol) {
                return this.showToast('Please fill in all fields', 'error');
            }

            this.applyCalculation(sourceCol, calcType, targetCol, mode);
            modal.remove();
        };
    },

    applyCalculation: function (sourceColumnName, calculationType, targetColumnName, mode) {
        const columns = this.state.currentTemplate?.columns || [];
        
        // Find column definitions to get IDs
        const sourceColDef = columns.find(c => c.encoding_columns.column_name === sourceColumnName)?.encoding_columns;
        const targetColDef = columns.find(c => c.encoding_columns.column_name === targetColumnName)?.encoding_columns;

        if (!sourceColDef) return this.showToast('Source column not found.', 'error');
        if (!targetColDef) return this.showToast(`Target column "${targetColumnName}" not found.`, 'error');

        const sourceColId = sourceColDef.id;
        const targetColId = targetColDef.id;

        const performCalculation = (valuesArray) => {
            // Convert all values to numbers, cleaning out currency symbols/commas
            const nums = valuesArray.map(v => parseFloat(String(v ?? '0').replace(/[^\d.-]/g, '')) || 0);

            switch (calculationType) {
                case 'sum': return nums.reduce((a, b) => a + b, 0);
                case 'average': return nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : 0;
                case 'count': return nums.length;
                case 'max': return nums.length > 0 ? Math.max(...nums) : 0;
                case 'min': return nums.length > 0 ? Math.min(...nums) : 0;
                case 'deduct': return nums.length > 0 ? nums[0] - nums.slice(1).reduce((a, b) => a + b, 0) : 0;
                default: return 0;
            }
        };

        // Get all data from the source column across all rows
        const allSourceValues = this.state.localEntries.map(entry => entry.values[sourceColumnName] ?? '0');
        
        // Calculate the aggregate result (e.g., the sum of the whole column)
        const computedResult = performCalculation(allSourceValues);

        if (mode === 'cell') {
            const td = this.state.currentCell;
            if (!td) return this.showToast('No cell selected', 'error');
            
            const entryId = td.closest('tr').dataset.entryId;
            const entry = this.state.localEntries.find(e => e.id === entryId);

            if (entry) {
                const updatePayload = {};
                updatePayload[targetColId] = computedResult;
                
                // Update local state and details for rendering
                entry.values[targetColumnName] = computedResult;
                let detail = entry.valueDetails.find(v => v.column_id === targetColId);
                if (detail) detail.value = String(computedResult);
                else entry.valueDetails.push({ column_id: targetColId, value: String(computedResult) });

                this.saveEntryField(entry.id, updatePayload);
            }
        }

        if (mode === 'column') {
            this.state.localEntries.forEach(entry => {
                const updatePayload = {};
                updatePayload[targetColId] = computedResult;

                entry.values[targetColumnName] = computedResult;
                let detail = entry.valueDetails.find(v => v.column_id === targetColId);
                if (detail) detail.value = String(computedResult);
                else entry.valueDetails.push({ column_id: targetColId, value: String(computedResult) });
                
                this.saveEntryField(entry.id, updatePayload);
            });
        }

        this.renderTable(this.state.localEntries);
        this.showToast('Calculation applied successfully!');
    },
};