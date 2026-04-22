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
        tableEventsInitialized: false,
        historyStack: [],
        // AUTO-UPDATE: Track cell formulas for recalculation
        cellFormulas:           {},             // { "entryId|columnName": "formula", ... }
        columnFormulas:         {},             // { "columnName": "formula" } for per-row calculations
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
        window.openColumnModal   = async (groupName) => this.openColumnModal(groupName);
        window.closeColumnModal  = ()          => document.getElementById('columnModal').style.display = 'none';
        window.openRenameGroupModal = (oldGroupName) => this.openRenameGroupModal(oldGroupName);
        window.closeRenameGroupModal = () => this.closeRenameGroupModal();
        window.confirmRenameGroup = () => this.confirmRenameGroup();

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
        window.applyCellColor = () => this.applyCellColor();
        window.openColorModal = () => this.openColorModal();
        window.closeColorModal = () => this.closeColorModal();

        window.addEventListener('click', () => {
            document.querySelectorAll('.dropdown').forEach(d => d.style.display = 'none');
        });

        this.ensureContextMenu();

        // TARGET BUTTON (no radio, toggle active)
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('target-btn')) {
                document.querySelectorAll('.target-btn')
                    .forEach(btn => btn.classList.remove('active'));

                e.target.classList.add('active');
            }
        });

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

        document.getElementById('ctxComputeColumn')?.addEventListener('click', () => {
            if (this.state.currentColName) {
                this.openColumnComputeModal();
            }
        });

        document.getElementById('ctxColor')?.addEventListener('click', () => {
            this.openColorModal();
        });

        document.getElementById('ctxAddColumnToGroup')?.addEventListener('click', () => {
            if (this.state.currentGroupName) {
                this.openColumnModal(this.state.currentGroupName);
            }
        });
    },

    ensureContextMenu: function () {
        this.injectContextMenuStyles();
        
        // Remove existing menu if present to force recreation
        const existingMenu = document.getElementById('contextMenu');
        if (existingMenu) {
            existingMenu.remove();
        }

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

        const computeColBtn = document.createElement('button');
        computeColBtn.id = 'ctxComputeColumn';
        computeColBtn.type = 'button';
        computeColBtn.textContent = 'Compute Specific Column';

        const colorBtn = document.createElement('button');
        colorBtn.id = 'ctxColor';
        colorBtn.type = 'button';
        colorBtn.textContent = 'Cell Color';

        const deleteCompBtn = document.createElement('button');
        deleteCompBtn.id = 'ctxDeleteComputation';
        deleteCompBtn.type = 'button';
        deleteCompBtn.textContent = 'Delete Column Computation';
        deleteCompBtn.className = 'delete';
        deleteCompBtn.addEventListener('click', () => {
            this.deleteColumnComputation();
        });

        const addColToGroupBtn = document.createElement('button');
        addColToGroupBtn.id = 'ctxAddColumnToGroup';
        addColToGroupBtn.type = 'button';
        addColToGroupBtn.textContent = 'Add Column to Group';
        addColToGroupBtn.style.display = 'none';

        const renameGroupBtn = document.createElement('button');
        renameGroupBtn.id = 'ctxRenameGroup';
        renameGroupBtn.type = 'button';
        renameGroupBtn.textContent = 'Rename Group';
        renameGroupBtn.style.display = 'none';
        renameGroupBtn.addEventListener('click', () => {
            if (this.state.currentGroupName) {
                this.renameGroup(this.state.currentGroupName);
            }
        });

        menu.appendChild(addColToGroupBtn);
        menu.appendChild(renameGroupBtn);
        menu.appendChild(computeColBtn);
        menu.appendChild(computeBtn);
        menu.appendChild(colorBtn);
        menu.appendChild(deleteCompBtn);
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
                outline: 2px solid #2563eb;
                outline-offset: -2px;
            }

            tbody td.cell-selected {
                outline: 2px solid #3b82f6;
                outline-offset: -2px;
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

            tr.row-selected {
                box-shadow: 0 0 0 2px #3b82f6;
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

            // AUTO-UPDATE: Clear formula state when switching templates
            this.state.cellFormulas = {};
            this.state.columnFormulas = {};

            this.updateActiveUI(templateId);
            this.renderAll();

            // LOAD SAVED FORMULAS: Load cell and column formulas from database
            await this.loadSavedFormulas();

            // Load saved column computations
            await this.loadColumnComputations();
        } catch (error) {
            this.showToast('Switch failed: ' + error.message, 'error');
        } finally {
            workspace.style.opacity = '1';
            workspace.style.pointerEvents = 'auto';
            this.state.isLoading = false;
        }
    },

    updateActiveUI: function (templateId) {
        document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
        const activeCard = document.getElementById(`card-${templateId}`);
        if (activeCard) activeCard.classList.add('active');
    },

    loadEntries: async function (templateId) {
        try {
            const entries = await SupabaseService.getEntries(templateId);
            this.state.localEntries = entries;

            const cacheKey = `template-${templateId}`;
            if (this.state.cache[cacheKey]) {
                this.state.cache[cacheKey].entries = entries;
            }

            this.renderTable(this.state.localEntries);

            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }
        } catch (error) {
            console.error('Error loading entries:', error);
            this.showToast('Error loading data', 'error');
        }
    },

    // ============================================================
    // RENDER
    // ============================================================
    renderAll: function () {
        const form = document.getElementById('dynamicForm');
        if (!form) return;

        // Reset header rename initialization to re-attach event listeners
        this.state.headerRenameInitialized = false;

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

        // Generate header rows preserving original column order
        let headerHTML = '<tr><th><input type="checkbox" id="selectAll"></th>';
        let secondRowHTML = '';
        let needsSecondRow = false;

        let currentGroup = null;
        let groupStartIndex = -1;

        for (let i = 0; i < columns.length; i++) {
            const col = columns[i];
            const colDef = col.encoding_columns;
            const groupName = colDef.group_name || null;

            if (groupName && groupName !== currentGroup) {
                // Close previous group if exists
                if (currentGroup && groupStartIndex !== -1) {
                    const groupLength = i - groupStartIndex;
                    headerHTML += `<th colspan="${groupLength}" class="group-header" data-group-name="${currentGroup}"><span class="group-name">${currentGroup}</span></th>`;
                    for (let j = groupStartIndex; j < i; j++) {
                        const groupCol = columns[j];
                        const groupColDef = groupCol.encoding_columns;
                        secondRowHTML += `
                            <th data-col-id="${groupColDef.id}" data-col-name="${groupColDef.column_name}">
                                <div class="th-inner">
                                    <span class="th-text">${groupColDef.column_name}</span>
                                    <button class="del-col-btn" title="Delete column"
                                        onclick="deleteColumn('${groupColDef.id}', '${groupColDef.column_name}')">✕</button>
                                </div>
                            </th>
                        `;
                    }
                }
                // Start new group
                currentGroup = groupName;
                groupStartIndex = i;
                needsSecondRow = true;
            } else if (!groupName && currentGroup) {
                // Close previous group when hitting ungrouped column
                if (groupStartIndex !== -1) {
                    const groupLength = i - groupStartIndex;
                    headerHTML += `<th colspan="${groupLength}" class="group-header" data-group-name="${currentGroup}"><span class="group-name">${currentGroup}</span></th>`;
                    for (let j = groupStartIndex; j < i; j++) {
                        const groupCol = columns[j];
                        const groupColDef = groupCol.encoding_columns;
                        secondRowHTML += `
                            <th data-col-id="${groupColDef.id}" data-col-name="${groupColDef.column_name}">
                                <div class="th-inner">
                                    <span class="th-text">${groupColDef.column_name}</span>
                                    <button class="del-col-btn" title="Delete column"
                                        onclick="deleteColumn('${groupColDef.id}', '${groupColDef.column_name}')">✕</button>
                                </div>
                            </th>
                        `;
                    }
                }
                currentGroup = null;
                groupStartIndex = -1;
            }

            // For ungrouped columns, add header with rowspan=2
            if (!groupName) {
                headerHTML += `
                    <th data-col-id="${colDef.id}" data-col-name="${colDef.column_name}" rowspan="2">
                        <div class="th-inner">
                            <span class="th-text">${colDef.column_name}</span>
                            <button class="del-col-btn" title="Delete column"
                                onclick="deleteColumn('${colDef.id}', '${colDef.column_name}')">✕</button>
                        </div>
                    </th>
                `;
            }
        }

        // Close last group if exists
        if (currentGroup && groupStartIndex !== -1) {
            const groupLength = columns.length - groupStartIndex;
            headerHTML += `<th colspan="${groupLength}" class="group-header" data-group-name="${currentGroup}"><span class="group-name">${currentGroup}</span></th>`;
            for (let j = groupStartIndex; j < columns.length; j++) {
                const groupCol = columns[j];
                const groupColDef = groupCol.encoding_columns;
                secondRowHTML += `
                    <th data-col-id="${groupColDef.id}" data-col-name="${groupColDef.column_name}">
                        <div class="th-inner">
                            <span class="th-text">${groupColDef.column_name}</span>
                            <button class="del-col-btn" title="Delete column"
                                onclick="deleteColumn('${groupColDef.id}', '${groupColDef.column_name}')">✕</button>
                        </div>
                    </th>
                `;
            }
        }

        headerHTML += '</tr>';

        // Add second row if needed
        if (needsSecondRow) {
            headerHTML += '<tr><th></th>' + secondRowHTML + '</tr>';
        }

        headers.innerHTML = headerHTML;

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
            const columns = this.state.currentTemplate.columns || [];
            const colSpan = columns.length + 1; // +1 for checkbox column
            body.innerHTML = `<tr><td colspan="${colSpan}" class="no-data">No records found.</td></tr>`;
            return;
        }

        const columns = this.state.currentTemplate.columns || [];

        body.innerHTML = entries.map(entry => {
            // For each entry, we need to get the values from valueDetails
            const valueMap = {};
            const colorMap = {};
            if (entry.valueDetails) {
                entry.valueDetails.forEach(v => {
                    valueMap[v.column_id] = v.value || v.value_number || '';
                    colorMap[v.column_id] = v.cell_color || null;
                });
            }
            
            const isEmpty = !entry.valueDetails || entry.valueDetails.length === 0;

            return `
                <tr data-entry-id="${entry.id}" style="${isEmpty ? 'background-color: #ffffff;' : ''}">
                    <td><input type="checkbox" class="rowCheckbox" data-id="${entry.id}"></td>
                    ${columns.map(col => {
                        const colDef = col.encoding_columns;
                        const val = valueMap[colDef.id] || '';
                        const cellColor = colorMap[colDef.id] || '';
                        const styleAttr = cellColor ? `style="background-color: ${cellColor};"` : '';
                        return `
                            <td contenteditable="true" 
                                data-col-id="${colDef.id}" 
                                data-col-name="${colDef.column_name}"
                                ${styleAttr}>${val}</td>
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

        // keydown — Ctrl+C copies selection, Enter blurs cell, and delete function for delete or backspace button
        body.addEventListener('keydown', (e) => {

            // ✅ DELETE / BACKSPACE — clear selected cells
            if (e.key === 'Delete') {
                const selected = body.querySelectorAll('td.cell-selected');

                // If walang selection, normal behavior lang
                if (!selected.length) return;

                e.preventDefault();

                const changedEntries = new Map();
                const changedCells = []; // Track which cells changed for auto-update

                selected.forEach(td => {
                    td.textContent = ''; // clear UI

                    const info = this.getTableCellInfo(td);
                    if (!info) return;

                    changedCells.push({ entryId: info.entryId, colName: info.colName });

                    if (!changedEntries.has(info.entryId)) {
                        changedEntries.set(info.entryId, {});
                    }

                    changedEntries.get(info.entryId)[info.colId] = '';
                });

                // Save changes sa database
                changedEntries.forEach(async (values, entryId) => {
                    try {
                        await SupabaseService.updateEntryValues(entryId, values);

                        const entry = this.state.localEntries.find(e => e.id === entryId);
                        if (entry) {
                            if (!entry.values) entry.values = {};
                            Object.entries(values).forEach(([colId, val]) => {
                                const col = this.state.currentTemplate.columns
                                    .find(c => c.encoding_columns.id === colId);
                                if (col) {
                                    entry.values[col.encoding_columns.column_name] = val;
                                }
                            });
                        }

                        const cacheKey = `template-${this.state.currentTemplate.id}`;
                        delete this.state.cache[cacheKey];
                    } catch (err) {
                        this.showToast('Delete failed: ' + err.message, 'error');
                    }
                });

                // 🔄 AUTO-UPDATE - Recalculate dependent formulas for each changed cell
                changedCells.forEach(({ entryId, colName }) => {
                    this.autoRecalculateDependentFormulas(colName, entryId);
                });

                // AUTO UPDATE COLUMN COMPUTE
                if (this.state.activeColumnCompute) {
                    this.updateColumnComputation();
                }

                this.showToast(`Cleared ${selected.length} cell(s)`);
                return;
            }

            // ✅ COPY (existing)
            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                const selected = body.querySelectorAll('td.cell-selected');
                if (!selected.length) return;

                e.preventDefault();

                const rowMap = new Map();
                selected.forEach(td => {
                    const row = td.closest('tr');
                    const rows = Array.from(body.rows);
                    const ri = rows.indexOf(row);

                    if (!rowMap.has(ri)) rowMap.set(ri, []);
                    rowMap.get(ri).push(td.textContent);
                });

                const tsv = Array.from(rowMap.keys())
                    .sort((a,b) => a-b)
                    .map(ri => rowMap.get(ri).join('\t'))
                    .join('\n');

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
            const td = e.target.closest('td');
            if (!td) return;

            e.preventDefault();

            // Reset context menu to default state
            const addColToGroupBtn = document.getElementById('ctxAddColumnToGroup');
            const editBtn = document.getElementById('ctxEdit');
            const deleteBtn = document.getElementById('ctxDelete');
            const computeBtn = document.getElementById('ctxCompute');
            const computeColBtn = document.getElementById('ctxComputeColumn');
            const colorBtn = document.getElementById('ctxColor');
            const deleteCompBtn = document.getElementById('ctxDeleteComputation');

            if (addColToGroupBtn) addColToGroupBtn.style.display = 'none';
            if (editBtn) editBtn.style.display = 'flex';
            if (deleteBtn) deleteBtn.style.display = 'flex';
            if (computeBtn) computeBtn.style.display = 'flex';
            if (computeColBtn) computeColBtn.style.display = 'flex';
            if (colorBtn) colorBtn.style.display = 'flex';

            // Show/hide delete column computation button based on active computation and column alignment
            if (deleteCompBtn) {
                const clickedColName = td.dataset.colName;
                const isComputedColumn = this.state.activeColumnCompute &&
                                        clickedColName === this.state.activeColumnCompute.column;
                deleteCompBtn.style.display = isComputedColumn ? 'flex' : 'none';
            }

            // Clear group name since we're not clicking on a group header
            this.state.currentGroupName = null;

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

                // Right-click handler for group headers
                headerRow.addEventListener('contextmenu', (e) => {
                    const groupHeader = e.target.closest('th.group-header');
                    if (!groupHeader) return;

                    e.preventDefault();

                    const groupName = groupHeader.dataset.groupName;
                    if (!groupName) return;

                    // Store the group name
                    this.state.currentGroupName = groupName;

                    // Show "Add Column to Group" and "Rename Group" options, hide others
                    const addColToGroupBtn = document.getElementById('ctxAddColumnToGroup');
                    const renameGroupBtn = document.getElementById('ctxRenameGroup');
                    const editBtn = document.getElementById('ctxEdit');
                    const deleteBtn = document.getElementById('ctxDelete');
                    const computeBtn = document.getElementById('ctxCompute');
                    const computeColBtn = document.getElementById('ctxComputeColumn');
                    const colorBtn = document.getElementById('ctxColor');
                    const deleteCompBtn = document.getElementById('ctxDeleteComputation');

                    if (addColToGroupBtn) addColToGroupBtn.style.display = 'flex';
                    if (renameGroupBtn) renameGroupBtn.style.display = 'flex';
                    if (editBtn) editBtn.style.display = 'none';
                    if (deleteBtn) deleteBtn.style.display = 'none';
                    if (computeBtn) computeBtn.style.display = 'none';
                    if (computeColBtn) computeColBtn.style.display = 'none';
                    if (colorBtn) colorBtn.style.display = 'none';
                    if (deleteCompBtn) deleteCompBtn.style.display = 'none';

                    // Show menu
                    const menu = document.getElementById('contextMenu');
                    menu.style.display = 'block';
                    menu.style.top = e.pageY + 'px';
                    menu.style.left = e.pageX + 'px';
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

        // Get the old value to check if it actually changed
        const entry = this.state.localEntries.find(e => e.id === info.entryId);
        const oldValue = entry?.values?.[info.colName] || '';

        // Only save and recalculate if the value actually changed
        if (newValue !== oldValue) {
            try {
                const values = {};
                values[colId] = newValue;
                await SupabaseService.updateEntryValues(info.entryId, values);

                // UPDATE LOCAL STATE (REALTIME)
                if (entry) {
                    if (!entry.values) entry.values = {};
                    entry.values[info.colName] = newValue;
                }

                // Update cache
                const cacheKey = `template-${this.state.currentTemplate.id}`;
                delete this.state.cache[cacheKey];
            } catch (err) {
                this.showToast('Save failed: ' + err.message, 'error');
            }

            // 🔄 AUTO UPDATE - Recalculate all dependent computations
            this.autoRecalculateDependentFormulas(info.colName, info.entryId);

            // AUTO UPDATE COLUMN COMPUTE
            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }
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

                const entry = this.state.localEntries.find(e => e.id === entryId);
                if (entry) {
                    if (!entry.values) entry.values = {};
                    Object.entries(values).forEach(([colId, val]) => {
                        const col = this.state.currentTemplate.columns
                            .find(c => c.encoding_columns.id === colId);
                        if (col) {
                            entry.values[col.encoding_columns.column_name] = val;
                        }
                    });
                }
                const cacheKey = `template-${this.state.currentTemplate.id}`;
                delete this.state.cache[cacheKey];
            } catch (err) {
                this.showToast('Save failed: ' + err.message, 'error');
            }
        });

        // 🔄 AUTO-UPDATE - Recalculate for each changed entry and column
        changedEntries.forEach((values, entryId) => {
            Object.keys(values).forEach(colId => {
                const colName = this.state.currentTemplate.columns.find(
                    c => c.encoding_columns.id === colId
                )?.encoding_columns.column_name;
                if (colName) {
                    this.autoRecalculateDependentFormulas(colName, entryId);
                }
            });
        });

        // AUTO UPDATE COLUMN COMPUTE   
        if (this.state.activeColumnCompute) {
            this.updateColumnComputation();
        }
    },

    saveEntryField: async function (entryId, values) {
        try {
            await SupabaseService.updateEntryValues(entryId, values);

            const entry = this.state.localEntries.find(e => e.id === entryId);
            if (entry) {
                if (!entry.values) entry.values = {};
                Object.entries(values).forEach(([colId, val]) => {
                    const col = this.state.currentTemplate.columns
                        .find(c => c.encoding_columns.id === colId);
                    if (col) {
                        entry.values[col.encoding_columns.column_name] = val;
                    }
                });
            }

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

            // Note: No need to update local state here since loadEntries() will refresh it
            
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
            const isMonitoring = t.module === 'monitoring';
            const typeBadge = isMonitoring
                ? `<span class="card-type-badge monitoring">Monitoring</span>`
                : `<span class="card-type-badge encoding">Encoding</span>`;
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
                ${typeBadge}
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
    openColumnModal: async function (groupName = null) {
        if (!this.state.currentTemplate) {
            return this.showToast('No template selected.', 'error');
        }

        const modal = document.getElementById('columnModal');
        const encodingForm = document.getElementById('encodingColumnForm');
        const monitoringForm = document.getElementById('monitoringColumnForm');
        const columnSelect = document.getElementById('existingColumnSelect');

        // Check if current template is monitoring type
        const isMonitoring = this.state.currentTemplate.module === 'monitoring';

        if (isMonitoring) {
            // Show monitoring form (select existing column)
            encodingForm.style.display = 'none';
            monitoringForm.style.display = 'block';

            // Populate dropdown with columns from encoding templates
            try {
                const encodingColumns = await SupabaseService.getEncodingTemplateColumns(this.state.departmentId);
                
                columnSelect.innerHTML = '<option value="">-- Select a column --</option>';
                encodingColumns.forEach(col => {
                    const option = document.createElement('option');
                    option.value = col.id;
                    option.textContent = `${col.column_name} (${col.column_type})`;
                    columnSelect.appendChild(option);
                });

                if (encodingColumns.length === 0) {
                    this.showToast('No columns found in encoding templates. Please create encoding templates first.', 'error');
                }
            } catch (error) {
                this.showToast('Failed to load encoding columns: ' + error.message, 'error');
            }
        } else {
            encodingForm.style.display = 'block';
            monitoringForm.style.display = 'none';
            document.getElementById('newColumnName').value = '';
            document.getElementById('newColumnType').value = 'text';
            document.getElementById('columnGroup').value = groupName || '';
        }

        modal.style.display = 'block';
    },

    addColumnToTemplate: async function () {
        if (!this.state.currentTemplate) return this.showToast('No template selected.', 'error');

        const isMonitoring = this.state.currentTemplate.module === 'monitoring';
        const loadingOverlay = document.getElementById('loadingOverlay');
        const addColumnBtn = document.getElementById('addColumnBtn');

        try {
            // Disable button to prevent double-click
            if (addColumnBtn) {
                addColumnBtn.disabled = true;
                addColumnBtn.innerText = 'Adding...';
            }
            // Refresh template state first to ensure we have latest columns
            const cacheKey = `template-${this.state.currentTemplate.id}`;
            delete this.state.cache[cacheKey];
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);

            let columnId;

            if (isMonitoring) {
                // For monitoring templates: select existing column from encoding
                columnId = document.getElementById('existingColumnSelect').value;
                if (!columnId) return this.showToast('Please select a column from encoding templates.', 'error');

                // Check if column already exists in current template
                const existingColumn = this.state.currentTemplate.columns?.find(
                    col => col.encoding_columns.id === columnId
                );
                if (existingColumn) {
                    return this.showToast('This column is already added to the template.', 'error');
                }

                // Calculate display order to add at the end
                const existingColumns = this.state.currentTemplate.columns || [];
                const maxDisplayOrder = existingColumns.length > 0
                    ? Math.max(...existingColumns.map(col => col.display_order || 0))
                    : 0;
                var newDisplayOrder = maxDisplayOrder + 1;
            } else {
                // For encoding templates: create new column
                const name = document.getElementById('newColumnName').value.trim();
                const columnType = document.getElementById('newColumnType').value;
                const groupName = document.getElementById('columnGroup').value.trim() || null;
                
                if (!name) return this.showToast('Column name is required.', 'error');

                // Calculate display order to add column within the group or at the end
                const existingColumns = this.state.currentTemplate.columns || [];
                let newDisplayOrder;

                if (groupName) {
                    // Find the last column in the specified group
                    const groupColumns = existingColumns.filter(col => col.encoding_columns.group_name === groupName);
                    if (groupColumns.length > 0) {
                        const maxGroupDisplayOrder = Math.max(...groupColumns.map(col => col.display_order || 0));
                        newDisplayOrder = maxGroupDisplayOrder + 1;
                    } else {
                        // Group is empty, add at the end
                        const maxDisplayOrder = existingColumns.length > 0
                            ? Math.max(...existingColumns.map(col => col.display_order || 0))
                            : 0;
                        newDisplayOrder = maxDisplayOrder + 1;
                    }
                } else {
                    // No group, add at the end
                    const maxDisplayOrder = existingColumns.length > 0
                        ? Math.max(...existingColumns.map(col => col.display_order || 0))
                        : 0;
                    newDisplayOrder = maxDisplayOrder + 1;
                }

                // Create reusable column with group name (for visual grouping only)
                const column = await SupabaseService.createColumn(
                    this.state.departmentId,
                    name,
                    columnType,
                    newDisplayOrder,
                    false, // isRequired
                    groupName // Use group name instead of parent_column_id
                );
                columnId = column.id;
            }

            // Add to current template with display order to add at the end
            await SupabaseService.addColumnToTemplate(
                this.state.currentTemplate.id,
                columnId,
                newDisplayOrder
            );

            // Refresh template again to get new column
            delete this.state.cache[cacheKey];
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);

            // If monitoring template, copy data from encoding entries
            if (isMonitoring) {
                // Show loading overlay
                if (loadingOverlay) {
                    loadingOverlay.style.display = 'flex';
                }

                const copiedCount = await SupabaseService.copyColumnDataToMonitoring(
                    this.state.currentTemplate.id,
                    columnId,
                    this.state.departmentId
                );
                
                // Clear cache again to force refresh after copy
                delete this.state.cache[cacheKey];
                
                // Force reload entries after copy
                await this.loadEntries(this.state.currentTemplate.id);
                
                this.showToast(`Column added! ${copiedCount} entries copied from encoding.`);
            } else {
                // For encoding templates, just reload entries
                await this.loadEntries(this.state.currentTemplate.id);
                this.showToast('Column added!');
            }

            // Render with updated state
            this.renderAll();
            
            // Clear form
            if (!isMonitoring) {
                document.getElementById('newColumnName').value = '';
                document.getElementById('newColumnType').value = 'text';
                document.getElementById('columnGroup').value = '';
            } else {
                document.getElementById('existingColumnSelect').value = '';
            }
            
            window.closeColumnModal();
        } catch (error) {
            console.error('Failed to add column:', error);

            // Show user-friendly error message
            if (error.message && error.message.includes('duplicate') || error.message && error.message.includes('unique constraint')) {
                this.showToast('A column with this name already exists in this group.', 'error');
            } else {
                this.showToast('Failed to add column. Please try again.', 'error');
            }
        } finally {
            // Always hide loading overlay
            if (loadingOverlay) {
                loadingOverlay.style.display = 'none';
            }
            // Always re-enable button
            if (addColumnBtn) {
                addColumnBtn.disabled = false;
                addColumnBtn.innerText = 'Add';
            }
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

            // Also delete from encoding_columns table (only for encoding templates)
            // For monitoring templates, keep the column for reuse in other templates
            if (this.state.currentTemplate.module !== 'monitoring') {
                await SupabaseService.deleteColumn(columnId);
            }

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

                // Note: No need to update local state here since loadEntries() will refresh it
                // The entry won't be in localEntries yet since it was just created
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

            // AUTO UPDATE COLUMN COMPUTE   
            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }
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

        // ============================
        // 1. HEADER
        // ============================
        const header = columns.map(col => col.encoding_columns.column_name);

        // ============================
        // 2. DATA + COLORS
        // ============================
        const data = [];
        const colorMatrix = [];

        this.state.localEntries.forEach(entry => {
            const row = [];
            const colorRow = [];

            columns.forEach(col => {
                const colDef = col.encoding_columns;
                const valObj = entry.valueDetails?.find(v => v.column_id === colDef.id);

                const value = valObj?.value || valObj?.value_number || '';
                const color = valObj?.cell_color || null;

                row.push(value);
                colorRow.push(color);
            });

            data.push(row);
            colorMatrix.push(colorRow);
        });

        // ============================
        // 3. COMPUTE ROW (UNDER HEADER)
        // ============================
        const computeRow = new Array(header.length).fill('');

        if (this.state.activeColumnCompute) {
            const { column, func } = this.state.activeColumnCompute;

            const colIndex = header.indexOf(column);

            if (colIndex !== -1) {
                const values = data.map(r => parseFloat(r[colIndex]) || 0);

                let result = 0;

                switch (func) {
                    case 'sum':
                        result = values.reduce((a,b)=>a+b,0);
                        break;
                    case 'average':
                        result = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
                        break;
                    case 'max':
                        result = Math.max(...values);
                        break;
                    case 'min':
                        result = Math.min(...values);
                        break;
                    case 'count':
                        result = values.length;
                        break;
                }

                computeRow[colIndex] = `${func.toUpperCase()}: ${result}`;
            }
        }

        // ============================
        // 4. FINAL DATA (HEADER + COMPUTE + DATA)
        // ============================
        const finalData = [
            header,
            computeRow,
            ...data
        ];

        // ============================
        // 5. CREATE SHEET
        // ============================
        const ws = XLSX.utils.aoa_to_sheet(finalData);

        // ============================
        // 6. APPLY COLORS
        // ============================
        for (let r = 0; r < data.length; r++) {
            for (let c = 0; c < columns.length; c++) {
                const color = colorMatrix[r][c];
                if (!color) continue;

                const excelRow = r + 2; // header + compute row

                const cellRef = XLSX.utils.encode_cell({ r: excelRow, c });

                if (!ws[cellRef]) continue;

                ws[cellRef].s = {
                    fill: {
                        fgColor: { rgb: color.replace('#','').toUpperCase() }
                    }
                };
            }
        }

        // ============================
        // 7. AUTO WIDTH
        // ============================
        ws['!cols'] = header.map(() => ({ wch: 20 }));

        // ============================
        // 8. EXPORT
        // ============================
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, this.state.currentTemplate.name);

        XLSX.writeFile(wb, `${this.state.currentTemplate.name}.xlsx`);

        this.showToast('Exported with colors & column totals!');
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
        const mapping = {}; // dbColName -> excelColName (null = skipped)
        mappingSelects.forEach(sel => {
            const dbCol  = sel.dataset.dbCol;
            const excelCol = sel.value;
            // Include all columns in mapping, even skipped ones (empty string = skipped)
            if (dbCol) {
                mapping[dbCol] = excelCol || null;
            }
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

        // Create a normalized mapping of Excel column names to row keys
        // This handles case differences and trailing whitespace
        const rowKeys = Object.keys(rows[0] || {});
        const colNameMap = {};
        mappedExcelCols.forEach(excelCol => {
            const normalizedExcelCol = excelCol.trim().toLowerCase();
            const matchingKey = rowKeys.find(key => key.trim().toLowerCase() === normalizedExcelCol);
            if (matchingKey) {
                colNameMap[excelCol] = matchingKey;
            }
        });

        console.log('Column name mapping (Excel -> Row key):', colNameMap);

        // FILTER BEFORE PROCESSING: Check if each row has ANY data in the MAPPED columns
        const rowsWithData = rows.filter((row, idx) => {
            // Get values ONLY from mapped columns using normalized keys
            const mappedValues = mappedExcelCols.map(colName => {
                const rowKey = colNameMap[colName];
                const val = rowKey ? row[rowKey] : undefined;
                const strVal = String(val || '').trim();
                return strVal;
            });
            
            // Keep row only if at least ONE mapped cell has actual data
            // Check for non-empty strings, non-zero numbers, etc.
            const hasData = mappedValues.some(v => {
                if (v === '' || v === null || v === undefined) return false;
                if (typeof v === 'string' && v.trim() === '') return false;
                if (typeof v === 'number' && v === 0) return false; // 0 might be valid, but treating as empty for now
                return true;
            });
            
            if (!hasData) {
                console.warn(`Row ${idx} skipped (all mapped columns empty):`, row);
                console.warn(`  Mapped values:`, mappedValues);
            } else {
                console.log(`Row ${idx} kept. Mapped values:`, mappedValues);
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
            // Check if there are existing entries to determine if this is a re-import
            const existingEntries = await SupabaseService.getEntries(this.state.currentTemplate.id);
            const isReimport = existingEntries.length > 0;

            let entries;
            let allValues = [];

            if (isReimport) {
                // RE-IMPORT: Update existing entries instead of deleting them
                // This allows importing columns separately without losing data
                console.log(`Re-import mode: Updating ${existingEntries.length} existing entries...`);
                console.log(`Spreadsheet has ${rowsWithData.length} rows`);
                
                // If spreadsheet has more rows than existing entries, create additional entries
                if (rowsWithData.length > existingEntries.length) {
                    const additionalCount = rowsWithData.length - existingEntries.length;
                    console.log(`Creating ${additionalCount} additional entries...`);
                    const newEntries = await SupabaseService.createEntries(
                        this.state.currentTemplate.id,
                        this.state.departmentId,
                        additionalCount
                    );
                    entries = [...existingEntries, ...newEntries];
                } else if (rowsWithData.length < existingEntries.length) {
                    // If spreadsheet has fewer rows, only use the first N entries
                    console.log(`Spreadsheet has fewer rows, using first ${rowsWithData.length} entries`);
                    entries = existingEntries.slice(0, rowsWithData.length);
                } else {
                    entries = existingEntries;
                }
            } else {
                // NEW IMPORT: Create new entries
                console.log(`Creating ${rowsWithData.length} new entries...`);
                entries = await SupabaseService.createEntries(
                    this.state.currentTemplate.id,
                    this.state.departmentId,
                    rowsWithData.length
                );
            }

            console.log(`Total entries: ${entries.length}`);

            // Build ALL values for ALL entries in memory first
            console.log(`Preparing values for all rows...`);
            
            rowsWithData.forEach((row, idx) => {
                const entry = entries[idx];
                const values = {};
                
                columns.forEach(col => {
                    const colDef = col.encoding_columns;
                    const excelColName = mapping[colDef.column_name];
                    
                    if (!excelColName || excelColName === '(skip)' || excelColName === '') return;
                    
                    // Use normalized column mapping to get the correct row key
                    const rowKey = colNameMap[excelColName];
                    const rawVal = rowKey ? row[rowKey] : undefined;
                    
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

            // STEP 3: Insert/Update ALL values in one batch call
            console.log(`Upserting ${allValues.length} column values in batch...`);
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
            // Refresh the table with new data
            await this.loadEntries(this.state.currentTemplate.id);
            this.closeImportModal();
            this.showToast(`${rowsWithData.length} rows imported successfully!`);
        } catch (err) {
            console.error('Import error:', err);
            this.showToast('Import failed: ' + err.message, 'error');
        } finally {
            if (confirmBtn) { confirmBtn.disabled = false; confirmBtn.innerText = 'Import'; }
        }

        // Auto cleanup after import
        await this.deleteEmptyRows();
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

            // 🔄 AUTO-UPDATE: Recalculate column computations after deletion
            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }

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

    renameGroup: async function (oldGroupName) {
        this.openRenameGroupModal(oldGroupName);
    },

    openRenameGroupModal: function (oldGroupName) {
        this.state.oldGroupName = oldGroupName;
        document.getElementById('newGroupName').value = oldGroupName;
        document.getElementById('renameGroupModal').style.display = 'block';
    },

    closeRenameGroupModal: function () {
        document.getElementById('renameGroupModal').style.display = 'none';
        this.state.oldGroupName = null;
    },

    confirmRenameGroup: async function () {
        const newGroupName = document.getElementById('newGroupName').value.trim();
        const oldGroupName = this.state.oldGroupName;

        if (!newGroupName || newGroupName === oldGroupName) {
            this.closeRenameGroupModal();
            return;
        }

        try {
            // Get all columns in the current template that belong to this group
            const columns = this.state.currentTemplate.columns || [];
            const columnsInGroup = columns
                .filter(col => col.encoding_columns.group_name === oldGroupName)
                .map(col => col.encoding_columns.id);

            if (columnsInGroup.length === 0) {
                this.showToast('No columns found in this group', 'error');
                this.closeRenameGroupModal();
                return;
            }

            // Update all columns in the group with the new name
            await SupabaseService.client
                .from('encoding_columns')
                .update({ group_name: newGroupName })
                .in('id', columnsInGroup);

            // Refresh the current template to get updated group names
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);
            this.renderAll();
            this.showToast('Group renamed!');
            this.closeRenameGroupModal();
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

        modal.innerHTML = `
            <div class="compute-box">
                <h3>Compute Formula</h3>

                <label>Formula</label>
                <input id="computeFormula" placeholder="=Price * Quantity">

                <label>Apply Mode</label>
                <select id="computeMode">
                    <option value="cell">Selected Cell</option>
                    <option value="column">Whole Column</option>
                </select>

                <div class="compute-columns">
                    ${cols.map(c => `
                        <button type="button" class="col-btn">
                            ${c.encoding_columns.column_name}
                        </button>
                    `).join('')}
                </div>

                <div class="compute-functions">
                    <button type="button" class="func-btn">=SUM()</button>
                    <button type="button" class="func-btn">=AVERAGE()</button>
                    <button type="button" class="func-btn">=COUNT()</button>
                    <button type="button" class="func-btn">=MAX()</button>
                    <button type="button" class="func-btn">=MIN()</button>
                </div>

                <div class="compute-actions">
                    <button id="runCompute">Apply</button>
                    <button id="closeCompute">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // click column → auto insert sa formula
        const input = modal.querySelector('#computeFormula');

        // COLUMN BUTTONS
        modal.querySelectorAll('.col-btn').forEach(btn => {
            btn.onclick = () => {
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? input.value.length;

                const text = btn.textContent.trim();

                const before = input.value.substring(0, start);
                const after = input.value.substring(end);

                // check kung nasa loob ng function (para comma instead of space)
                const insideFunc = /\w+\([^()]*$/.test(before);

                const insert = insideFunc
                    ? (before.endsWith('(') ? '' : ', ') + text
                    : (before.trim() === '' ? '' : ' ') + text;

                input.value = before + insert + after;

                const newPos = start + insert.length;
                input.selectionStart = input.selectionEnd = newPos;

                input.focus();
            };
        });


        // FUNCTION BUTTONS
        modal.querySelectorAll('.func-btn').forEach(btn => {
            btn.onclick = () => {
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? input.value.length;

                const funcName = btn.textContent.replace('()', '').trim();
                const insert = `${funcName}()`;

                const before = input.value.substring(0, start);
                const after = input.value.substring(end);

                input.value = before + insert + after;

                // cursor inside parentheses
                const pos = start + funcName.length + 1;
                input.selectionStart = input.selectionEnd = pos;

                input.focus();
            };
        });

        modal.querySelector('#closeCompute').onclick = () => modal.remove();

        modal.querySelector('#runCompute').onclick = () => {
            const formula = modal.querySelector('#computeFormula').value;
            const mode = modal.querySelector('#computeMode').value;

            this.applyFormula(formula, mode);
            modal.remove();
        };
    },

    applyFormula: async function (formula, mode) {
        if (!formula.startsWith('=')) {
            return this.showToast('Formula must start with "="', 'error');
        }

        const expr = formula.slice(1);
        const columns = this.state.currentTemplate?.columns || [];

        const computeRow = (entry) => {
            let evalExpr = expr;

            columns.forEach(c => {
                const colName = c.encoding_columns.column_name;
                const raw = entry.values[colName] ?? '0';

                // convert text → number
                const num = parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;

                const safeCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${safeCol}\\b`, 'g');

                evalExpr = evalExpr.replace(regex, num);

                // SUPPORT Excel-like functions
                // helper: convert argument → number
                const getVal = (arg, entry) => {
                    const clean = arg.trim();

                    // if number literal
                    if (!isNaN(clean)) return parseFloat(clean);

                    // if column name
                    const raw = entry.values[clean] ?? '0';
                    return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
                };

                // AVERAGE(...)
                evalExpr = evalExpr.replace(/AVERAGE\((.*?)\)/gi, (_, args) => {
                    const vals = args.split(',').map(a => getVal(a, entry));
                    return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
                });

                // SUM(...)
                evalExpr = evalExpr.replace(/SUM\((.*?)\)/gi, (_, args) => {
                    const vals = args.split(',').map(a => getVal(a, entry));
                    return vals.reduce((a,b)=>a+b,0);
                });

                // COUNT(...)
                evalExpr = evalExpr.replace(/COUNT\((.*?)\)/gi, (_, args) => {
                    return args.split(',').length;
                });

                // MAX(...)
                evalExpr = evalExpr.replace(/MAX\((.*?)\)/gi, (_, args) => {
                    const vals = args.split(',').map(a => getVal(a, entry));
                    return Math.max(...vals);
                });

                // MIN(...)
                evalExpr = evalExpr.replace(/MIN\((.*?)\)/gi, (_, args) => {
                    const vals = args.split(',').map(a => getVal(a, entry));
                    return Math.min(...vals);
                });
            });

            try {
                const result = eval(evalExpr);
                return this.formatNumber(result); // APPLY HERE
            } catch {
                return 'ERR';
            }
        };

        // SINGLE CELL
        if (mode === 'cell') {
            const td = this.state.currentCell;
            if (!td) return this.showToast('No cell selected', 'error');

            const row = td.closest('tr');
            const entryId = row.dataset.entryId;

            const entry = this.state.localEntries.find(e => e.id === entryId);
            if (!entry) return;

            const result = computeRow(entry);

            td.textContent = result;
            entry.values[this.state.currentColName] = result;

            // 🔄 AUTO-UPDATE: Store the formula for auto-recalculation
            const formulaKey = `${entryId}|${this.state.currentColName}`;
            this.state.cellFormulas[formulaKey] = formula;

            // 💾 SAVE TO DATABASE: Persist cell formula
            const colDef = columns.find(c => c.encoding_columns.column_name === this.state.currentColName)?.encoding_columns;
            if (colDef) {
                try {
                    await SupabaseService.saveCellFormula(
                        this.state.currentTemplate.id,
                        entryId,
                        colDef.id,
                        formula
                    );
                } catch (err) {
                    console.error('Failed to save cell formula:', err);
                }
            }

            if (colDef) {
                let detail = entry.valueDetails.find(v => v.column_id === colDef.id);
                if (detail) detail.value = String(result);
                else entry.valueDetails.push({ column_id: colDef.id, value: String(result) });

                const payload = {};
                payload[colDef.id] = result;

                this.saveEntryField(entry.id, payload);
            }
        }

        // WHOLE COLUMN (PER ROW COMPUTATION)
        if (mode === 'column') {
            // 🔄 AUTO-UPDATE: Store the formula for auto-recalculation on each row
            this.state.columnFormulas[this.state.currentColName] = formula;

            // 💾 SAVE TO DATABASE: Persist column formula
            const colDef = columns.find(c => c.encoding_columns.column_name === this.state.currentColName)?.encoding_columns;
            if (colDef) {
                try {
                    await SupabaseService.saveColumnFormula(
                        this.state.currentTemplate.id,
                        colDef.id,
                        formula
                    );
                } catch (err) {
                    console.error('Failed to save column formula:', err);
                }
            }

            this.state.localEntries.forEach(entry => {
                const result = computeRow(entry);

                entry.values[this.state.currentColName] = result;

                if (colDef) {
                    let detail = entry.valueDetails.find(v => v.column_id === colDef.id);
                    if (detail) detail.value = String(result);
                    else entry.valueDetails.push({ column_id: colDef.id, value: String(result) });

                    const payload = {};
                    payload[colDef.id] = result;

                    this.saveEntryField(entry.id, payload);
                }
            });

            this.renderTable(this.state.localEntries);
        }

        this.showToast('Computed! Auto-update is now active for this formula.');
    },


    //-----------------------------------------------------------------------------------------
    //------------Specific Column Computation------------------
    //-----------------------------------------------------------------------------------------
    openColumnComputeModal: function () {
        const modal = document.createElement('div');
        modal.className = 'compute-modal';

        modal.innerHTML = `
            <div class="compute-box">
                <h3>Compute Column</h3>

                <label>Function</label>
                <select id="colFunc">
                    <option value="sum">SUM</option>
                    <option value="average">AVERAGE</option>
                    <option value="max">MAX</option>
                    <option value="min">MIN</option>
                    <option value="count">COUNT</option>
                </select>

                <label>Display Position</label>
                <select id="colPos">
                    <option value="bottom">Bottom</option>
                    <option value="top">Top</option>
                </select>

                <div class="compute-actions">
                    <button id="runColCompute">Apply</button>
                    <button id="closeColCompute">Cancel</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#closeColCompute').onclick = () => modal.remove();

        modal.querySelector('#runColCompute').onclick = () => {
            const func = modal.querySelector('#colFunc').value;
            const pos = modal.querySelector('#colPos').value;
            const col = this.state.currentColName;

            this.computeColumnLive(col, func, pos);
            modal.remove();
        };
    },

    computeColumnLive: async function (columnName, funcType, position) {
        this.state.activeColumnCompute = {
            column: columnName,
            func: funcType,
            position: position
        };

        // Save to Supabase
        try {
            const columns = this.state.currentTemplate.columns || [];
            const colDef = columns.find(c => c.encoding_columns.column_name === columnName);
            
            if (colDef) {
                await SupabaseService.saveColumnComputation(
                    this.state.currentTemplate.id,
                    colDef.encoding_columns.id,
                    funcType,
                    position
                );
            }
        } catch (err) {
            console.error('Failed to save column computation:', err);
        }

        this.updateColumnComputation();
    },

    updateColumnComputation: function () {
        const config = this.state.activeColumnCompute;
        if (!config) return;

        const { column, func } = config;

        const values = this.state.localEntries.map(entry => {
            const raw = entry.values?.[column] ?? '';
            return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
        });

        let result = 0;

        switch (func) {
            case 'sum':
                result = values.reduce((a,b)=>a+b,0);
                break;
            case 'average':
                result = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
                break;
            case 'max':
                result = Math.max(...values);
                break;
            case 'min':
                result = Math.min(...values);
                break;
            case 'count':
                result = values.length;
                break;
        }

        result = this.formatNumber(result); 
        this.renderColumnFooter(column, func, result, config.position);
    },

    renderColumnFooter: function (columnName, func, result, position) {
        const table = document.getElementById('tableData');
        if (!table) return;

        // remove old footer
        const old = table.querySelector('.column-footer');
        if (old) old.remove();

        const cols = this.state.currentTemplate.columns;

        // hanapin index ng target column
        const colIndex = cols.findIndex(
            c => c.encoding_columns.column_name === columnName
        );

        const tr = document.createElement('tr');
        tr.className = 'column-footer';

        // kung may index column (#), dagdag offset
        const firstRow = table.querySelector('tr');
        const actualCells = firstRow ? firstRow.children.length : cols.length;

        const offset = actualCells - cols.length;

        const totalCols = cols.length + offset;

        for (let i = 0; i < totalCols; i++) {
            const td = document.createElement('td');

            // exact position
            if (i === colIndex + offset) {
                td.textContent = `${func.toUpperCase()}: ${result}`;
                td.style.fontWeight = 'bold';
                td.style.background = '#f1f5f9';
            }

            tr.appendChild(td);
        }

        // Insert at top (under header) or bottom based on position
        if (position === 'top') {
            const thead = table.querySelector('thead');
            if (thead) thead.appendChild(tr);
            else table.insertBefore(tr, table.firstChild);
        } else {
            const tbody = table.querySelector('tbody');
            if (tbody) tbody.appendChild(tr);
            else table.appendChild(tr);
        }
    },

    loadColumnComputations: async function () {
        if (!this.state.currentTemplate || !this.state.currentTemplate.id) return;

        try {
            const computations = await SupabaseService.getColumnComputations(this.state.currentTemplate.id);
            const columns = this.state.currentTemplate.columns || [];

            computations.forEach(comp => {
                const colDef = columns.find(c => c.encoding_columns.id === comp.column_id);
                if (colDef) {
                    const columnName = colDef.encoding_columns.column_name;
                    this.state.activeColumnCompute = {
                        column: columnName,
                        func: comp.function_type,
                        position: comp.display_position || 'bottom'
                    };
                    this.updateColumnComputation();
                }
            });
        } catch (err) {
            console.error('Failed to load column computations:', err);
        }
    },

    loadSavedFormulas: async function () {
        if (!this.state.currentTemplate || !this.state.currentTemplate.id) return;

        try {
            const formulas = await SupabaseService.getFormulas(this.state.currentTemplate.id);
            const columns = this.state.currentTemplate.columns || [];

            formulas.forEach(formula => {
                const colDef = columns.find(c => c.encoding_columns.id === formula.column_id);
                if (!colDef) return;

                const columnName = colDef.encoding_columns.column_name;

                if (formula.formula_type === 'cell' && formula.entry_id) {
                    // Cell formula: for a specific entry
                    const formulaKey = `${formula.entry_id}|${columnName}`;
                    this.state.cellFormulas[formulaKey] = formula.formula;
                } else if (formula.formula_type === 'column') {
                    // Column formula: for all rows in a column
                    this.state.columnFormulas[columnName] = formula.formula;
                }
            });

            // Apply loaded formulas to recalculate values
            await this.applyLoadedFormulas();
        } catch (err) {
            console.error('Failed to load saved formulas:', err);
        }
    },

    applyLoadedFormulas: async function () {
        const columns = this.state.currentTemplate?.columns || [];

        // Apply column formulas to all entries
        for (const [columnName, formula] of Object.entries(this.state.columnFormulas || {})) {
            const colDef = columns.find(c => c.encoding_columns.column_name === columnName);
            if (!colDef) continue;

            // Apply formula to each entry
            for (const entry of this.state.localEntries) {
                await this.recalculateSingleFormula(entry.id, columnName, formula);
            }
        }

        // Apply cell formulas to specific entries
        for (const [formulaKey, formula] of Object.entries(this.state.cellFormulas || {})) {
            const [entryId, columnName] = formulaKey.split('|');
            await this.recalculateSingleFormula(entryId, columnName, formula);
        }

        // Re-render table to show updated values
        this.renderTable(this.state.localEntries);
    },

    toggleColumnComputationPosition: async function () {
        if (!this.state.activeColumnCompute) return;

        const config = this.state.activeColumnCompute;
        const newPosition = config.position === 'top' ? 'bottom' : 'top';

        // Update state
        config.position = newPosition;

        // Save to Supabase
        try {
            const columns = this.state.currentTemplate.columns || [];
            const colDef = columns.find(c => c.encoding_columns.column_name === config.column);
            
            if (colDef) {
                await SupabaseService.saveColumnComputation(
                    this.state.currentTemplate.id,
                    colDef.encoding_columns.id,
                    config.func,
                    newPosition
                );
            }
        } catch (err) {
            console.error('Failed to update column computation position:', err);
            this.showToast('Failed to update position', 'error');
            return;
        }

        // Re-render footer in new position
        this.updateColumnComputation();
        this.showToast(`Position changed to ${newPosition}`);
    },

    deleteColumnComputation: async function () {
        if (!this.state.activeColumnCompute) {
            this.showToast('No active column computation to delete', 'info');
            return;
        }

        const config = this.state.activeColumnCompute;

        // Delete from Supabase
        try {
            const columns = this.state.currentTemplate.columns || [];
            const colDef = columns.find(c => c.encoding_columns.column_name === config.column);
            
            if (colDef) {
                await SupabaseService.deleteColumnComputation(
                    this.state.currentTemplate.id,
                    colDef.encoding_columns.id
                );
            }
        } catch (err) {
            console.error('Failed to delete column computation:', err);
            this.showToast('Failed to delete computation', 'error');
            return;
        }

        // Clear state
        this.state.activeColumnCompute = null;

        // Remove footer from UI (check both thead and tbody)
        const table = document.getElementById('tableData');
        if (table) {
            const footer = table.querySelector('.column-footer');
            if (footer) footer.remove();
        }

        this.showToast('Column computation deleted');
    },

    //para sa 2 decimal places to beh
    formatNumber: function (val) {
        const num = parseFloat(val);
        if (isNaN(num)) return val;

        return Number(num.toFixed(2)); //number pa rin, hindi string
    },

    // ============================================================
    // AUTO-UPDATE COMPUTATION (Real-time recalculation)
    // ============================================================
    /**
     * Automatically recalculate all formulas that depend on a changed column
     * Called whenever a cell value changes
     */
    autoRecalculateDependentFormulas: function (changedColumnName, changedEntryId) {
        if (!this.state.currentTemplate) return;

        // 1️⃣ Recalculate cell formulas that depend on this column
        this.recalculateCellFormulas(changedColumnName, changedEntryId);

        // 2️⃣ Recalculate per-row formulas for the changed entry
        if (this.state.columnFormulas && Object.keys(this.state.columnFormulas).length > 0) {
            this.recalculateRowFormulas(changedEntryId);
        }
    },

    /**
     * Recalculate a specific cell formula when its dependency changes
     */
    recalculateCellFormulas: function (changedColumnName, changedEntryId) {
        const table = document.getElementById('tableData');
        if (!table) return;

        const columns = this.state.currentTemplate?.columns || [];

        // Find all cells with formulas and check if they depend on the changed column
        Object.entries(this.state.cellFormulas || {}).forEach(([key, formula]) => {
            const [entryId, targetColName] = key.split('|');
            
            // Build regex to find if this column is in the formula
            const colNameRegex = new RegExp(`\\b${changedColumnName}\\b`);
            
            if (colNameRegex.test(formula)) {
                // This formula depends on the changed column
                // Recalculate it if it's in the same entry or if it's a global formula
                const entry = this.state.localEntries.find(e => e.id === entryId || e.id === changedEntryId);
                if (entry && (entryId === changedEntryId || entryId === 'GLOBAL')) {
                    this.recalculateSingleFormula(changedEntryId, targetColName, formula);
                }
            }
        });
    },

    /**
     * Recalculate all per-row formulas for a specific entry
     */
    recalculateRowFormulas: function (entryId) {
        const entry = this.state.localEntries.find(e => e.id === entryId);
        if (!entry) return;

        const columns = this.state.currentTemplate?.columns || [];

        Object.entries(this.state.columnFormulas || {}).forEach(([columnName, formula]) => {
            this.recalculateSingleFormula(entryId, columnName, formula);
        });
    },

    /**
     * Recalculate a single formula and update the cell UI + database
     */
    recalculateSingleFormula: async function (entryId, targetColumnName, formula) {
        const entry = this.state.localEntries.find(e => e.id === entryId);
        if (!entry) return;

        const columns = this.state.currentTemplate?.columns || [];
        const self = this; // Capture 'this' for nested functions

        // Execute the formula evaluation logic (similar to applyFormula)
        const computeRow = (entry) => {
            let evalExpr = formula.startsWith('=') ? formula.slice(1) : formula;

            columns.forEach(c => {
                const colName = c.encoding_columns.column_name;
                const raw = entry.values[colName] ?? '0';
                const num = parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
                const safeCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${safeCol}\\b`, 'g');
                evalExpr = evalExpr.replace(regex, num);
            });

            // Parse functions
            const getVal = (arg, entry) => {
                const clean = arg.trim();
                if (!isNaN(clean)) return parseFloat(clean);
                const raw = entry.values[clean] ?? '0';
                return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
            };

            evalExpr = evalExpr.replace(/AVERAGE\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
            });

            evalExpr = evalExpr.replace(/SUM\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return vals.reduce((a,b)=>a+b,0);
            });

            evalExpr = evalExpr.replace(/COUNT\((.*?)\)/gi, (_, args) => {
                return args.split(',').length;
            });

            evalExpr = evalExpr.replace(/MAX\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return Math.max(...vals);
            });

            evalExpr = evalExpr.replace(/MIN\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return Math.min(...vals);
            });

            try {
                const result = eval(evalExpr);
                return self.formatNumber(result);
            } catch {
                return 'ERR';
            }
        };

        const newResult = computeRow(entry);

        // Find and update the cell in the table
        const table = document.getElementById('tableData');
        if (!table) return;

        const row = table.querySelector(`tr[data-entry-id="${entryId}"]`);
        if (!row) return;

        const cells = Array.from(row.querySelectorAll('td[data-col-name]'));
        const targetCell = cells.find(c => c.dataset.colName === targetColumnName);
        
        if (targetCell) {
            targetCell.textContent = newResult;

            // Update local state
            entry.values[targetColumnName] = newResult;

            // Save to database
            try {
                const colDef = this.state.currentTemplate.columns.find(
                    c => c.encoding_columns.column_name === targetColumnName
                )?.encoding_columns;

                if (colDef) {
                    const payload = {};
                    payload[colDef.id] = newResult;
                    await SupabaseService.updateEntryValues(entryId, payload);
                }
            } catch (err) {
                console.error('Failed to save formula result:', err);
            }
        }
    },

    //-----------------------------------------------------------------------------------------
    //------------ctrl + z and ctrl y function for undo and redo------------------
    //-----------------------------------------------------------------------------------------
    pushToHistory: function (changes) {
        // changes = [{ entryId, colId, oldValue, newValue }]
        if (!changes.length) return;

        this.state.historyStack.push(changes);

        // Limit history (optional para di lumobo memory)
        if (this.state.historyStack.length > 100) {
            this.state.historyStack.shift();
        }
    },

    //-----------------------------------------------------------------------------------------
    //------------Color cells------------------
    //-----------------------------------------------------------------------------------------
    openColorModal: function () {
        if (!this.state.currentCell) return;        

        // 🔥 HIDE CONTEXT MENU
        const menu = document.getElementById('contextMenu');
        if (menu) menu.style.display = 'none';

        document.getElementById('colorModal').style.display = 'block';

        this.initColorPalette();
        this.bindPaletteEvents();

        this.state.selectedColor = "#ff0000";
    },

    closeColorModal: function () {
        document.getElementById('colorModal').style.display = 'none';
    },

    applyCellColor: async function () {
        const color = this.state.selectedColor || "#ff0000";
        const target = document.querySelector('.target-btn.active')?.dataset.target;

        const td = this.state.currentCell;
        if (!td) return;

        const row = td.closest('tr');
        const table = document.getElementById('tableData');

        const cellColors = {};

        if (target === 'single') {
            td.style.backgroundColor = color;
            const info = this.getTableCellInfo(td);
            if (info) {
                cellColors[`${info.entryId}_${info.colId}`] = color;
            }
        }

        if (target === 'row') {
            row.querySelectorAll('td[data-col-id]')
                .forEach(cell => {
                    cell.style.backgroundColor = color;
                    const info = this.getTableCellInfo(cell);
                    if (info) {
                        cellColors[`${info.entryId}_${info.colId}`] = color;
                    }
                });
        }

        if (target === 'column') {
            const colIndex = Array.from(td.parentNode.children).indexOf(td);

            table.querySelectorAll('tr').forEach(r => {
                const cells = r.querySelectorAll('td[data-col-id]');
                if (cells[colIndex - 1]) { // -1 dahil may checkbox column
                    cells[colIndex - 1].style.backgroundColor = color;
                    const info = this.getTableCellInfo(cells[colIndex - 1]);
                    if (info) {
                        cellColors[`${info.entryId}_${info.colId}`] = color;
                    }
                }
            });
        }

        // Save colors to database
        if (Object.keys(cellColors).length > 0) {
            try {
                await SupabaseService.updateCellColors(cellColors);
                
                // Clear cache to force reload with new colors
                const cacheKey = `template-${this.state.currentTemplate.id}`;
                delete this.state.cache[cacheKey];
                
                this.showToast('Cell colors saved');
            } catch (err) {
                this.showToast('Failed to save colors: ' + err.message, 'error');
            }
        }

        this.closeColorModal();
    },

    initColorPalette: function () {
        const palette = document.getElementById('colorPalette');
        if (!palette) return;

        const colors = [
            "#000000","#444","#666","#999","#bbb","#ddd","#eee","#FFFFFF",
            "#ff0000","#ff9900","#ffff00","#00ff00","#00ffff","#0000ff","#9900ff","#ff00ff",
            "#f4cccc","#fce5cd","#fff2cc","#d9ead3","#d0e0e3","#cfe2f3","#d9d2e9","#ead1dc",
            "#ea9999","#f9cb9c","#ffe599","#b6d7a8","#a2c4c9","#9fc5e8","#b4a7d6","#d5a6bd",
            "#e06666","#f6b26b","#ffd966","#93c47d","#76a5af","#6fa8dc","#8e7cc3","#c27ba0",
            "#cc0000","#e69138","#f1c232","#6aa84f","#45818e","#3d85c6","#674ea7","#a64d79"
        ];

        palette.innerHTML = colors.map(c => `
            <div class="color-swatch" 
                data-color="${c}" 
                style="background:${c}">
            </div>
        `).join('');
    },

    bindPaletteEvents: function () {
        if (this.state.paletteInitialized) return;

        document.addEventListener('click', (e) => {
            const swatch = e.target.closest('.color-swatch');
            if (!swatch) return;

            document.querySelectorAll('.color-swatch')
                .forEach(s => s.classList.remove('active'));

            swatch.classList.add('active');

            // save selected color
            this.state.selectedColor = swatch.dataset.color;
        });

        this.state.paletteInitialized = true;
    },

    //-----------------------------------------------------------------------------------------
    //------------function para mapunta agad sa last row------------------
    //-----------------------------------------------------------------------------------------
};
