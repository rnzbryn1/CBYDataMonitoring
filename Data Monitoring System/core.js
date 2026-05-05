// Import SupabaseService for database operations
import { SupabaseService } from './supabase-service.js';
import { UI } from './ui.js';

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
        encodingDataCache:      {},             // Cache encoding template entries for SUMIFS cross-reference
        isLoading:              false,
        _importWorkbook:        null,
        _importExcelCols:       [],   // detected Excel column names
        tableEventsInitialized: false,
        historyStack: [],
        // AUTO-UPDATE: Track cell formulas for recalculation
        cellFormulas:           {},             // { "entryId|columnName": "formula", ... }
        cellFormulasVersion:    0,              // Version counter for cache invalidation
        columnFormulas:         {},             // { "columnName": "formula" } for per-row calculations
        // Debounce state for formula recalculation
        formulaRecalcTimer:     null,           // Timer for debounced formula recalculation
        pendingRecalculations:  [],             // Queue of pending recalculations
        // COL compute formula cache for performance
        _colComputeFormulaCache: null,          // Cached list of formulas with COL functions
        _colComputeFormulaCacheVersion: 0,      // Cache version for invalidation
        // Debounce state for auto-update monitoring
        monitoringUpdateTimer:  null,           // Timer for debounced monitoring updates
        pendingMonitoringUpdates: [],          // Queue of pending monitoring update keys
        pendingMonitoringUpdatesData: {},      // Accumulated data changes per entryId for batch updates
        // Compute state to prevent UI interference
        isComputing:            false,          // Flag to indicate compute operation in progress
        activeColumnComputes:   {},             // { "columnName": { func, position }, ... } all column computations
        // Formula dependency tracking for optimization
        formulaDependencies:    {},             // { "targetColumn": ["dep1", "dep2", ...] }
        // Virtual scrolling for large datasets
        virtualScroll: {
            enabled: false,                      // Enable virtual scrolling for large datasets
            itemHeight: 40,                      // Height of each row in pixels
            containerHeight: 600,                // Height of visible container
            bufferSize: 5,                       // Number of extra rows to render above/below viewport
            scrollTop: 0,                         // Current scroll position
            startIndex: 0,                        // First visible item index
            endIndex: 0,                          // Last visible item index
            visibleCount: 0                       // Number of visible items
        },
        // Variable mapping system
        columnVariables:        {},             // { "columnName": "A", "columnName2": "B", ... }
        variableColumns:        {},             // { "A": "columnName", "B": "columnName2", ... }
        // Pagination for performance
        currentPage:            1,
        pageSize:               100,            // Number of rows per page
        totalCount:             0,              // Total entries from server
        // Query caching for performance
        queryCache:             new Map(),      // Cache recent queries
        cacheTimeout:           300000,         // 5 minutes cache timeout
        // Column visibility feature
        columnVisibility:       {},             // { "columnName": true/false, ... }
        showColumnSelector:     false,          // Whether column selector UI is visible
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
                        UI.showToast('No departments found. Please create a department first.', 'error');
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
            UI.showToast('Failed to load templates: ' + error.message, 'error');
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
        window.AppCore = this;


        window.openModal         = ()          => document.getElementById('categoryModal').style.display = 'block';
        window.closeModal        = ()          => document.getElementById('categoryModal').style.display = 'none';
        window.openColumnModal   = async (groupName) => this.openColumnModal(groupName);
        window.closeColumnModal  = ()          => document.getElementById('columnModal').style.display = 'none';
        window.switchColumnTab   = (tabName)    => this.switchColumnTab(tabName);
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
        window.openAddToGroupModal = () => this.openAddToGroupModal();
        window.confirmAddToGroup = () => this.confirmAddToGroup();
        window.toggleEntryForm = () => this.toggleEntryForm();
        window.saveEmptyRow = () => this.saveEmptyRow();

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
            this.state.isComputing = true; // Set compute flag
            this.openComputeModal();
        });

        document.getElementById('ctxComputeColumn')?.addEventListener('click', () => {
            if (this.state.currentColName) {
                this.openColumnComputeModal();
            }
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

        const deleteColumnBtn = document.createElement('button');
        deleteColumnBtn.id = 'ctxDeleteColumn';
        deleteColumnBtn.type = 'button';
        deleteColumnBtn.textContent = 'Delete Column';
        deleteColumnBtn.className = 'delete';
        deleteColumnBtn.style.display = 'none';
        deleteColumnBtn.addEventListener('click', () => {
            if (this.state.currentColId && this.state.currentColName) {
                this.deleteColumn(this.state.currentColId, this.state.currentColName);
            }
        });

        menu.appendChild(addColToGroupBtn);
        menu.appendChild(renameGroupBtn);
        // Removed duplicate deleteColumnBtn from here - Delete Column is now only in header context menu
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

            /* Hide date input placeholder for empty dates but keep calendar picker */
            input[type="date"].empty-date::-webkit-datetime-edit-text {
                color: transparent;
            }
            input[type="date"].empty-date::-webkit-datetime-edit-month-field {
                color: transparent;
            }
            input[type="date"].empty-date::-webkit-datetime-edit-day-field {
                color: transparent;
            }
            input[type="date"].empty-date::-webkit-datetime-edit-year-field {
                color: transparent;
            }
            input[type="date"].empty-date::-webkit-inner-spin-button {
                opacity: 0;
            }
            /* Keep calendar picker visible */
            input[type="date"].empty-date::-webkit-calendar-picker-indicator {
                opacity: 1;
                cursor: pointer;
            }
        `;

        document.head.appendChild(style);
    },

    // ============================================================
    // TOAST
    // ============================================================
    // ============================================================
    // TEMPLATE SWITCHING
    // ============================================================
    switchTemplate: async function (templateId) {
        if (this.state.isLoading) return;

        const workspace = document.getElementById('moduleWorkspace');
        if (!workspace) {
            console.error('Workspace not found');
            return;
        }

        workspace.style.display = 'block';
        workspace.style.opacity = '0.4';
        workspace.style.pointerEvents = 'none';
        this.state.isLoading = true;

        try {
            console.log('Switching to template:', templateId);
            
            // Reset pagination when switching templates
            this.state.currentPage = 1;

            // AUTO-UPDATE: Clear formula state when switching templates
            this.state.cellFormulas = {};
            this.state.columnFormulas = {};
            // Clear variable mappings when switching templates
            this.state.columnVariables = {};
            this.state.variableColumns = {};
            this.state.activeColumnComputes = {};
            this.state.activeColumnCompute = null; // Clear the active display computation
            // Clear COL compute cache
            this.invalidateColComputeCache();

            // Check cache first for template
            const templateCacheKey = `template-${templateId}`;
            let template = this.state.cache[templateCacheKey];
            
            if (!template) {
                console.log('Fetching template...');
                template = await SupabaseService.getTemplate(templateId);
                this.state.cache[templateCacheKey] = template;
            } else {
                console.log('Template loaded from cache');
            }
            
            this.state.currentTemplate = template;
            console.log('Template loaded:', template.name);
            
            // Load entries in parallel with formulas if not cached
            const entriesCacheKey = `entries-${templateId}-${this.state.currentPage}-${this.state.pageSize}`;
            let entries = this.state.cache[entriesCacheKey];
            
            if (!entries) {
                console.log('Fetching entries with pagination...');
                const result = await SupabaseService.getEntries(
                    templateId, 
                    null, 
                    this.state.currentPage, 
                    this.state.pageSize
                );
                entries = result;
                this.state.cache[entriesCacheKey] = entries;
                console.log(`Loaded ${entries.entries.length} entries, total: ${entries.totalCount}`);
            } else {
                console.log('Entries loaded from cache');
            }
            
            this.state.localEntries = entries.entries;
            this.state.totalCount = entries.totalCount;
            this.state.currentTemplateId = templateId;

            // Update UI and render first
            this.updateActiveUI(templateId);
            this.renderAll();

            // Load formulas and computations in background
            this.loadSavedFormulas().then(() => {
                this.renderHeaders(); // Update headers with formula indicators
                this.renderAll(); // Update form to hide computed columns
            });
            
            this.loadColumnComputations(); // Run in background
            
            console.log('Template switch complete');
        } catch (error) {
            UI.showToast('Switch failed: ' + error.message, 'error');
            console.error('Switch template error:', error);
        } finally {
            workspace.style.opacity = '1';
            workspace.style.pointerEvents = 'auto';
            this.state.isLoading = false;
            console.log('Loading state reset');
        }
    },

    updateActiveUI: function (templateId) {
        document.querySelectorAll('.category-card').forEach(c => c.classList.remove('active'));
        const activeCard = document.getElementById(`card-${templateId}`);
        if (activeCard) activeCard.classList.add('active');
    },

    // ============================================================
    // PERFORMANCE TESTING
    // ============================================================
    testPaginationPerformance: async function() {
        console.log('🚀 Testing pagination performance...');
        
        const testCases = [
            { page: 1, description: 'First page' },
            { page: 2, description: 'Page 2' },
            { page: 3, description: 'Page 3' },
            { page: 1, description: 'First page (cached)' }
        ];
        
        for (const testCase of testCases) {
            const startTime = performance.now();
            
            try {
                const result = await SupabaseService.getEntries(
                    this.state.currentTemplateId,
                    null,
                    testCase.page,
                    100
                );
                
                const endTime = performance.now();
                const duration = endTime - startTime;
                
                console.log(`✅ ${testCase.description}: ${duration.toFixed(2)}ms - ${result.entries.length} entries`);
            } catch (error) {
                console.error(`❌ ${testCase.description}:`, error.message);
            }
        }
    },

    testSearchPerformance: async function() {
        console.log('🔍 Testing search performance...');
        
        const startTime = performance.now();
        
        try {
            const result = await SupabaseService.getEntries(
                this.state.currentTemplateId,
                null,
                1,
                100
            );
            
            const endTime = performance.now();
            const duration = endTime - startTime;
            
            console.log(`✅ Search query: ${duration.toFixed(2)}ms`);
            console.log(`📊 Total entries: ${result.totalCount}`);
            console.log(`📄 Page size: ${result.entries.length}`);
            
            // Calculate performance metrics
            const entriesPerMs = result.entries.length / duration;
            console.log(`⚡ Performance: ${entriesPerMs.toFixed(2)} entries/ms`);
            
        } catch (error) {
            console.error('❌ Search test failed:', error.message);
        }
    },

    // ============================================================
    // QUERY CACHING
    // ============================================================
    getCacheKey: function(templateId, page, pageSize) {
        return `${templateId}-${page}-${pageSize}`;
    },

    isCacheValid: function(cachedItem) {
        return Date.now() - cachedItem.timestamp < this.state.cacheTimeout;
    },

    getCachedResult: function(templateId, page, pageSize) {
        const cacheKey = this.getCacheKey(templateId, page, pageSize);
        const cached = this.state.queryCache.get(cacheKey);
        
        if (cached && this.isCacheValid(cached)) {
            console.log(`🎯 Cache hit for page ${page}`);
            return cached.result;
        }
        
        return null;
    },

    setCachedResult: function(templateId, page, pageSize, result) {
        const cacheKey = this.getCacheKey(templateId, page, pageSize);
        this.state.queryCache.set(cacheKey, {
            result: result,
            timestamp: Date.now()
        });
        
        // Clean old cache entries (keep only last 20)
        if (this.state.queryCache.size > 20) {
            const entries = Array.from(this.state.queryCache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            const toDelete = entries.slice(0, 5);
            toDelete.forEach(([key]) => this.state.queryCache.delete(key));
        }
    },

    clearCache: function(templateId = null) {
        if (templateId) {
            // Clear queryCache for specific template
            const keysToDelete = [];
            for (const key of this.state.queryCache.keys()) {
                if (key.startsWith(`${templateId}-`)) {
                    keysToDelete.push(key);
                }
            }
            keysToDelete.forEach(key => this.state.queryCache.delete(key));

            // Clear legacy this.state.cache for specific template
            delete this.state.cache[`template-${templateId}`];
            const entriesPrefix = `entries-${templateId}-`;
            for (const key of Object.keys(this.state.cache)) {
                if (key.startsWith(entriesPrefix)) {
                    delete this.state.cache[key];
                }
            }
        } else {
            // Clear all cache
            this.state.queryCache.clear();
            this.state.cache = {};
        }
        console.log('🗑️ Cache cleared');
    },

    loadEntries: async function (templateId) {
        try {
            console.log(`Loading page ${this.state.currentPage} for template ${templateId}`);
            
            // Check cache first
            const cachedResult = this.getCachedResult(templateId, this.state.currentPage, this.state.pageSize);
            if (cachedResult) {
                this.state.localEntries = cachedResult.entries;
                this.state.totalCount = cachedResult.totalCount;
                this.renderTable(this.state.localEntries);
                
                if (this.state.activeColumnCompute) {
                    this.updateColumnComputation();
                }
                this.renderPaginationControls(this.state.totalCount);
                return;
            }
            
            // Cache miss - fetch from server
            const startTime = performance.now();
            const result = await SupabaseService.getEntries(
                templateId, 
                null, 
                this.state.currentPage, 
                this.state.pageSize
            );
            const queryTime = performance.now() - startTime;
            
            console.log(`📊 Query time: ${queryTime.toFixed(2)}ms | Loaded ${result.entries.length} entries, total: ${result.totalCount}`);
            
            // Cache the result
            this.setCachedResult(templateId, this.state.currentPage, this.state.pageSize, result);
            
            this.state.localEntries = result.entries;
            this.state.totalCount = result.totalCount;

            this.renderTable(this.state.localEntries);

            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }
        } catch (error) {
            console.error('Error loading entries:', error);
            UI.showToast('Error loading data', 'error');
        }
    },

    // ============================================================
    // RENDER
    // ============================================================
    renderHeaders: function () {
        const headers = document.getElementById('tableHeaders');
        if (!headers) return;

        const allColumns = this.state.currentTemplate.columns || [];
        
        // Filter columns based on visibility
        const visibleColumns = allColumns.filter(col => {
            const colDef = col.encoding_columns;
            return this.isColumnVisible(colDef.column_name);
        });
        
        // console.log('Total columns:', allColumns.length, 'Visible columns:', visibleColumns.length);
        
        // Generate column variables first
        this.generateColumnVariables();
        
        // First, build the variable row (A, B, C, etc.)
        let variableRowHTML = '<tr><th></th>'; // Empty cell for checkbox column
        visibleColumns.forEach(col => {
            const colDef = col.encoding_columns;
            const variable = this.getColumnVariable(colDef.column_name);
            const hasColumnFormula = this.state.columnFormulas[colDef.column_name];
            const formulaIndicator = hasColumnFormula ? 
                '<span style="background-color: #3b82f6; color: white; font-size: 10px; padding: 2px 6px; border-radius: 3px; margin-left: 5px;">fx</span>' : '';
            
            variableRowHTML += `<th>${variable}${formulaIndicator}</th>`;
        });
        variableRowHTML += '</tr>';
        
        let headerHTML = '<tr><th><input type="checkbox" id="selectAll"></th>';
        let secondRowHTML = '';
        let needsSecondRow = false;

        let currentGroup = null;
        let groupStartIndex = -1;

        for (let i = 0; i < visibleColumns.length; i++) {
            const col = visibleColumns[i];
            const colDef = col.encoding_columns;
            const groupName = colDef.group_name || null;
            const variable = this.getColumnVariable(colDef.column_name);

            if (groupName && groupName !== currentGroup) {
                // Close previous group if exists
                if (currentGroup && groupStartIndex !== -1) {
                    const visibleGroupColumns = visibleColumns.slice(groupStartIndex, i);
                    const groupLength = visibleGroupColumns.length;
                    headerHTML += `<th colspan="${groupLength}" class="group-header" data-group-name="${currentGroup}"><span class="group-name">${currentGroup}</span></th>`;
                    
                    visibleGroupColumns.forEach(groupCol => {
                        const groupColDef = groupCol.encoding_columns;
                        const hasColumnFormula = this.state.columnFormulas[groupColDef.column_name];
                        const lockIcon = hasColumnFormula ? '<svg style="margin-left: 4px; width: 12px; height: 12px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' : '';
                        secondRowHTML += `
                            <th data-col-id="${groupColDef.id}" data-col-name="${groupColDef.column_name}">
                                <div class="th-inner">
                                    <span class="th-text">${groupColDef.column_name}${lockIcon}</span>
                                </div>
                            </th>
                        `;
                    });
                }
                // Start new group
                currentGroup = groupName;
                groupStartIndex = i;
                needsSecondRow = true;
            } else if (!groupName && currentGroup) {
                // Close previous group when hitting ungrouped column
                if (groupStartIndex !== -1) {
                    const visibleGroupColumns = visibleColumns.slice(groupStartIndex, i);
                    const groupLength = visibleGroupColumns.length;
                    headerHTML += `<th colspan="${groupLength}" class="group-header" data-group-name="${currentGroup}"><span class="group-name">${currentGroup}</span></th>`;
                    
                    visibleGroupColumns.forEach(groupCol => {
                        const groupColDef = groupCol.encoding_columns;
                        const hasColumnFormula = this.state.columnFormulas[groupColDef.column_name];
                        const lockIcon = hasColumnFormula ? '<svg style="margin-left: 4px; width: 12px; height: 12px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' : '';
                        secondRowHTML += `
                            <th data-col-id="${groupColDef.id}" data-col-name="${groupColDef.column_name}">
                                <div class="th-inner">
                                    <span class="th-text">${groupColDef.column_name}${lockIcon}</span>
                                </div>
                            </th>
                        `;
                    });
                }
                currentGroup = null;
                groupStartIndex = -1;
            }
            // For ungrouped columns, add header with rowspan=2
            if (!groupName) {
                const hasColumnFormula = this.state.columnFormulas[colDef.column_name];
                const lockIcon = hasColumnFormula ? '<svg style="margin-left: 4px; width: 12px; height: 12px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' : '';
                headerHTML += `
                    <th data-col-id="${colDef.id}" data-col-name="${colDef.column_name}" rowspan="2">
                        <div class="th-inner">
                            <span class="th-text">${colDef.column_name}${lockIcon}</span>
                        </div>
                    </th>
                `;
            }
        }

        // Close last group if exists
        if (currentGroup && groupStartIndex !== -1) {
            const visibleGroupColumns = visibleColumns.slice(groupStartIndex);
            const groupLength = visibleGroupColumns.length;
            headerHTML += `<th colspan="${groupLength}" class="group-header" data-group-name="${currentGroup}"><span class="group-name">${currentGroup}</span></th>`;
            
            visibleGroupColumns.forEach(groupCol => {
                const groupColDef = groupCol.encoding_columns;
                const hasColumnFormula = this.state.columnFormulas[groupColDef.column_name];
                const lockIcon = hasColumnFormula ? '<svg style="margin-left: 4px; width: 12px; height: 12px; vertical-align: middle;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' : '';
                secondRowHTML += `
                    <th data-col-id="${groupColDef.id}" data-col-name="${groupColDef.column_name}">
                        <div class="th-inner">
                            <span class="th-text">${groupColDef.column_name}${lockIcon}</span>
                        </div>
                    </th>
                `;
            });
        }

        headerHTML += '</tr>';

        // Add second row if needed
        if (needsSecondRow) {
            headerHTML += '<tr><th></th>' + secondRowHTML + '</tr>';
        }

        // Add variable row at the very top (Excel-style column letters with formula indicators)
        headerHTML = variableRowHTML + headerHTML;

        headers.innerHTML = headerHTML;
        
        // Debug: Check header attributes
        const renderedHeaders = headers.querySelectorAll('th[data-col-id]');
        // console.log('Rendered headers with data-col-id:', renderedHeaders.length);
        renderedHeaders.forEach(th => {
            // console.log('Header:', th.dataset.colName, 'data-col-id:', th.dataset.colId);
        });
        
        // Remove existing header context menu listener if exists
        if (this.headerContextMenuHandler) {
            headers.removeEventListener('contextmenu', this.headerContextMenuHandler);
        }
        
        // Add event delegation for header context menu
        this.headerContextMenuHandler = (e) => {
            const th = e.target.closest('th[data-col-id]');
            if (th) {
                e.preventDefault();
                e.stopPropagation();
                console.log('Header right-clicked via delegation:', th.dataset.colName);
                this.showHeaderContextMenu(th, e.pageX, e.pageY);
            }
        };
        
        headers.addEventListener('contextmenu', this.headerContextMenuHandler);
    },

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

        // console.log('📋 Entry Form - Processing columns:', columns.length);
        // console.log('📋 Entry Form - Column formulas:', this.state.columnFormulas);

        form.innerHTML = columns.map(col => {
            const colDef = col.encoding_columns; // join from template_columns
            const columnName = colDef.column_name;

            // Only skip columns that have COLUMN formulas (whole column), not cell formulas
            // Cell formulas are for single cells only and shouldn't hide the entire column from entry form
            const hasColumnFormula = this.state.columnFormulas[columnName];

            // console.log(`📋 Column: ${columnName}, hasColumnFormula: ${hasColumnFormula}`);

            if (hasColumnFormula) {
                console.log(`🚫 Skipping column from entry form: ${columnName}`);
                return ''; // Skip this column in entry form - it has a whole column formula
            }

            const inputType = colDef.column_type === 'date' ? 'date' : 'text';
            return `
                <div class="input-box">
                    <label>${colDef.column_name}</label>
                    <input type="${inputType}"
                        id="input_${colDef.id}"
                        data-column-id="${colDef.id}"
                        data-column-name="${colDef.column_name}"
                        placeholder="Enter ${colDef.column_name}">
                </div>
            `;
        }).join('') + `<button onclick="saveData()" class="save-btn" id="mainSaveBtn">Save Record</button>`;

        // Render headers using the new renderHeaders function
        this.renderHeaders();

        this.renderTable(this.state.localEntries);
        this.setupTableEditing();
        this.enableColumnDrag();
    },

    renderTable: function (entries) {
        const body = document.getElementById('tableData');
        if (!body) return;

        // Check if virtual scrolling should be enabled
        const shouldEnableVirtual = entries.length > 50;
        
        if (shouldEnableVirtual && !this.state.virtualScroll.enabled) {
            // Enable virtual scrolling
            this.state.virtualScroll.enabled = true;
            this.initVirtualScroll();
            this.renderVirtualTable();
            return;
        } else if (!shouldEnableVirtual && this.state.virtualScroll.enabled) {
            // Disable virtual scrolling
            this.state.virtualScroll.enabled = false;
        }

        // Regular rendering for small datasets
        body.innerHTML = '';

        const allColumns = this.state.currentTemplate.columns || [];
        
        // Filter columns based on visibility
        const visibleColumns = allColumns.filter(col => {
            const colDef = col.encoding_columns;
            return this.isColumnVisible(colDef.column_name);
        });

        if (!entries.length) {
            const colSpan = visibleColumns.length + 1; // +1 for checkbox column
            body.innerHTML = `<tr><td colspan="${colSpan}" class="no-data">No records found.</td></tr>`;
            this.renderPaginationControls(0);
            return;
        }

        // console.log(`Rendering page ${this.state.currentPage}: ${entries.length} entries (total: ${this.state.totalCount})`);
        // console.log('Visible columns for table:', visibleColumns.length);

        // Use DocumentFragment for efficient DOM manipulation
        const fragment = document.createDocumentFragment();

        entries.forEach(entry => {
            // For each entry, we need to get the values from valueDetails
            const valueMap = {};
            if (entry.valueDetails) {
                entry.valueDetails.forEach(v => {
                    // Handle null values and the string "null" - display as blank
                    const val = v.value ?? v.value_number;
                    valueMap[v.column_id] = (val === null || val === undefined || val === 'null') ? '' : val;
                });
            }

            if (!entry.values) entry.values = {};
            allColumns.forEach(col => {
                const colDef = col.encoding_columns;
                entry.values[colDef.column_name] = valueMap[colDef.id] ?? '';
            });
            
            const isEmpty = !entry.valueDetails || entry.valueDetails.length === 0;

            const tr = document.createElement('tr');
            tr.setAttribute('data-entry-id', entry.id);
            if (isEmpty) {
                tr.style.backgroundColor = '#ffffff';
            }

            // Checkbox cell
            const checkboxTd = document.createElement('td');
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'rowCheckbox';
            checkbox.setAttribute('data-id', entry.id);
            checkboxTd.appendChild(checkbox);
            tr.appendChild(checkboxTd);

            // Column cells - only render visible columns
            visibleColumns.forEach(col => {
                const colDef = col.encoding_columns;
                const val = valueMap[colDef.id] ?? '';
                const isDateType = colDef.column_type === 'date';
                
                if (isDateType) {
                    // Render date input for date type columns
                    const td = document.createElement('td');
                    td.setAttribute('data-col-id', colDef.id);
                    td.setAttribute('data-col-name', colDef.column_name);
                    
                    const dateInput = document.createElement('input');
                    dateInput.type = 'date';
                    
                    // Convert MM/DD/YYYY to YYYY-MM-DD for date input field
                    let dateValue = val || '';
                    if (val && val.includes('/')) {
                        const parts = val.split('/');
                        if (parts.length === 3) {
                            const [month, day, year] = parts.map(p => parseInt(p, 10));
                            dateValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        }
                    }
                    
                    // Set the date value
                    dateInput.value = dateValue;
                    
                    // Add empty-date class only when there's no date value
                    if (!dateValue) {
                        dateInput.classList.add('empty-date');
                    }
                    dateInput.style.cssText = `
                        width: 100%;
                        border: none;
                        background: transparent;
                        padding: 8px;
                        font-family: inherit;
                        font-size: inherit;
                    `;
                    
                    // Handle date input change
                    dateInput.addEventListener('change', async (e) => {
                        const td = e.target.parentElement;
                        const entryId = td.closest('tr').getAttribute('data-entry-id');
                        const colId = colDef.id;
                        const colName = colDef.column_name;
                        
                        // Remove empty-date class when date is selected
                        if (e.target.value) {
                            e.target.classList.remove('empty-date');
                        } else {
                            e.target.classList.add('empty-date');
                        }
                        
                        console.log('Date input changed:', colName, '=', e.target.value, 'for entry:', entryId);
                        
                        try {
                            // Clear cache when entry is updated
                            this.clearCache(this.state.currentTemplateId);
                            
                            await SupabaseService.updateEntryValues(entryId, {
                                [colId]: e.target.value
                            });
                            
                            // Update local state
                            const entry = this.state.localEntries.find(e => e.id === entryId);
                            if (entry && entry.valueDetails) {
                                const valueDetail = entry.valueDetails.find(v => v.column_id === colId);
                                if (valueDetail) {
                                    valueDetail.value = e.target.value;
                                }
                            }
                            if (entry) {
                                if (!entry.values) entry.values = {};
                                entry.values[colName] = e.target.value;
                            }

                            console.log('Calling autoRecalculateDependentFormulas for:', colName, entryId);
                            // AUTO UPDATE - Recalculate all dependent computations (same as regular cells)
                            this.autoRecalculateDependentFormulas(colName, entryId);

                            // AUTO UPDATE COLUMN COMPUTE
                            if (this.state.activeColumnCompute) {
                                this.updateColumnComputation();
                            }

                            // AUTO-UPDATE MONITORING TEMPLATES
                            await this.autoUpdateMonitoring({ 
                                values: { [colId]: e.target.value },
                                entryId: entryId,
                                columnName: colName
                            }, 'update');
                        } catch (error) {
                            console.error('Error saving date:', error);
                            UI.showToast('Error saving date', 'error');
                        }
                    });
                    
                    td.appendChild(dateInput);
                    tr.appendChild(td);
                } else {
                    // Render contenteditable cell for non-date columns
                    const td = document.createElement('td');
                    td.contentEditable = 'true';
                    td.setAttribute('data-col-id', colDef.id);
                    td.setAttribute('data-col-name', colDef.column_name);
                    td.textContent = val;
                    tr.appendChild(td);
                }
            });

            fragment.appendChild(tr);
        });

        body.appendChild(fragment);

        // Enable row drag selection for checkboxes
        this.enableRowDragSelection();

        // Render pagination controls using totalCount from server
        this.renderPaginationControls(this.state.totalCount);
        
        // Render empty row for Excel-style entry
        this.renderEmptyRow();

        // Re-render column computations since they were cleared by body.innerHTML
        if (Object.keys(this.state.activeColumnComputes || {}).length > 0) {
            this.updateAllColumnComputations();
        }
    },

    renderEmptyRow: function () {
        const emptyRowBody = document.getElementById('emptyRowInputs');
        const saveBtn = document.getElementById('saveEmptyRowBtn');
        
        if (!emptyRowBody) return;
        
        const allColumns = this.state.currentTemplate?.columns || [];
        const visibleColumns = allColumns.filter(col => {
            const colDef = col.encoding_columns;
            return this.isColumnVisible(colDef.column_name);
        });
        
        // Hide empty row if no columns or no template selected
        if (!this.state.currentTemplate || visibleColumns.length === 0) {
            emptyRowBody.style.display = 'none';
            if (saveBtn) saveBtn.style.display = 'none';
            return;
        }
        
        // Build empty row inputs
        emptyRowBody.innerHTML = '';
        
        const tr = document.createElement('tr');
        
        // Empty cell for checkbox column alignment
        const emptyTd = document.createElement('td');
        emptyTd.style.backgroundColor = '#f8fafc';
        tr.appendChild(emptyTd);
        
        visibleColumns.forEach(col => {
            const colDef = col.encoding_columns;
            const td = document.createElement('td');
            td.style.padding = '4px';
            td.style.backgroundColor = '#f8fafc';
            
            // Check if column has a formula (computed column)
            const hasFormula = this.state.columnFormulas[colDef.column_name];
            
            if (colDef.column_type === 'date') {
                const input = document.createElement('input');
                input.type = 'date';
                input.className = 'empty-row-input';
                input.dataset.colId = colDef.id;
                input.dataset.colName = colDef.column_name;
                input.style.width = '100%';
                input.style.padding = '6px';
                input.style.border = '1px solid #e2e8f0';
                input.style.borderRadius = '4px';
                input.style.fontSize = '13px';
                
                // Lock computed columns
                if (hasFormula) {
                    input.disabled = true;
                    input.style.backgroundColor = '#f1f5f9';
                    input.style.cursor = 'not-allowed';
                    input.placeholder = 'Computed';
                    input.title = 'This column is computed from a formula';
                }
                
                td.appendChild(input);
            } else {
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'empty-row-input';
                input.dataset.colId = colDef.id;
                input.dataset.colName = colDef.column_name;
                input.placeholder = hasFormula ? 'Computed' : '...';
                input.style.width = '100%';
                input.style.padding = '6px';
                input.style.border = '1px solid #e2e8f0';
                input.style.borderRadius = '4px';
                input.style.fontSize = '13px';
                
                // Lock computed columns
                if (hasFormula) {
                    input.disabled = true;
                    input.style.backgroundColor = '#f1f5f9';
                    input.style.cursor = 'not-allowed';
                    input.title = 'This column is computed from a formula';
                }
                
                td.appendChild(input);
            }
            
            tr.appendChild(td);
        });
        
        emptyRowBody.appendChild(tr);
        
        // Show the empty row and save button
        emptyRowBody.style.display = 'table-row-group';
        if (saveBtn) saveBtn.style.display = 'inline-block';
    },

    // Enable drag selection for row checkboxes
    enableRowDragSelection: function () {
        let isDragging = false;
        let startCheckbox = null;
        let startIndex = -1;
        let originalStates = new Map();

        // Use event delegation on document for drag start
        document.addEventListener('mousedown', (e) => {
            if (!e.target.classList.contains('rowCheckbox')) return;
            
            const allCheckboxes = Array.from(document.querySelectorAll('#tableData .rowCheckbox'));
            startCheckbox = e.target;
            startIndex = allCheckboxes.indexOf(startCheckbox);
            
            if (startIndex === -1) return;
            
            isDragging = true;
            originalStates.clear();
            allCheckboxes.forEach((cb, i) => {
                originalStates.set(i, cb.checked);
            });
            
            e.preventDefault();
        });

        // Use event delegation for drag selection
        document.addEventListener('mouseover', (e) => {
            if (!isDragging || !e.target.classList.contains('rowCheckbox')) return;

            const allCheckboxes = Array.from(document.querySelectorAll('#tableData .rowCheckbox'));
            const currentCheckbox = e.target;
            const currentIndex = allCheckboxes.indexOf(currentCheckbox);
            
            if (currentIndex === -1 || startIndex === -1) return;

            const minIndex = Math.min(startIndex, currentIndex);
            const maxIndex = Math.max(startIndex, currentIndex);
            const toggleState = !originalStates.get(startIndex);

            allCheckboxes.forEach((cb, i) => {
                if (i >= minIndex && i <= maxIndex) {
                    cb.checked = toggleState;
                } else {
                    cb.checked = originalStates.get(i) || false;
                }
            });
        });

        // End drag on mouseup anywhere
        document.addEventListener('mouseup', () => {
            isDragging = false;
            startCheckbox = null;
            startIndex = -1;
            originalStates.clear();
        });
    },

    renderPaginationControls: function (totalEntries) {
        const totalPages = Math.ceil(totalEntries / this.state.pageSize);
        const container = document.getElementById('paginationControls');
        
        if (!container) {
            // Create pagination container if it doesn't exist
            const tableContainer = document.getElementById('moduleWorkspace');
            if (!tableContainer) return;
            
            const paginationDiv = document.createElement('div');
            paginationDiv.id = 'paginationControls';
            paginationDiv.style.cssText = `
                display: flex;
                justify-content: center;
                align-items: center;
                gap: 10px;
                margin: 20px auto;
                padding: 15px;
                background: #ffffff;
                border-radius: 8px;
                border: 1px solid #ddd;
                max-width: fit-content;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            `;
            tableContainer.appendChild(paginationDiv);
        }
        
        const controls = document.getElementById('paginationControls');
        
        if (totalPages <= 1) {
            controls.style.display = 'none';
            return;
        }
        
        controls.style.display = 'flex';
        
        const startEntry = (this.state.currentPage - 1) * this.state.pageSize + 1;
        const endEntry = Math.min(this.state.currentPage * this.state.pageSize, totalEntries);
        
        controls.innerHTML = `
            <span style="color: #666; font-size: 14px; margin-right: 10px;">
                Showing ${startEntry}-${endEntry} of ${totalEntries} entries
            </span>
            <button onclick="AppCore.goToPage(1)" 
                ${this.state.currentPage === 1 ? 'disabled' : ''}
                style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">
                First
            </button>
            <button onclick="AppCore.prevPage()" 
                ${this.state.currentPage === 1 ? 'disabled' : ''}
                style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">
                Previous
            </button>
            <span style="font-weight: bold; color: #333; margin: 0 10px; font-size: 14px;">
                Page ${this.state.currentPage} of ${totalPages}
            </span>
            <button onclick="AppCore.nextPage(${totalPages})" 
                ${this.state.currentPage === totalPages ? 'disabled' : ''}
                style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">
                Next
            </button>
            <button onclick="AppCore.goToPage(${totalPages})" 
                ${this.state.currentPage === totalPages ? 'disabled' : ''}
                style="padding: 8px 16px; border: 1px solid #ddd; background: white; border-radius: 6px; cursor: pointer; font-size: 14px;">
                Last
            </button>
        `;
    },

    goToPage: async function (page) {
        this.state.currentPage = page;
        await this.loadEntries(this.state.currentTemplateId);
    },

    nextPage: async function (totalPages) {
        if (this.state.currentPage < totalPages) {
            this.state.currentPage++;
            await this.loadEntries(this.state.currentTemplateId);
        }
    },

    prevPage: async function () {
        if (this.state.currentPage > 1) {
            this.state.currentPage--;
            await this.loadEntries(this.state.currentTemplateId);
        }
    },

    formatDisplayValue: function (raw, colType) {
        if (colType === 'date') {
            if (raw instanceof Date && !isNaN(raw.getTime())) {
                return this.formatDateDisplay(raw);
            }
            // Return empty string for empty/null date columns
            if (raw === null || raw === undefined || raw === '' || (typeof raw === 'string' && raw.trim() === '')) {
                return '';
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

        // Hide context menus when clicking elsewhere
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.context-menu')) {
                document.getElementById('contextMenu').style.display = 'none';
                document.getElementById('headerContextMenu').style.display = 'none';
            }
        });

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
        body.addEventListener('keydown', async (e) => {

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
                for (const [entryId, values] of changedEntries.entries()) {
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

                        this.clearCache(this.state.currentTemplate.id);
                    } catch (err) {
                        UI.showToast('Delete failed: ' + err.message, 'error');
                    }
                }

                // 🔄 AUTO-UPDATE - Recalculate dependent formulas for each changed cell
                const uniqueEntryIds = [...new Set(changedCells.map(({ entryId }) => entryId))];
                for (const entryId of uniqueEntryIds) {
                    // IMPORTANT: Recalculate ALL column formulas for the entry (same as entry form)
                    await this.recalculateRowFormulas(entryId);
                }
                
                changedCells.forEach(({ entryId, colName }) => {
                    this.autoRecalculateDependentFormulas(colName, entryId);
                });

                // AUTO UPDATE COLUMN COMPUTE
                if (this.state.activeColumnCompute) {
                    this.updateColumnComputation();
                }

                // 🔄 AUTO-UPDATE MONITORING TEMPLATES (fire all quickly, let debounce batch them)
                for (const { entryId, colName } of changedCells) {
                    const values = changedEntries.get(entryId) || {};
                    this.autoUpdateMonitoring({ 
                        values,
                        entryId,
                        columnName: colName
                    }, 'update');
                }

                UI.showToast(`Cleared ${selected.length} cell(s)`);
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
                UI.showToast(`Copied ${selected.length} cell(s)`);
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
            // Handle cell context menu only (headers have their own listeners)
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

                // Right-click handler for column headers
                headerRow.addEventListener('contextmenu', (e) => {
                    const groupHeader = e.target.closest('th.group-header');
                    const columnHeader = e.target.closest('th[data-col-id]');
                    
                    if (groupHeader) {
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
                        const deleteColumnBtn = document.getElementById('ctxDeleteColumn');
                        const computeBtn = document.getElementById('ctxCompute');
                        const computeColBtn = document.getElementById('ctxComputeColumn');
                        const colorBtn = document.getElementById('ctxColor');
                        const deleteCompBtn = document.getElementById('ctxDeleteComputation');

                        if (addColToGroupBtn) addColToGroupBtn.style.display = 'flex';
                        if (renameGroupBtn) renameGroupBtn.style.display = 'flex';
                        if (editBtn) editBtn.style.display = 'none';
                        if (deleteBtn) deleteBtn.style.display = 'none';
                        if (deleteColumnBtn) deleteColumnBtn.style.display = 'none';
                        if (computeBtn) computeBtn.style.display = 'none';
                        if (computeColBtn) computeColBtn.style.display = 'none';
                        if (colorBtn) colorBtn.style.display = 'none';
                        if (deleteCompBtn) deleteCompBtn.style.display = 'none';

                        // Show menu
                        const menu = document.getElementById('contextMenu');
                        menu.style.display = 'block';
                        menu.style.top = e.pageY + 'px';
                        menu.style.left = e.pageX + 'px';
                    } else if (columnHeader) {
                        e.preventDefault();

                        const colId = columnHeader.dataset.colId;
                        const colName = columnHeader.dataset.colName;
                        
                        if (!colId || !colName) return;

                        // Store column info
                        this.state.currentColId = colId;
                        this.state.currentColName = colName;

                        // Show "Delete Column" option, hide others
                        const addColToGroupBtn = document.getElementById('ctxAddColumnToGroup');
                        const renameGroupBtn = document.getElementById('ctxRenameGroup');
                        const editBtn = document.getElementById('ctxEdit');
                        const deleteBtn = document.getElementById('ctxDelete');
                        const deleteColumnBtn = document.getElementById('ctxDeleteColumn');
                        const computeBtn = document.getElementById('ctxCompute');
                        const computeColBtn = document.getElementById('ctxComputeColumn');
                        const colorBtn = document.getElementById('ctxColor');
                        const deleteCompBtn = document.getElementById('ctxDeleteComputation');

                        if (addColToGroupBtn) addColToGroupBtn.style.display = 'none';
                        if (renameGroupBtn) renameGroupBtn.style.display = 'none';
                        if (editBtn) editBtn.style.display = 'none';
                        if (deleteBtn) deleteBtn.style.display = 'none';
                        if (deleteColumnBtn) deleteColumnBtn.style.display = 'flex';
                        if (computeBtn) computeBtn.style.display = 'none';
                        if (computeColBtn) computeColBtn.style.display = 'none';
                        if (colorBtn) colorBtn.style.display = 'none';
                        if (deleteCompBtn) deleteCompBtn.style.display = 'none';

                        // Show menu
                        const menu = document.getElementById('contextMenu');
                        menu.style.display = 'block';
                        menu.style.top = e.pageY + 'px';
                        menu.style.left = e.pageX + 'px';
                    }
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
        let oldValue = '';
        if (entry) {
            const detail = entry.valueDetails?.find(v => v.column_id === colId);
            oldValue = detail ? (detail.value ?? detail.value_number ?? '') : '';
            if (oldValue === '' && entry.values && info.colName in entry.values) {
                oldValue = entry.values[info.colName] ?? '';
            }
        }

        console.log('Inline cell blur:', info.colName, 'old:', oldValue, 'new:', newValue, 'entry:', info.entryId);

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
                    
                    // Update valueDetails properly
                    if (!entry.valueDetails) entry.valueDetails = [];
                    entry.valueDetails = entry.valueDetails.filter(v => v.column_id !== colId);
                    
                    if (newValue !== '') {
                        entry.valueDetails.push({
                            column_id: colId,
                            value: newValue
                        });
                    }
                }

                this.clearCache(this.state.currentTemplate.id);
            } catch (err) {
                UI.showToast('Save failed: ' + err.message, 'error');
            }

            console.log('Calling autoRecalculateDependentFormulas from inline edit for:', info.colName, info.entryId);
            
            // IMPORTANT: Recalculate ALL column formulas for the entry (same as entry form)
            await this.recalculateRowFormulas(info.entryId);
            
            // 🔄 AUTO UPDATE - Recalculate all dependent computations
            this.autoRecalculateDependentFormulas(info.colName, info.entryId);

            // AUTO UPDATE COLUMN COMPUTE
            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }

            // 🔄 AUTO-UPDATE MONITORING TEMPLATES
            await this.autoUpdateMonitoring({ 
                values: { [colId]: newValue },
                entryId: info.entryId,
                columnName: info.colName
            }, 'update');
        } else {
            console.log('No change detected in inline cell, skipping auto-computation');
        }
    },

    onTableCellKeyDown: function (e) {
        const td = e.target;
        if (td.tagName !== 'TD' || !td.isContentEditable) return;
        if (e.key === 'Enter') { e.preventDefault(); td.blur(); }
    },

    onTableCellPaste: async function (e) {
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
        
        for (const [entryId, values] of changedEntries) {
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
                this.clearCache(this.state.currentTemplate.id);
            } catch (err) {
                UI.showToast('Save failed: ' + err.message, 'error');
            }
        }

        // 🔄 AUTO-UPDATE - Recalculate for each changed entry and column
        for (const [entryId, values] of changedEntries) {
            // IMPORTANT: Recalculate ALL column formulas for the entry (same as entry form)
            await this.recalculateRowFormulas(entryId);
            
            for (const colId of Object.keys(values)) {
                const colName = this.state.currentTemplate.columns.find(
                    c => c.encoding_columns.id === colId
                )?.encoding_columns.column_name;
                if (colName) {
                    await this.autoRecalculateDependentFormulas(colName, entryId);
                }
            }
        }

        // AUTO UPDATE COLUMN COMPUTE   
        if (this.state.activeColumnCompute) {
            this.updateColumnComputation();
        }

        // 🔄 AUTO-UPDATE MONITORING TEMPLATES (fire all quickly, let debounce batch them)
        for (const [entryId, values] of changedEntries) {
            this.autoUpdateMonitoring({ 
                values: values,
                entryId: entryId
            }, 'update');
        }
    },

    saveEntryField: async function (entryId, values) {
        try {
            await SupabaseService.updateEntryValues(entryId, values);

            const entry = this.state.localEntries.find(e => e.id === entryId);
            if (entry) {
                if (!entry.values) entry.values = {};
                if (!entry.valueDetails) entry.valueDetails = [];
                
                Object.entries(values).forEach(([colId, val]) => {
                    const col = this.state.currentTemplate.columns
                        .find(c => c.encoding_columns.id === colId);
                    if (col) {
                        const columnName = col.encoding_columns.column_name;
                        
                        // Update entry values
                        if (val === '' || val === null || val === undefined) {
                            delete entry.values[columnName];
                        } else {
                            entry.values[columnName] = val;
                        }
                        
                        // Update valueDetails
                        entry.valueDetails = entry.valueDetails.filter(v => v.column_id !== colId);
                        
                        if (val !== '' && val !== null && val !== undefined) {
                            let displayValue = val;
                            if (col.encoding_columns.column_type === 'date' && typeof val === 'string') {
                                // Convert MM/DD/YYYY to YYYY-MM-DD for database storage
                                if (val.includes('/')) {
                                    const parts = val.split('/');
                                    if (parts.length === 3) {
                                        const [month, day, year] = parts.map(p => parseInt(p, 10));
                                        displayValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    }
                                }
                            }
                            entry.valueDetails.push({
                                column_id: colId,
                                value: displayValue
                            });
                        }
                    }
                });
            }

            this.clearCache(this.state.currentTemplate.id);
        } catch (err) {
            UI.showToast('Save failed: ' + err.message, 'error');
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
            UI.showToast('Failed to load entry: ' + error.message, 'error');
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
            UI.showToast('Entry updated successfully!');
            this.clearCache(this.state.currentTemplateId);
            await this.loadEntries(this.state.currentTemplateId);
        } catch (error) {
            console.error('Error updating entry:', error);
            UI.showToast('Error updating entry', 'error');
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
            UI.showToast('Failed to load templates: ' + error.message, 'error');
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
        if (!name) return UI.showToast('Template name is required.', 'error');

        try {
            const template = await SupabaseService.createTemplate(
                this.state.departmentId,
                name,
                null,
                templateType // Pass template type
            );

            this.state.allTemplates.push(template);
            this.renderCategoryCards();
            UI.showToast(`Template created (Type: ${templateType})!`);
            document.getElementById('newCategoryName').value = '';
            document.getElementById('newTemplateType').value = 'encoding';
            window.closeModal();
        } catch (error) {
            UI.showToast('Failed: ' + error.message, 'error');
        }
    },

    deleteTemplate: async function (id, name) {
        if (!confirm(`Delete "${name}"? All data will be lost.`)) return;

        try {
            await SupabaseService.deleteTemplate(id);
            this.state.allTemplates = this.state.allTemplates.filter(t => t.id !== id);
            this.clearCache(id);
            
            if (this.state.currentTemplate?.id === id) {
                this.state.currentTemplate = null;
                document.getElementById('moduleWorkspace').style.display = 'none';
            }

            this.renderCategoryCards();
            UI.showToast('Template deleted.');
        } catch (error) {
            UI.showToast('Failed: ' + error.message, 'error');
        }
    },

    // ============================================================
    // COLUMNS
    // ============================================================
    openColumnModal: async function (groupName = null) {
        if (!this.state.currentTemplate) {
            return UI.showToast('No template selected.', 'error');
        }

        const modal = document.getElementById('columnModal');
        const encodingForm = document.getElementById('encodingColumnForm');
        const monitoringForm = document.getElementById('monitoringColumnForm');
        const columnSelect = document.getElementById('existingColumnSelect');

        // Check if current template is monitoring type
        const isMonitoring = this.state.currentTemplate.module === 'monitoring';

        if (isMonitoring) {
            // Show monitoring form with tabs
            encodingForm.style.display = 'none';
            monitoringForm.style.display = 'block';

            // Initialize tabs - default to existing column tab
            this.switchColumnTab('existing');

            // Populate dropdown with columns from encoding templates
            try {
                const encodingColumns = await SupabaseService.getEncodingTemplateColumns(this.state.departmentId);
                
                columnSelect.innerHTML = '<option value="">-- Select a column --</option>';
                encodingColumns.forEach(col => {
                    const option = document.createElement('option');
                    option.value = col.id;
                    option.textContent = `${col.column_name} - ${col.template_name} (${col.column_type})`;
                    columnSelect.appendChild(option);
                });

                if (encodingColumns.length === 0) {
                    UI.showToast('No columns found in encoding templates. Please create encoding templates first.', 'error');
                }
            } catch (error) {
                UI.showToast('Failed to load encoding columns: ' + error.message, 'error');
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
        if (!this.state.currentTemplate) return UI.showToast('No template selected.', 'error');

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
            this.clearCache(this.state.currentTemplate.id);
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);

            let columnId;

            if (isMonitoring) {
                // Check which tab is active for monitoring templates
                const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
                
                if (activeTab === 'existing') {
                    // For monitoring templates: select existing column from encoding
                    columnId = document.getElementById('existingColumnSelect').value;
                    if (!columnId) return UI.showToast('Please select a column from encoding templates.', 'error');

                    // Check if column already exists in current template
                    const existingColumn = this.state.currentTemplate.columns?.find(
                        col => col.encoding_columns.id === columnId
                    );
                    if (existingColumn) {
                        return UI.showToast('This column is already added to the template.', 'error');
                    }
                } else if (activeTab === 'copyMultiple') {
                    // For monitoring templates: copy multiple columns from encoding
                    const checkedCheckboxes = document.querySelectorAll('.column-checkbox:checked');
                    if (checkedCheckboxes.length === 0) {
                        return UI.showToast('Please select at least one column to copy.', 'error');
                    }

                    const columnIds = Array.from(checkedCheckboxes).map(cb => cb.dataset.columnId);
                    
                    // Calculate display order to add at the end
                    const existingColumns = this.state.currentTemplate.columns || [];
                    let displayOrder = existingColumns.length > 0
                        ? Math.max(...existingColumns.map(col => col.display_order || 0))
                        : 0;

                    // Add each selected column
                    for (const colId of columnIds) {
                        displayOrder++;
                        await SupabaseService.addColumnToTemplate(
                            this.state.currentTemplate.id,
                            colId,
                            displayOrder
                        );
                    }

                    // Show loading overlay for data copying
                    if (loadingOverlay) {
                        loadingOverlay.style.display = 'flex';
                    }

                    // Copy data for all added columns
                    let totalCopied = 0;
                    for (const colId of columnIds) {
                        const copiedCount = await SupabaseService.copyColumnDataToMonitoring(
                            this.state.currentTemplate.id,
                            colId,
                            this.state.departmentId
                        );
                        totalCopied += copiedCount;
                    }

                    // Clear ALL caches to force refresh after copy
                    this.clearCache(this.state.currentTemplate.id);

                    // Refresh template structure FIRST to get new columns
                    // console.log('🔄 Refreshing template structure after multiple column addition...');
                    this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);
                    // console.log('📊 Updated template columns:', this.state.currentTemplate.columns?.length);
                    
                    // Then reload entries with updated template structure
                    await this.loadEntries(this.state.currentTemplate.id);

                    // console.log('✅ Multiple column addition completed successfully');
                    UI.showToast(`Added ${columnIds.length} columns! ${totalCopied} entries copied from encoding.`, 'success');
                    window.closeColumnModal();
                    
                    // Final render to ensure everything is updated
                    this.renderAll();
                    return;
                } else {
                    // For monitoring templates: create new column
                    const name = document.getElementById('monitoringNewColumnName').value.trim();
                    const columnType = document.getElementById('monitoringNewColumnType').value;
                    const groupName = document.getElementById('monitoringColumnGroup').value.trim() || null;
                    
                    if (!name) return UI.showToast('Column name is required.', 'error');

                    // Create reusable column with group name (for visual grouping only)
                    const column = await SupabaseService.createColumn(
                        this.state.departmentId,
                        name,
                        columnType,
                        0, // display order will be set when adding to template
                        false, // isRequired
                        groupName // Use group name instead of parent_column_id
                    );
                    columnId = column.id;
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
                
                if (!name) return UI.showToast('Column name is required.', 'error');

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
            this.clearCache(this.state.currentTemplate.id);
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

                // Clear ALL caches to force refresh after copy
                this.clearCache(this.state.currentTemplate.id);

                // Refresh template structure FIRST to get new columns
                // console.log('🔄 Refreshing template structure after column addition...');
                this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);
                // console.log('📊 Updated template columns:', this.state.currentTemplate.columns?.length);

                // Then reload entries with updated template structure
                await this.loadEntries(this.state.currentTemplate.id);
                
                // console.log('✅ Column addition completed successfully');
                UI.showToast(`Column added! ${copiedCount} entries copied from encoding.`);
            } else {
                // For encoding templates, refresh template structure first then reload entries
                this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);
                await this.loadEntries(this.state.currentTemplate.id);
                UI.showToast('Column added!');
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
            console.error('Error details:', error.message, error.stack);

            // Show user-friendly error message
            if (error.message && error.message.includes('duplicate') || error.message && error.message.includes('unique constraint')) {
                UI.showToast('A column with this name already exists in this group.', 'error');
            } else {
                UI.showToast(`Failed to add column: ${error.message}`, 'error');
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

    switchColumnTab: function(tabName) {
        // Update tab buttons
        const tabButtons = document.querySelectorAll('.tab-btn');
        tabButtons.forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === tabName) {
                btn.classList.add('active');
            }
        });

        // Update tab panes
        const tabPanes = document.querySelectorAll('.tab-pane');
        tabPanes.forEach(pane => {
            pane.classList.remove('active');
            pane.style.display = 'none';
        });

        // Show selected tab - handle both naming conventions
        let selectedPane = document.getElementById(`${tabName}ColumnTab`);
        if (!selectedPane) {
            selectedPane = document.getElementById(`${tabName}Tab`);
        }
        if (selectedPane) {
            selectedPane.classList.add('active');
            selectedPane.style.display = 'block';
        }

        // Load encoding columns when switching to copyMultiple tab
        if (tabName === 'copyMultiple') {
            this.loadEncodingColumnsForCopy();
        }
    },

    loadEncodingColumnsForCopy: async function() {
        const columnsList = document.getElementById('encodingColumnsList');
        columnsList.innerHTML = '<p style="color:#666;font-size:12px;">Loading columns...</p>';

        try {
            const encodingColumns = await SupabaseService.getEncodingTemplateColumns(this.state.departmentId);
            
            if (encodingColumns.length === 0) {
                columnsList.innerHTML = '<p style="color:#666;font-size:12px;">No columns found in encoding templates.</p>';
                return;
            }

            // Group columns by template
            const groupedColumns = {};
            encodingColumns.forEach(col => {
                const templateName = col.template_name || 'Unknown Template';
                if (!groupedColumns[templateName]) {
                    groupedColumns[templateName] = [];
                }
                groupedColumns[templateName].push(col);
            });

            // Build HTML with checkboxes
            let html = '';
            for (const [templateName, columns] of Object.entries(groupedColumns)) {
                html += `<div class="template-group">
                    <div class="template-header">
                        <label>
                            <input type="checkbox" class="template-checkbox" data-template="${templateName}" onchange="AppCore.toggleTemplateColumns(this)">
                            ${templateName}
                        </label>
                    </div>
                    <div class="columns-list">`;
                
                columns.forEach(col => {
                    // Check if column already exists in current template
                    const existingColumn = this.state.currentTemplate.columns?.find(
                        c => c.encoding_columns.id === col.id
                    );
                    const isAdded = existingColumn ? '<span class="already-added">(already added)</span>' : '';
                    const disabled = existingColumn ? 'disabled' : '';
                    
                    html += `<div class="column-item">
                        <label>
                            <input type="checkbox" class="column-checkbox" data-column-id="${col.id}" data-template="${templateName}" ${disabled}>
                            <div class="column-info">
                                <span>${col.column_name}</span>
                                <span class="column-type">${col.column_type}</span>
                                ${isAdded}
                            </div>
                        </label>
                    </div>`;
                });
                
                html += '</div></div>';
            }

            html += `<div class="select-all-controls">
                <button onclick="AppCore.selectAllCopyColumns(true)">Select All</button>
                <button onclick="AppCore.selectAllCopyColumns(false)">Deselect All</button>
            </div>`;

            columnsList.innerHTML = html;
        } catch (error) {
            columnsList.innerHTML = `<p style="color:red;font-size:12px;">Failed to load columns: ${error.message}</p>`;
        }
    },

    toggleTemplateColumns: function(checkbox) {
        const templateName = checkbox.dataset.template;
        const columnCheckboxes = document.querySelectorAll(`.column-checkbox[data-template="${templateName}"]`);
        columnCheckboxes.forEach(cb => {
            if (!cb.disabled) {
                cb.checked = checkbox.checked;
            }
        });
    },

    selectAllCopyColumns: function(select) {
        const columnCheckboxes = document.querySelectorAll('.column-checkbox:not(:disabled)');
        columnCheckboxes.forEach(cb => {
            cb.checked = select;
        });
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

            this.clearCache(this.state.currentTemplate.id);

            this.renderAll();
            UI.showToast('Column deleted.');
        } catch (error) {
            UI.showToast('Failed: ' + error.message, 'error');
        }
    },

    // ============================================================
    // ENTRIES — SAVE / DELETE
    // ============================================================
    saveData: async function (selector = '#dynamicForm [data-column-id]') {
        if (!this.state.currentTemplateId) {
            this.showToast('No template selected', 'error');
            return;
        }

        const inputs = document.querySelectorAll(selector);
        if (!inputs.length) return;

        // Collect values
        let hasData = false;
        const values = {};
        inputs.forEach(input => {
            const val = input.value?.trim();
            if (val) {
                hasData = true;
                values[input.dataset.columnId || input.dataset.colId] = val;
            }
        });

        if (!hasData) {
            UI.showToast('Please enter at least one value', 'error');
            return;
        }

        // Clear cache when new data is saved
        this.clearCache(this.state.currentTemplateId);

        try {
            UI.setLoading(true);

            // 1. Create the base entry record
            const entry = await SupabaseService.createEntry(
                this.state.currentTemplateId,
                this.state.departmentId
            );

            // 2. Save the values
            await SupabaseService.updateEntryValues(entry.id, values);

            // 3. Add the new entry to localEntries with its values so formulas can be computed
            const valueDetails = Object.entries(values).map(([colId, val]) => ({
                column_id: colId,
                value: val
            }));

            const newEntry = {
                id: entry.id,
                values: {},
                valueDetails: valueDetails
            };

            const columns = this.state.currentTemplate?.columns || [];
            columns.forEach(col => {
                const colDef = col.encoding_columns;
                const valObj = valueDetails.find(v => v.column_id === colDef.id);
                if (valObj) {
                    newEntry.values[colDef.column_name] = valObj.value;
                }
            });

            this.state.localEntries.push(newEntry);

            // 4. Apply column formulas to the new entry
            await this.recalculateRowFormulas(entry.id);

            // 5. Also trigger auto-recalculation for changed columns
            for (const colId of Object.keys(values)) {
                const colDef = this.state.currentTemplate.columns?.find(c => c.encoding_columns.id === colId);
                if (colDef) {
                    await this.autoRecalculateDependentFormulas(colDef.encoding_columns.column_name, entry.id);
                }
            }

            // 6. UI Feedback
            inputs.forEach(input => input.value = '');
            UI.showToast('Data saved successfully!');

            // 7. Refresh table
            await this.loadEntries(this.state.currentTemplateId);
            await this.recalculateRowFormulas(entry.id);
            this.renderTable(this.state.localEntries);

            // 8. Update column compute if active
            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }

            // 9. AUTO-UPDATE MONITORING TEMPLATES
            await this.autoUpdateMonitoring({ entryId: entry.id, values: values }, 'create');

        } catch (error) {
            console.error('Error saving data:', error);
            UI.showToast('Error saving data: ' + error.message, 'error');
        } finally {
            UI.setLoading(false);
        }
    },

    saveEmptyRow: async function () {
        await this.saveData('.empty-row-input');
    },

    deleteEntry: async function (id) {
        if (!confirm('Are you sure you want to delete this record?')) return;

        try {
            await SupabaseService.deleteEntry(id);
            UI.showToast('Record deleted!');
            
            const deletedEntry = this.state.localEntries.find(e => e.id === id);
            const deletedEntryValues = deletedEntry?.values;

            // Clear cache when entry is deleted
            this.clearCache(this.state.currentTemplateId);
            this.state.localEntries = await SupabaseService.getAllEntries(this.state.currentTemplate.id);
            this.renderTable(this.state.localEntries);

            // AUTO UPDATE COLUMN COMPUTE   
            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }

            // 🔄 AUTO-UPDATE MONITORING TEMPLATES
            await this.autoUpdateMonitoring({ 
                entryId: id,
                operation: 'delete',
                entryValues: deletedEntryValues
            }, 'delete');
        } catch (error) {
            UI.showToast('Failed to delete: ' + error.message, 'error');
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
                String(v.value ?? v.value_number ?? '').toLowerCase().includes(term)
            );
        });
        // Reset pagination when searching
        this.state.currentPage = 1;
        this.renderTable(filtered);
    },

    sortByDate: function () {
        const columns = this.state.currentTemplate.columns || [];
        const dateColDef = columns.find(col => col.encoding_columns.column_type === 'date');
        if (!dateColDef) return UI.showToast('No date column found.', 'error');
        
        const dateColId = dateColDef.encoding_columns.id;
        
        this.state.localEntries.sort((a, b) => {
            const aVal = a.valueDetails?.find(v => v.column_id === dateColId)?.value || '0';
            const bVal = b.valueDetails?.find(v => v.column_id === dateColId)?.value || '0';
            const d1 = new Date(aVal);
            const d2 = new Date(bVal);
            return this.state.dateSortAsc ? d1 - d2 : d2 - d1;
        });
        this.state.dateSortAsc = !this.state.dateSortAsc;
        // Reset pagination when sorting
        this.state.currentPage = 1;
        this.renderTable(this.state.localEntries);
    },

    // ============================================================
    // EXPORT
    // ============================================================
    exportToExcel: function () {
        if (!this.state.currentTemplate) 
            return UI.showToast('No template selected.', 'error');

        if (!this.state.localEntries.length) 
            return UI.showToast('No data to export.', 'error');

        const columns = this.state.currentTemplate.columns || [];

        // ============================
        // 1. HEADER
        // ============================
        const header = columns.map(col => col.encoding_columns.column_name);

        // ============================
        // 2. DATA
        // ============================
        const data = [];

        this.state.localEntries.forEach(entry => {
            const row = [];

            columns.forEach(col => {
                const colDef = col.encoding_columns;
                const valObj = entry.valueDetails?.find(v => v.column_id === colDef.id);

                const value = valObj?.value ?? valObj?.value_number ?? '';

                row.push(value);
            });

            data.push(row);
        });

        // ============================
        // 3. COMPUTE ROW (UNDER HEADER)
        // ============================
        const computeRow = new Array(header.length).fill('');

        // Process ALL active column computations
        Object.entries(this.state.activeColumnComputes || {}).forEach(([columnName, config]) => {
            const colIndex = header.indexOf(columnName);

            if (colIndex !== -1) {
                const values = data.map(r => parseFloat(r[colIndex]) || 0);

                let result = 0;
                switch (config.func) {
                    case 'sum':
                        result = values.reduce((a,b)=>a+b,0);
                        break;
                    case 'average':
                        result = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
                        break;
                    case 'max':
                        result = values.length ? Math.max(...values) : 0;
                        break;
                    case 'min':
                        result = values.length ? Math.min(...values) : 0;
                        break;
                    case 'count':
                        result = values.length;
                        break;
                }

                computeRow[colIndex] = `${config.func.toUpperCase()}: ${result}`;
            }
        });

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

        UI.showToast('Exported with colors & column totals!');
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
            return UI.showToast('Select a template first.', 'error');
        const columns = this.state.currentTemplate.columns || [];
        if (!columns.length)
            return UI.showToast('Add columns to template before importing.', 'error');
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
                UI.showToast('Could not read file: ' + err.message, 'error');
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
        if (!this.state._importWorkbook) return UI.showToast('No file loaded.', 'error');
        if (!this.state.currentTemplate)  return UI.showToast('No template selected.', 'error');

        const sheetName = this._el('importSheet')?.value;
        const headerRow = Math.max(1, parseInt(this._el('importHeaderRow')?.value || '1') || 1);
        const ws        = this.state._importWorkbook.Sheets[sheetName];
        let rows        = XLSX.utils.sheet_to_json(ws, { defval: '', range: headerRow - 1, raw: false });

        if (!rows.length) return UI.showToast('No data rows to import.', 'error');

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
                const strVal = String(val ?? '').trim();
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
            return UI.showToast('No rows with data found in mapped columns.', 'error');
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
            this.clearCache(this.state.currentTemplate.id);
            // Refresh the table with new data
            await this.loadEntries(this.state.currentTemplate.id);
            this.closeImportModal();
            UI.showToast(`${rowsWithData.length} rows imported successfully!`);
        } catch (err) {
            console.error('Import error:', err);
            UI.showToast('Import failed: ' + err.message, 'error');
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

        if (!checked.length) return UI.showToast('No selected rows.', 'error');

        if (!confirm(`Delete ${checked.length} records?`)) return;

        const deleteBtn = document.querySelector('[onclick*="deleteSelected"]');
        const originalText = deleteBtn?.innerText;
        if (deleteBtn) { deleteBtn.disabled = true; deleteBtn.innerText = `Deleting ${checked.length}...`; }

        try {
            const entriesToDelete = this.state.localEntries.filter(e => checked.includes(e.id));
            const entryValuesById = Object.fromEntries(entriesToDelete.map(e => [e.id, e.values || {}]));

            // Delete entries in batches of 100 (service layer handles batching)
            console.log(`Deleting ${checked.length} entries in chunks...`);
            await SupabaseService.deleteEntries(checked);
            console.log(`Deleted ${checked.length} entries`);

            // Clear cache when entries are deleted
            this.clearCache(this.state.currentTemplateId);
            this.state.localEntries = await SupabaseService.getAllEntries(this.state.currentTemplate.id);
            this.renderTable(this.state.localEntries);

            // 🔄 AUTO-UPDATE: Recalculate column computations after deletion
            if (this.state.activeColumnCompute) {
                this.updateColumnComputation();
            }

            // 🔄 AUTO-UPDATE MONITORING TEMPLATES for each deleted entry (fire all quickly, let debounce batch them)
            for (const id of checked) {
                this.autoUpdateMonitoring({ 
                    entryId: id,
                    operation: 'delete',
                    entryValues: entryValuesById[id]
                }, 'delete');
            }

            UI.showToast(`Deleted ${checked.length} records.`);
        } catch (err) {
            console.error('Delete error:', err);
            UI.showToast('Delete failed: ' + err.message, 'error');
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
            UI.showToast('Template renamed!');
        } catch (err) {
            UI.showToast('Rename failed: ' + err.message, 'error');
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
            
            // Update cache with the refreshed template data
            const cacheKey = `template-${this.state.currentTemplate.id}`;
            if (this.state.cache[cacheKey]) {
                this.state.cache[cacheKey].template = this.state.currentTemplate;
            }
            
            // Regenerate variable mappings to ensure consistency
            this.generateColumnVariables();
            
            this.renderAll();
            UI.showToast('Column renamed!');
        } catch (err) {
            UI.showToast('Rename failed: ' + err.message, 'error');
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
                UI.showToast('No columns found in this group', 'error');
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
            UI.showToast('Group renamed!');
            this.closeRenameGroupModal();
        } catch (err) {
            UI.showToast('Rename failed: ' + err.message, 'error');
        }
    },

    //Column Drag
    enableColumnDrag: function () {
        // Check if there's a third row (groups exist)
        const allRows = document.querySelectorAll('#tableHeaders tr');
        console.log('Total header rows:', allRows.length);
        
        let headerRow;
        
        if (allRows.length >= 3) {
            // Groups exist: use the third row (actual column names under groups)
            headerRow = allRows[2];
            console.log('Using row 3 (groups exist)');
        } else {
            // No groups: use the second row (column names with rowspan)
            headerRow = allRows[1];
            console.log('Using row 2 (no groups)');
        }
        
        if (!headerRow) {
            console.log('No header row found');
            return;
        }

        let dragStartIndex = null;

        const getIndex = (th) => {
            return Array.from(th.parentNode.children).indexOf(th);
        };

        headerRow.querySelectorAll('th').forEach((th, index) => {
            if (index === 0) return; // skip checkbox column
            if (th.hasAttribute('colspan')) return; // skip group headers

            // console.log(`Setting draggable on th ${index}:`, th.textContent);
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
            UI.showToast('Failed to update column order: ' + err.message, 'error');
        });
    },

    //-----------------------------------------------------------------------------------------
    //------------Formula Conflict Management------------------
    //-----------------------------------------------------------------------------------------
    removeColumnFormula: async function(columnName) {
        // Remove from state
        delete this.state.columnFormulas[columnName];
        
        // Remove from database
        const colDef = this.state.currentTemplate?.columns?.find(c => c.encoding_columns.column_name === columnName)?.encoding_columns;
        if (colDef) {
            try {
                await SupabaseService.deleteColumnFormula(this.state.currentTemplate.id, colDef.id);
            } catch (err) {
                console.error('Failed to delete column formula:', err);
            }
        }
    },
    
    removeAllCellFormulasForColumn: async function(columnName) {
        const formulasToRemove = [];
        
        // Find all cell formulas for this column (including broken formulas with undefined entryId)
        Object.keys(this.state.cellFormulas).forEach(key => {
            const [entryId, colName] = key.split('|');
            if (colName === columnName) {
                formulasToRemove.push({ entryId, key });
            }
        });
        
        // Remove from state
        formulasToRemove.forEach(({ key }) => {
            delete this.state.cellFormulas[key];
        });
        
        // Remove from database - only delete formulas with valid entryIds
        const colDef = this.state.currentTemplate?.columns?.find(c => c.encoding_columns.column_name === columnName)?.encoding_columns;
        if (colDef) {
            try {
                const validFormulas = formulasToRemove.filter(({ entryId }) => entryId && entryId !== 'undefined');
                if (validFormulas.length > 0) {
                    await Promise.all(
                        validFormulas.map(({ entryId }) => 
                            SupabaseService.deleteCellFormula(
                                this.state.currentTemplate.id,
                                entryId,
                                colDef.id
                            )
                        )
                    );
                }
            } catch (err) {
                console.error('Failed to delete cell formulas:', err);
            }
        }
    },

    //-----------------------------------------------------------------------------------------
    //------------Variable Mapping System for Columns------------------
    //-----------------------------------------------------------------------------------------
    generateColumnVariables: function() {
        const columns = this.state.currentTemplate?.columns || [];
        this.state.columnVariables = {};
        this.state.variableColumns = {};
        
        columns.forEach((col, index) => {
            const colName = col.encoding_columns.column_name;
            // Generate Excel-style column names: A, B, C, ..., Z, AA, AB, ...
            const variable = this.indexToColumnVariable(index);
            this.state.columnVariables[colName] = variable;
            this.state.variableColumns[variable] = colName;
        });
    },
    
    indexToColumnVariable: function(index) {
        let variable = '';
        while (index >= 0) {
            variable = String.fromCharCode(65 + (index % 26)) + variable;
            index = Math.floor(index / 26) - 1;
        }
        return variable;
    },
    
    getColumnVariable: function(columnName) {
        return this.state.columnVariables[columnName] || columnName;
    },
    
    getColumnNameFromVariable: function(variable) {
        return this.state.variableColumns[variable] || variable;
    },
    
    convertFormulaToVariables: function(formula) {
        if (!formula) return formula;
        
        let convertedFormula = formula;
        Object.keys(this.state.columnVariables).forEach(colName => {
            const variable = this.state.columnVariables[colName];
            const safeCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${safeCol}\\b`, 'g');
            convertedFormula = convertedFormula.replace(regex, variable);
        });
        
        return convertedFormula;
    },
    
    convertFormulaToColumnNames: function(formula) {
        if (!formula) return formula;
        
        let convertedFormula = formula;
        Object.keys(this.state.variableColumns).forEach(variable => {
            const colName = this.state.variableColumns[variable];
            const safeVar = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${safeVar}\\b`, 'g');
            convertedFormula = convertedFormula.replace(regex, colName);
        });
        
        return convertedFormula;
    },

    //-----------------------------------------------------------------------------------------
    //-------------Para sa Computation ng mga cells gamit calculation types------------------
    //-----------------------------------------------------------------------------------------
    getCurrentFormula: function () {
        // Check if we have a current cell selected
        const td = this.state.currentCell;
        if (!td) return null;

        const row = td.closest('tr');
        const entryId = row?.dataset.entryId;
        const columnName = this.state.currentColName;

        if (!entryId || !columnName) return null;

        // Check for cell-specific formula first (including broken formulas with undefined entryId)
        const cellFormulaKey = `${entryId}|${columnName}`;
        const brokenFormulaKey = `undefined|${columnName}`;
        
        if (this.state.cellFormulas[cellFormulaKey]) {
            return this.state.cellFormulas[cellFormulaKey];
        }
        
        if (this.state.cellFormulas[brokenFormulaKey]) {
            return this.state.cellFormulas[brokenFormulaKey];
        }

        // Check for column formula
        if (this.state.columnFormulas[columnName]) {
            return this.state.columnFormulas[columnName];
        }

        return null;
    },

    openComputeModal: function (isFromHeader = false) {
        // Generate column variables before opening modal
        this.generateColumnVariables();
        
        const modal = document.createElement('div');
        modal.className = 'compute-modal';

        const cols = this.state.currentTemplate?.columns || [];
        
        // Check if current template is monitoring category
        const isMonitoringTemplate = this.state.currentTemplate?.module === 'monitoring';
        
        // Get available encoding categories if current template is monitoring
        let encodingCategoriesHtml = '';
        if (isMonitoringTemplate) {
            const encodingTemplates = this.state.allTemplates.filter(t => t.module === 'encoding');
            encodingCategoriesHtml = `
                <div class="compute-section" style="margin-top: 16px;">
                    <span class="section-label">Available Encoding Categories</span>
                    <div class="encoding-categories" style="margin-top: 8px;">
                        ${encodingTemplates.map(t => `
                            <button type="button" class="encoding-category-btn" data-template-id="${t.id}" data-template-name="${t.name}">${t.name}</button>
                        `).join('')}
                    </div>
                </div>
            `;
        }
        
        // Build available column computations HTML
        let columnComputationsHtml = '';
        const activeComputes = this.state.activeColumnComputes || {};
        const computeKeys = Object.keys(activeComputes);
        if (computeKeys.length > 0) {
            columnComputationsHtml = `
                <div class="compute-section" style="margin-top: 16px;">
                    <span class="section-label">Available Column Computations</span>
                    <div class="compute-columns" style="margin-top: 8px;">
                        ${computeKeys.map(colName => {
                            const config = activeComputes[colName];
                            const variable = this.getColumnVariable(colName);
                            const values = this.state.localEntries.map(entry => {
                                const raw = entry.values?.[colName] ?? '';
                                return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
                            });
                            let result = 0;
                            switch(config.func) {
                                case 'sum': result = values.reduce((a,b)=>a+b,0); break;
                                case 'average': result = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0; break;
                                case 'max': result = values.length ? Math.max(...values) : 0; break;
                                case 'min': result = values.length ? Math.min(...values) : 0; break;
                                case 'count': result = values.length; break;
                            }
                            result = this.formatNumber(result);
                            const funcLabel = config.func.toUpperCase();
                            return `<button type="button" class="col-compute-btn col-btn" data-col-name="${colName}" data-func="${config.func}" data-variable="${variable}">
                                <div style="display: flex; flex-direction: column; align-items: center;">
                                    <span style="font-weight: bold; color: #059669; font-size: 13px;">COL${funcLabel}(${variable})</span>
                                    <span style="font-size: 11px; color: #666;">${colName}</span>
                                    <span style="font-size: 11px; color: #059669;">= ${result}</span>
                                </div>
                            </button>`;
                        }).join('')}
                    </div>
                </div>
            `;
        }

        // Get current formula for the selected cell/column and convert to variables
        const currentFormula = this.convertFormulaToVariables(this.getCurrentFormula() || '');
        // Escape quotes for HTML attribute to prevent truncation
        const escapedFormula = currentFormula.replace(/"/g, '&quot;');

        // Determine the current formula mode (cell vs column)
        const td = this.state.currentCell;
        const row = td?.closest('tr');
        const entryId = row?.dataset.entryId;
        const columnName = this.state.currentColName;
        const cellFormulaKey = `${entryId}|${columnName}`;
        const hasCellFormula = !!(this.state.cellFormulas[cellFormulaKey]);
        const hasColumnFormula = !!(columnName && this.state.columnFormulas[columnName]);
        
        // If called from header, force column mode and disable cell selection
        let currentMode;
        let disableCellToggle = false;
        
        if (isFromHeader) {
            currentMode = 'column';
            disableCellToggle = true;
        } else {
            // If a column formula exists (and no cell-specific override), mode is "column"
            currentMode = (hasColumnFormula && !hasCellFormula) ? 'column' : 'cell';
        }

        modal.innerHTML = `
            <div class="compute-box">
                <div class="compute-header">
                    <h3>Compute Formula</h3>
                    <button id="closeComputeX" class="compute-close">&times;</button>
                </div>

                <label>Formula</label>
                <input id="computeFormula" placeholder="=SUM(A, B, C)" value="${escapedFormula}">

                <div class="compute-toggle" id="computeMode">
                    <button type="button" class="toggle-btn${currentMode === 'cell' ? ' toggle-active' : ''}" data-mode="cell" ${disableCellToggle ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>Selected Cell</button>
                    <button type="button" class="toggle-btn${currentMode === 'column' ? ' toggle-active' : ''}" data-mode="column" ${disableCellToggle ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>Whole Column</button>
                </div>

                <div class="compute-section">
                    <span class="section-label">Columns</span>
                    <div class="compute-columns">
                        ${cols.map(c => `
                            <button type="button" class="col-btn" data-col-name="${c.encoding_columns.column_name}">
                                <div style="display: flex; flex-direction: column; align-items: center;">
                                    <span style="font-weight: bold; color: #2563eb; font-size: 14px;">${this.getColumnVariable(c.encoding_columns.column_name)}</span>
                                    <span style="font-size: 11px; color: #666;">${c.encoding_columns.column_name}</span>
                                </div>
                            </button>
                        `).join('')}
                    </div>
                </div>

                ${encodingCategoriesHtml}

                ${columnComputationsHtml}

                <div class="compute-section">
                    <span class="section-label">Math</span>
                    <div class="compute-functions">
                        <button type="button" class="func-btn func-math">=SUM()</button>
                        <button type="button" class="func-btn func-math">=AVERAGE()</button>
                        <button type="button" class="func-btn func-math">=COUNT()</button>
                        <button type="button" class="func-btn func-math">=MAX()</button>
                        <button type="button" class="func-btn func-math">=MIN()</button>
                    </div>
                    <span class="section-label" style="margin-top: 8px;">Statistical</span>
                    <div class="compute-functions">
                        <button type="button" class="func-btn func-math">=SUMIF()</button>
                        <button type="button" class="func-btn func-math">=SUMIFS()</button>
                    </div>
                    <span class="section-label" style="margin-top: 8px;">Date</span>
                    <div class="compute-functions">
                        <!--<button type="button" class="func-btn func-date">=TODAY()</button> 
                        <button type="button" class="func-btn func-date">=NOW()</button>-->
                        <button type="button" class="func-btn func-date">=YEAR()</button>
                        <button type="button" class="func-btn func-date">=MONTH()</button>
                        <button type="button" class="func-btn func-date">=DAY()</button>
                        <button type="button" class="func-btn func-date">=WEEK()</button>
                        <button type="button" class="func-btn func-date">=DAYS()</button>
                        <button type="button" class="func-btn func-date">=DATEDIF()</button>
                    </div>
                </div>

                <div class="compute-actions">
                    <button id="removeCompute" class="btn-remove">Remove</button>
                    <button id="runCompute" class="btn-apply">Apply</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        // click column → auto insert sa formula (use variable name)
        const input = modal.querySelector('#computeFormula');

        // COLUMN BUTTONS
        modal.querySelectorAll('.col-btn').forEach(btn => {
            btn.onclick = () => {
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? input.value.length;

                // Use variable name instead of column name
                const colName = btn.dataset.colName;
                const variable = this.getColumnVariable(colName);

                const before = input.value.substring(0, start);
                const after = input.value.substring(end);

                // check kung nasa loob ng function (para comma instead of space)
                const insideFunc = /\w+\([^()]*$/.test(before);

                const insert = insideFunc
                    ? (before.endsWith('(') ? '' : ', ') + variable
                    : (before.trim() === '' ? '' : ' ') + variable;

                input.value = before + insert + after;

                const newPos = start + insert.length;
                input.selectionStart = input.selectionEnd = newPos;

                input.focus();
            };
        });

        // COLUMN COMPUTATION BUTTONS
        modal.querySelectorAll('.col-compute-btn').forEach(btn => {
            btn.onclick = () => {
                const start = input.selectionStart ?? input.value.length;
                const end = input.selectionEnd ?? input.value.length;

                const func = btn.dataset.func;
                const variable = btn.dataset.variable;
                const funcLabel = func.toUpperCase();
                const insertText = `COL${funcLabel}(${variable})`;

                const before = input.value.substring(0, start);
                const after = input.value.substring(end);

                const insideFunc = /\w+\([^()]*$/.test(before);
                const insert = insideFunc
                    ? (before.endsWith('(') ? '' : ', ') + insertText
                    : (before.trim() === '' ? '' : ' ') + insertText;

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

        // ENCODING CATEGORY BUTTONS
        modal.querySelectorAll('.encoding-category-btn').forEach(btn => {
            btn.onclick = () => {
                const templateId = btn.dataset.templateId;
                const templateName = btn.dataset.templateName;
                
                // Set the formula bar with the template name in apostrophe format
                const input = modal.querySelector('#computeFormula');
                if (input) {
                    input.value = `'${templateName}'`;
                    input.focus();
                }
                
                // Show information about the selected encoding category
                UI.showToast(`Set formula: '${templateName}'`, 'success');
                
                console.log(`Encoding category selected: ${templateName} (ID: ${templateId})`);
            };
        });

        // TOGGLE BUTTONS
        modal.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.onclick = () => {
                modal.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('toggle-active'));
                btn.classList.add('toggle-active');
            };
        });

        modal.querySelector('#closeComputeX').onclick = () => modal.remove();

        modal.querySelector('#removeCompute').onclick = () => {
            const currentFormula = this.getCurrentFormula();
            const columnName = this.state.currentColName;
            
            if (!currentFormula) {
                // No formula exists
                UI.showToast('No formula to remove', 'error');
                modal.remove();
                return;
            }
            
            // Check what types of formulas exist
            const hasColumnFormula = this.state.columnFormulas[columnName];
            const hasCellFormula = currentFormula && !hasColumnFormula;
            
            let mode;
            if (hasColumnFormula && hasCellFormula) {
                // Both exist - ask user which to remove
                const choice = confirm('Remove formula:\n\nClick OK to remove Whole Column formula\nClick Cancel to remove Single Cell formula');
                mode = choice ? 'column' : 'cell';
            } else if (hasColumnFormula) {
                // Only column formula exists
                mode = 'column';
            } else {
                // Only cell formula exists
                mode = 'cell';
            }
            
            this.removeFormula(mode);
            modal.remove();
        };

        modal.querySelector('#runCompute').onclick = () => {
            const formula = modal.querySelector('#computeFormula').value;
            const activeToggle = modal.querySelector('.toggle-btn.toggle-active');
            const mode = activeToggle ? activeToggle.dataset.mode : 'cell';

            // Convert formula from variables to column names for storage
            const convertedFormula = this.convertFormulaToColumnNames(formula);
            this.applyFormula(convertedFormula, mode);
            modal.remove();
        };
    },

    applyFormula: async function (formula, mode) {
        // Handle formula removal when formula is empty
        if (!formula || formula.trim() === '') {
            return this.removeFormula(mode);
        }

        if (!formula.startsWith('=')) {
            return UI.showToast('Formula must start with "="', 'error');
        }

        // Ensure variables are generated
        this.generateColumnVariables();
        
        const columnName = this.state.currentColName;
        if (!columnName) {
            return UI.showToast('No column selected', 'error');
        }

        // Check for formula conflicts
        if (mode === 'cell') {
            // Check if there's an existing column formula for this column
            if (this.state.columnFormulas[columnName]) {
                return UI.showToast('Cannot apply cell formula: This column already has a whole column formula applied. To update, you must use "Whole Column" mode or remove the existing column formula first.', 'error');
            }
        } else if (mode === 'column') {
            // Check if there are existing cell formulas for this column
            const existingCellFormulas = [];
            Object.keys(this.state.cellFormulas).forEach(key => {
                const [entryId, colName] = key.split('|');
                if (colName === columnName) {
                    existingCellFormulas.push({ entryId, formula: this.state.cellFormulas[key] });
                }
            });

            if (existingCellFormulas.length > 0) {
                const confirmReplace = confirm(`Found ${existingCellFormulas.length} cell formula(s) in this column that will be replaced:\n\n${existingCellFormulas.slice(0, 3).map(f => `Row ${f.entryId.substring(0, 8)}: ${f.formula}`).join('\n')}${existingCellFormulas.length > 3 ? '\n...' : ''}\n\nDo you want to replace these cell formulas with the new column formula?`);
                if (!confirmReplace) {
                    return; // User cancelled
                }
                // Remove all existing cell formulas for this column
                await this.removeAllCellFormulasForColumn(columnName);
            }
        }
        
        const expr = formula.slice(1);
        const columns = this.state.currentTemplate?.columns || [];

        // Pre-fetch encoding data for SUMIFS before synchronous evaluation
        await this.prefetchSUMIFSDataForFormula(formula);

        const computeRow = (entry) => {
            let evalExpr = expr;

            // Helper: parse date from column name or value
            const parseDate = (arg) => {
                const clean = arg.trim();
                if (!isNaN(clean)) return new Date(clean);
                
                // Check if it's a variable
                let colNameToUse = clean;
                if (this.state.variableColumns && this.state.variableColumns[clean]) {
                    colNameToUse = this.state.variableColumns[clean];
                }
                
                const raw = entry.values[colNameToUse];
                if (raw) {
                    // Handle DD/MM/YYYY format
                    if (raw.includes('/')) {
                        const parts = raw.split('/');
                        if (parts.length === 3) {
                            const [day, month, year] = parts.map(p => parseInt(p, 10));
                            return new Date(year, month - 1, day);
                        }
                    }
                    // Handle MM/DD/YYYY format (try both)
                    if (raw.includes('-')) {
                        const parts = raw.split('-');
                        if (parts.length === 3) {
                            const [year, month, day] = parts.map(p => parseInt(p, 10));
                            return new Date(year, month - 1, day);
                        }
                    }
                    return new Date(raw);
                }
                return new Date(clean);
            };

            // Process date functions FIRST (before column name replacement)
            evalExpr = evalExpr.replace(/TODAY\(\)/gi, () => {
                const today = new Date();
                return today.toISOString().split('T')[0];
            });

            evalExpr = evalExpr.replace(/NOW\(\)/gi, () => {
                return new Date().toISOString();
            });

            evalExpr = evalExpr.replace(/YEAR\((.*?)\)/gi, (_, args) => {
                const date = parseDate(args);
                return date.getFullYear();
            });

            evalExpr = evalExpr.replace(/MONTH\((.*?)\)/gi, (_, args) => {
                const date = parseDate(args);
                return date.getMonth() + 1;
            });

            evalExpr = evalExpr.replace(/DAY\((.*?)\)/gi, (_, args) => {
                const date = parseDate(args);
                return date.getDate();
            });

            evalExpr = evalExpr.replace(/WEEK\((.*?)\)/gi, (_, args) => {
                // Check if the column is date type
                const clean = args.trim();
                let colNameToUse = clean;
                if (this.state.variableColumns && this.state.variableColumns[clean]) {
                    colNameToUse = this.state.variableColumns[clean];
                }
                
                // Find the column definition
                const columnDef = columns.find(c => c.encoding_columns.column_name === colNameToUse);
                if (columnDef && columnDef.encoding_columns.column_type !== 'date') {
                    throw new Error(`WEEK function can only be used with date columns. Column '${colNameToUse}' is of type '${columnDef.encoding_columns.column_type}'.`);
                }
                
                const date = parseDate(args);
                // Calculate ISO week number (weeks start on Monday)
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                // Thursday in current week decides the year.
                d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
                // January 4 is always in week 1.
                const week1 = new Date(d.getFullYear(), 0, 4);
                // Adjust to Thursday in week 1 and count number of weeks from date to week1.
                return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
            });

            evalExpr = evalExpr.replace(/WEEKDAY\((.*?)\)/gi, (_, args) => {
                const date = parseDate(args);
                return date.getDay();
            });

            evalExpr = evalExpr.replace(/DAYS\((.*?)\)/gi, (_, args) => {
                const [end, start] = args.split(',').map(a => parseDate(a));
                const diffTime = end - start;
                return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            });

            evalExpr = evalExpr.replace(/DATEDIF\((.*?)\)/gi, (_, args) => {
                const parts = args.split(',').map(a => a.trim());
                const start = parts[0];
                const end = parts[1];
                const unit = parts[2] || 'D'; // Default to days if unit not provided
                
                const startDate = parseDate(start);
                const endDate = parseDate(end);
                const diffTime = endDate - startDate;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                switch(unit.toUpperCase()) {
                    case 'D': return diffDays;
                    case 'M': return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
                    case 'Y': return endDate.getFullYear() - startDate.getFullYear();
                    default: return diffDays;
                }
            });

            // Helper: convert argument → number for aggregate functions
            const getVal = (arg, entry) => {
                const clean = arg.trim();

                // if number literal
                if (!isNaN(clean)) return parseFloat(clean);

                // if column name or variable
                let colNameToUse = clean;
                // Check if it's a variable
                if (this.state.variableColumns && this.state.variableColumns[clean]) {
                    colNameToUse = this.state.variableColumns[clean];
                }
                
                const raw = entry.values[colNameToUse] ?? '0';
                return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
            };

            // Process aggregate functions - ONLY if they are explicitly called
            // Use word boundary to ensure we don't match inside other words
            evalExpr = evalExpr.replace(/\bAVERAGE\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
            });

            evalExpr = evalExpr.replace(/\bSUM\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return vals.reduce((a,b)=>a+b,0);
            });

            evalExpr = evalExpr.replace(/\bCOUNT\((.*?)\)/gi, (_, args) => {
                return args.split(',').length;
            });

            evalExpr = evalExpr.replace(/\bMAX\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return Math.max(...vals);
            });

            evalExpr = evalExpr.replace(/\bMIN\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return Math.min(...vals);
            });

            // Column-level aggregate functions (computed over ALL entries)
            const computeColumnAggregate = (arg, func) => {
                let actualColName = arg.trim();
                if (this.state.variableColumns && this.state.variableColumns[actualColName]) {
                    actualColName = this.state.variableColumns[actualColName];
                }
                const values = this.state.localEntries.map(e => {
                    const raw = e.values?.[actualColName] ?? '';
                    return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
                });
                switch(func.toLowerCase()) {
                    case 'sum': return values.reduce((a,b)=>a+b,0);
                    case 'avg':
                    case 'average': return values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
                    case 'max': return values.length ? Math.max(...values) : 0;
                    case 'min': return values.length ? Math.min(...values) : 0;
                    case 'count': return values.length;
                    default: return 0;
                }
            };

            evalExpr = evalExpr.replace(/\bCOLSUM\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'sum'));
            evalExpr = evalExpr.replace(/\bCOLAVG\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'avg'));
            evalExpr = evalExpr.replace(/\bCOLAVERAGE\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'average'));
            evalExpr = evalExpr.replace(/\bCOLMAX\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'max'));
            evalExpr = evalExpr.replace(/\bCOLMIN\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'min'));
            evalExpr = evalExpr.replace(/\bCOLCOUNT\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'count'));

            // SUMIFS with ! notation and legacy syntax — evaluated from cache
            let idx = evalExpr.indexOf('SUMIFS(');
            while (idx !== -1) {
                let depth = 1;
                let endIdx = idx + 7;
                while (endIdx < evalExpr.length && depth > 0) {
                    const c = evalExpr[endIdx];
                    if (c === '(') depth++;
                    else if (c === ')') depth--;
                    endIdx++;
                }
                const argsStr = evalExpr.substring(idx + 7, endIdx - 1);
                const result = this.evaluateSUMIFSUnifiedSync(argsStr, this.state.localEntries);
                evalExpr = evalExpr.substring(0, idx) + String(result) + evalExpr.substring(endIdx);
                idx = evalExpr.indexOf('SUMIFS(');
            }

            // Convert column names to variables for evaluation
            columns.forEach(c => {
                const colName = c.encoding_columns.column_name;
                const variable = this.getColumnVariable(colName);
                const raw = entry.values[colName] ?? '0';
                const colType = c.encoding_columns.column_type;

                let num;
                // Handle date columns differently - convert to days for arithmetic
                if (colType === 'date' && raw) {
                    // Convert raw to string to handle different data types
                    const rawString = String(raw);
                    // Parse date - handle DD/MM/YYYY format
                    let date;
                    if (rawString.includes('/')) {
                        const parts = rawString.split('/');
                        if (parts.length === 3) {
                            // Assume DD/MM/YYYY format
                            const [day, month, year] = parts.map(p => parseInt(p, 10));
                            date = new Date(year, month - 1, day);
                        } else {
                            date = new Date(rawString);
                        }
                    } else {
                        date = new Date(rawString);
                    }
                    
                    if (!isNaN(date.getTime())) {
                        num = date.getTime() / (1000 * 60 * 60 * 24); // Convert to days
                    } else {
                        num = 0;
                    }
                } else {
                    // convert text → number
                    num = parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
                }

                const safeCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${safeCol}\\b`, 'g');

                evalExpr = evalExpr.replace(regex, num);
            });

            try {
                const result = eval(evalExpr);
                
                // Check if target column is date type and format accordingly
                const targetColDef = columns.find(c => c.encoding_columns.column_name === this.state.currentColName);
                if (targetColDef && targetColDef.encoding_columns.column_type === 'date') {
                    // If result is a number (Excel serial), convert to date
                    if (typeof result === 'number' && !isNaN(result)) {
                        const dateResult = new Date(result * (1000 * 60 * 60 * 24));
                        if (!isNaN(dateResult.getTime())) {
                            // Format as MM/DD/YYYY for date display
                            const month = String(dateResult.getMonth() + 1).padStart(2, '0');
                            const day = String(dateResult.getDate()).padStart(2, '0');
                            const year = dateResult.getFullYear();
                            return `${month}/${day}/${year}`;
                        }
                    }
                    // If result is already a date string, return as is
                    return String(result);
                }
                
                return this.formatNumber(result); // For non-date columns
            } catch {
                return 'ERR';
            }
        };

        // SINGLE CELL
        if (mode === 'cell') {
            const td = this.state.currentCell;
            if (!td) return UI.showToast('No cell selected', 'error');

            const row = td.closest('tr');
            const entryId = row.dataset.entryId;

            console.log('Saving single cell formula for entryId:', entryId, 'column:', this.state.currentColName);

            const entry = this.state.localEntries.find(e => e.id === entryId);
            if (!entry) return;

            let result;
            try {
                result = computeRow(entry);
            } catch (error) {
                return UI.showToast(error.message, 'error');
            }

            td.textContent = result;
            entry.values[this.state.currentColName] = result;

            // 🔄 AUTO-UPDATE: Store the formula for auto-recalculation
            const formulaKey = `${entryId}|${this.state.currentColName}`;
            console.log('Storing cell formula with key:', formulaKey);
            this.state.cellFormulas[formulaKey] = formula;
            
            // Invalidate COL compute cache since formulas changed
            this.invalidateColComputeCache();

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
                    
                    // Re-render headers only to update formula indicator immediately
                    this.renderHeaders();
                } catch (err) {
                    console.error('Failed to save cell formula:', err);
                }
            }

            if (colDef) {
                // For date columns, ensure proper date format for database storage
                let dbValue = result;
                if (colDef.column_type === 'date' && typeof result === 'string') {
                    // Convert MM/DD/YYYY to YYYY-MM-DD for database storage
                    if (result.includes('/')) {
                        const parts = result.split('/');
                        if (parts.length === 3) {
                            const [month, day, year] = parts.map(p => parseInt(p, 10));
                            dbValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        }
                    }
                }
                
                let detail = entry.valueDetails.find(v => v.column_id === colDef.id);
                if (detail) detail.value = dbValue;
                else entry.valueDetails.push({ column_id: colDef.id, value: dbValue });

                const payload = {};
                payload[colDef.id] = dbValue;

                await this.saveEntryField(entry.id, payload);
                
                // Force clear all formula cache to ensure complete synchronization
                await this.forceClearFormulaCache();
            }
        }

        // WHOLE COLUMN (PER ROW COMPUTATION)
        if (mode === 'column') {
            // Store the formula for auto-recalculation on each row
            this.state.columnFormulas[this.state.currentColName] = formula;

            const colDef = columns.find(c => c.encoding_columns.column_name === this.state.currentColName)?.encoding_columns;

            // Show loading indicator
            UI.showToast('Computing values...', 'info');
            // OPTIMIZATION: Compute all values first and update UI immediately
            let computedResults;
            try {
                computedResults = this.state.localEntries.map(entry => {
                    const result = computeRow(entry);
                    entry.values[this.state.currentColName] = result;
                
                // Update valueDetails immediately for UI display
                if (!entry.valueDetails) entry.valueDetails = [];
                entry.valueDetails = entry.valueDetails.filter(v => v.column_id !== colDef.id);
                if (result !== '' && result !== null && result !== undefined) {
                    // For date columns, ensure proper date format for database storage
                    let displayValue = result;
                    if (colDef.column_type === 'date' && typeof result === 'string') {
                        // Convert MM/DD/YYYY to YYYY-MM-DD for database storage
                        if (result.includes('/')) {
                            const parts = result.split('/');
                            if (parts.length === 3) {
                                const [month, day, year] = parts.map(p => parseInt(p, 10));
                                displayValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                            }
                        }
                    }
                    entry.valueDetails.push({
                        column_id: colDef.id,
                        value: displayValue
                    });
                }
                
                return { entry, result };
            });
            } catch (error) {
                return UI.showToast(error.message, 'error');
            }

            // Update table UI immediately
            this.renderTable(this.state.localEntries);

            // Then batch save to database in background
            const batchSize = 50; // Process 50 entries at a time
            for (let i = 0; i < computedResults.length; i += batchSize) {
                const batch = computedResults.slice(i, i + batchSize);
                const batchPromises = batch.map(({ entry, result }) => {
                    if (colDef && result !== '' && result !== null && result !== undefined) {
                        // For date columns, ensure proper date format for database storage
                        let dbValue = result;
                        if (colDef.column_type === 'date' && typeof result === 'string') {
                            // Convert MM/DD/YYYY to YYYY-MM-DD for database storage
                            if (result.includes('/')) {
                                const parts = result.split('/');
                                if (parts.length === 3) {
                                    const [month, day, year] = parts.map(p => parseInt(p, 10));
                                    dbValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                }
                            }
                        }
                        
                        // Update valueDetails
                        let detail = entry.valueDetails.find(v => v.column_id === colDef.id);
                        if (detail) detail.value = dbValue;
                        else entry.valueDetails.push({ column_id: colDef.id, value: dbValue });

                        const payload = {};
                        payload[colDef.id] = dbValue;
                        return this.saveEntryField(entry.id, payload);
                    }
                    return Promise.resolve();
                });
                await Promise.all(batchPromises);
            }

            // Save formula to database after all values are updated
            if (colDef) {
                try {
                    await SupabaseService.saveColumnFormula(
                        this.state.currentTemplate.id,
                        colDef.id,
                        formula
                    );

                    // Store in state immediately for instant indicator update
                    this.state.columnFormulas[this.state.currentColName] = formula;

                    // Rebuild dependency graph when formulas change
                    this.buildFormulaDependencyGraph();

                    // Re-render headers and entry form to show computed column indicators
                    this.renderHeaders();
                    this.renderAll();
                } catch (err) {
                    console.error('Failed to save column formula:', err);
                }
            }

            UI.showToast('Computed! Auto-update is now active for this formula.');
            
            // Reset compute flag
            this.state.isComputing = false;
        }
    },

    removeFormula: async function (mode) {
        const td = this.state.currentCell;
        if (!td) return UI.showToast('No cell selected', 'error');

        const row = td.closest('tr');
        const entryId = row?.dataset.entryId;
        const columnName = this.state.currentColName;
        const columns = this.state.currentTemplate?.columns || [];
        const colDef = columns.find(c => c.encoding_columns.column_name === columnName)?.encoding_columns;

        if (!entryId || !columnName || !colDef) {
            return UI.showToast('Invalid selection', 'error');
        }

        // Check for formula conflicts when removing
        if (mode === 'cell') {
            // Check if there's an existing column formula for this column
            if (this.state.columnFormulas[columnName]) {
                return UI.showToast('Cannot remove cell formula: This column has a whole column formula applied. To remove formulas, you must use "Whole Column" mode to remove the column formula.', 'error');
            }
        }

        try {
            if (mode === 'cell') {
                // Remove cell-specific formula
                const formulaKey = `${entryId}|${columnName}`;
                const brokenFormulaKey = `undefined|${columnName}`;
                console.log('Removing cell formula:', formulaKey);
                
                // Remove from memory first (including broken formulas)
                delete this.state.cellFormulas[formulaKey];
                delete this.state.cellFormulas[brokenFormulaKey];

                // Clear the cell value and reset to original
                const entry = this.state.localEntries.find(e => e.id === entryId);
                if (entry) {
                    // Remove the computed value
                    console.log('Clearing cell value for:', columnName);
                    if (entry.values) {
                        delete entry.values[columnName];
                    }
                    td.textContent = '';

                    // Update valueDetails - remove all entries for this column
                    if (entry.valueDetails) {
                        entry.valueDetails = entry.valueDetails.filter(v => v.column_id !== colDef.id);
                    }

                    // Save empty value to database
                    const payload = {};
                    payload[colDef.id] = null; // Use null instead of empty string
                    await this.saveEntryField(entry.id, payload);
                }

                // Remove from database last
                await SupabaseService.deleteCellFormula(
                    this.state.currentTemplate.id,
                    entryId,
                    colDef.id
                );
                
                // Invalidate COL compute cache since formulas changed
                this.invalidateColComputeCache();

                // Re-render headers only to update formula indicator immediately
                this.renderHeaders();

                UI.showToast('Cell formula removed');
            } else if (mode === 'column') {
                // Remove column formula
                console.log('Removing column formula for:', columnName);
                
                // Remove from memory first
                delete this.state.columnFormulas[columnName];

                // Clear all cells in the column and reset values
                const updatePromises = this.state.localEntries.map(async (entry) => {
                    console.log('Clearing column value for entry:', entry.id, columnName);
                    
                    // Remove computed value
                    if (entry.values) {
                        delete entry.values[columnName];
                    }

                    // Update valueDetails - remove all entries for this column
                    if (entry.valueDetails) {
                        entry.valueDetails = entry.valueDetails.filter(v => v.column_id !== colDef.id);
                    }

                    // Save empty value to database
                    const payload = {};
                    payload[colDef.id] = null; // Use null instead of empty string
                    await this.saveEntryField(entry.id, payload);
                });

                // Wait for all database updates to complete
                await Promise.all(updatePromises);

                // Remove from database
                await SupabaseService.deleteColumnFormula(
                    this.state.currentTemplate.id,
                    colDef.id
                );

                // Re-render headers and entry form to update computed column indicators
                this.renderHeaders();
                this.renderAll();

                // Re-render table to show cleared values
                this.renderTable(this.state.localEntries);

                UI.showToast('Column formula removed');
            }
        } catch (err) {
            console.error('Failed to remove formula:', err);
            UI.showToast('Failed to remove formula: ' + err.message, 'error');
        }
    },

    forceClearFormulaCache: async function () {
        // Clear all formula-related cache and state
        this.clearCache(this.state.currentTemplate.id);
        
        // Clear formula memory to prevent old formulas from persisting
        this.state.cellFormulas = {};
        this.state.columnFormulas = {};
        
        // Reset column visibility when switching templates
        this.resetColumnVisibility();
        
        // Force reload entries from database to get fresh data
        await this.loadEntries(this.state.currentTemplate.id);
        
        // Force reload formulas from database
        await this.loadSavedFormulas();
        
        // Re-render table to ensure UI consistency
        this.renderTable(this.state.localEntries);
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
        this.state.activeColumnComputes[columnName] = {
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
        // Use the new function that handles all computations
        this.updateAllColumnComputations();
    },

    renderColumnFooter: function (columnName, func, result, position) {
        const table = document.getElementById('tableData');
        if (!table) return;

        // Remove only this specific column's footer (if exists)
        const old = table.querySelector(`.column-footer[data-column="${columnName}"]`);
        if (old) old.remove();

        const cols = this.state.currentTemplate.columns;

        // hanapin index ng target column
        const colIndex = cols.findIndex(
            c => c.encoding_columns.column_name === columnName
        );

        const tr = document.createElement('tr');
        tr.className = 'column-footer';
        tr.dataset.column = columnName; // Add data attribute to identify this column's footer

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

            // Clear previous computations
            this.state.activeColumnComputes = {};
            this.state.activeColumnCompute = null;

            // Remove any existing column footers from the table
            const table = document.getElementById('tableData');
            if (table) {
                table.querySelectorAll('.column-footer').forEach(el => el.remove());
            }

            if (computations.length === 0) {
                return; // No computations to load
            }

            // Process all computations
            computations.forEach(comp => {
                const colDef = columns.find(c => c.encoding_columns.id === comp.column_id);
                if (colDef) {
                    const columnName = colDef.encoding_columns.column_name;
                    this.state.activeColumnComputes[columnName] = {
                        func: comp.function_type,
                        position: comp.display_position || 'bottom'
                    };
                }
            });

            // Set the first one as the "active" one for UI purposes (delete button, etc.)
            const firstComp = computations[0];
            const firstColDef = columns.find(c => c.encoding_columns.id === firstComp.column_id);
            if (firstColDef) {
                this.state.activeColumnCompute = {
                    column: firstColDef.encoding_columns.column_name,
                    func: firstComp.function_type,
                    position: firstComp.display_position || 'bottom'
                };
            }

            // Render all column computations
            this.updateAllColumnComputations();

        } catch (err) {
            console.error('Failed to load column computations:', err);
        }
    },

    /**
     * Update and render ALL active column computations
     */
    updateAllColumnComputations: function () {
        const table = document.getElementById('tableData');
        if (!table) return;

        // Remove all existing column footers
        table.querySelectorAll('.column-footer').forEach(el => el.remove());

        // Render each column computation
        Object.entries(this.state.activeColumnComputes || {}).forEach(([columnName, config]) => {
            const values = this.state.localEntries.map(entry => {
                const raw = entry.values?.[columnName] ?? '';
                return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
            });

            let result = 0;
            switch (config.func) {
                case 'sum':
                    result = values.reduce((a,b)=>a+b,0);
                    break;
                case 'average':
                    result = values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
                    break;
                case 'max':
                    result = values.length ? Math.max(...values) : 0;
                    break;
                case 'min':
                    result = values.length ? Math.min(...values) : 0;
                    break;
                case 'count':
                    result = values.length;
                    break;
            }

            result = this.formatNumber(result);
            this.renderColumnFooter(columnName, config.func, result, config.position);
        });
    },

    loadSavedFormulas: async function () {
        if (!this.state.currentTemplate || !this.state.currentTemplate.id) return;

        try {
            console.log('Loading saved formulas...');
            const formulas = await SupabaseService.getFormulas(this.state.currentTemplate.id);
            const columns = this.state.currentTemplate.columns || [];

            let loadedCount = 0;
            let skippedCount = 0;

            formulas.forEach(formula => {
                const colDef = columns.find(c => c.encoding_columns.id === formula.column_id);
                if (!colDef) return;

                const columnName = colDef.encoding_columns.column_name;

                if (formula.formula_type === 'cell' && formula.entry_id) {
                    // Cell formula: for a specific entry
                    const formulaKey = `${formula.entry_id}|${columnName}`;
                    this.state.cellFormulas[formulaKey] = formula.formula;
                    loadedCount++;
                } else if (formula.formula_type === 'column') {
                    // Column formula: for all rows in a column
                    this.state.columnFormulas[columnName] = formula.formula;
                    loadedCount++;
                } else if (formula.formula_type === 'cell' && !formula.entry_id) {
                    // Cell formula with no entry_id - skip it (broken formula)
                    console.log('Skipping broken cell formula without entry_id for:', columnName);
                    skippedCount++;
                }
            });

            console.log(`Loaded ${loadedCount} formulas, skipped ${skippedCount} broken formulas`);
            console.log('Column formulas:', Object.keys(this.state.columnFormulas));
            console.log('Cell formulas:', Object.keys(this.state.cellFormulas));
            
            // Invalidate cache since formulas changed
            this.invalidateColComputeCache();
            
            // Build dependency graph for optimized recalculation
            this.buildFormulaDependencyGraph();

            // Pre-fetch encoding data for any SUMIFS references
            for (const formula of Object.values(this.state.columnFormulas || {})) {
                await this.prefetchSUMIFSDataForFormula(formula);
            }
            for (const formula of Object.values(this.state.cellFormulas || {})) {
                await this.prefetchSUMIFSDataForFormula(formula);
            }

            // Skip automatic formula recalculation on initial load for performance
            // Formulas will be recalculated when user edits data
            console.log('Skipping automatic formula recalculation for performance');
        } catch (err) {
            console.error('Failed to load saved formulas:', err);
        }
    },

    applyLoadedFormulas: async function () {
        const columns = this.state.currentTemplate?.columns || [];

        // Apply column formulas to all entries (optimized batch approach)
        for (const [columnName, formula] of Object.entries(this.state.columnFormulas || {})) {
            const colDef = columns.find(c => c.encoding_columns.column_name === columnName);
            if (!colDef) continue;

            // Pre-fetch encoding data for SUMIFS before synchronous evaluation
            await this.prefetchSUMIFSDataForFormula(formula);

            // Compute all values first and update UI immediately
            const computedResults = this.state.localEntries.map(entry => {
                const result = this.computeFormulaForEntry(entry, formula, columns);
                entry.values[columnName] = result;
                return { entry, result };
            });

            // Update table UI immediately
            this.renderTable(this.state.localEntries);

            // Then batch save to database in background
            const batchSize = 50;
            for (let i = 0; i < computedResults.length; i += batchSize) {
                const batch = computedResults.slice(i, i + batchSize);
                const batchPromises = batch.map(({ entry, result }) => {
                    // Update valueDetails
                    let detail = entry.valueDetails.find(v => v.column_id === colDef.id);
                    if (detail) detail.value = String(result);
                    else entry.valueDetails.push({ column_id: colDef.id, value: String(result) });

                    const payload = {};
                    payload[colDef.id] = result;
                    return this.saveEntryField(entry.id, payload);
                });
                await Promise.all(batchPromises);
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

    /**
     * Helper function to evaluate criteria for SUMIF
     */
    evaluateCriteria: function(value, criteria) {
        const numValue = parseFloat(String(value).replace(/[^\d.-]/g, '')) || 0;
        const strValue = String(value).trim();
        
        // Numeric comparisons
        if (criteria.startsWith('>=')) {
            const threshold = parseFloat(criteria.substring(2).trim()) || 0;
            return numValue >= threshold;
        }
        if (criteria.startsWith('<=')) {
            const threshold = parseFloat(criteria.substring(2).trim()) || 0;
            return numValue <= threshold;
        }
        if (criteria.startsWith('<>')) {
            const threshold = parseFloat(criteria.substring(2).trim()) || 0;
            return numValue !== threshold;
        }
        if (criteria.startsWith('>')) {
            const threshold = parseFloat(criteria.substring(1).trim()) || 0;
            return numValue > threshold;
        }
        if (criteria.startsWith('<')) {
            const threshold = parseFloat(criteria.substring(1).trim()) || 0;
            return numValue < threshold;
        }
        if (criteria.startsWith('=')) {
            const threshold = parseFloat(criteria.substring(1).trim()) || 0;
            return numValue === threshold;
        }
        
        // Wildcard text matching
        if (criteria.includes('*')) {
            const regexPattern = criteria.replace(/\*/g, '.*').replace(/\?/g, '.');
            const regex = new RegExp('^' + regexPattern + '$', 'i');
            return regex.test(strValue);
        }
        
        // Exact text match
        return strValue.toLowerCase() === criteria.toLowerCase();
    },

    /**
     * Parse function arguments respecting single/double quotes
     * Handles sheet references like 'Sheet Name'!'Column Name'
     */
    parseQuotedArgs: function(argsStr) {
        const args = [];
        let current = '';
        let inQuotes = false;
        let quoteChar = null;

        for (let i = 0; i < argsStr.length; i++) {
            const char = argsStr[i];

            if (!inQuotes && (char === '"' || char === "'")) {
                inQuotes = true;
                quoteChar = char;
                current += char;
            } else if (inQuotes && char === quoteChar) {
                current += char;
                inQuotes = false;
                quoteChar = null;
            } else if (!inQuotes && char === ',') {
                args.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }
        if (current.trim()) args.push(current.trim());
        return args;
    },

    /**
     * Parse sheet reference like 'Sheet Name'!'Column Name'
     */
    parseSheetRef: function(arg) {
        const match = arg.match(/^["']([^"']+)["']\s*!\s*["']([^"']+)["']$/);
        if (match) {
            return { sheet: match[1], column: match[2] };
        }
        return null;
    },

    /**
     * Remove surrounding quotes from a string
     */
    unquote: function(str) {
        return str.replace(/^["']|["']$/g, '');
    },

    /**
     * Get encoding template data from cache or database
     */
    getEncodingDataFromCache: async function(templateName) {
        const normalizedName = templateName.trim().toLowerCase();

        if (this.state.encodingDataCache[normalizedName]) {
            return this.state.encodingDataCache[normalizedName];
        }

        const cacheKey = `encoding_data_${normalizedName}`;
        if (this.state.cache[cacheKey]) {
            this.state.encodingDataCache[normalizedName] = this.state.cache[cacheKey];
            return this.state.cache[cacheKey];
        }

        let template = this.state.allTemplates.find(t =>
            t.name && t.name.toLowerCase() === normalizedName
        );

        if (!template) {
            // Fallback: search directly from database
            console.warn(`Template not in allTemplates, searching DB for: ${templateName}`);
            const { data: templates } = await SupabaseService.client
                .from('encoding_templates')
                .select('id, template_name')
                .eq('department_id', this.state.departmentId)
                .ilike('template_name', templateName);
            template = templates && templates[0];
        }

        if (!template) {
            console.warn(`Template not found for SUMIFS: ${templateName}`);
            return [];
        }

        console.log(`Fetching encoding data for SUMIFS: ${templateName} (ID: ${template.id})`);
        const entries = await SupabaseService.getAllEntries(template.id);
        this.state.encodingDataCache[normalizedName] = entries;
        this.state.cache[cacheKey] = entries;
        return entries;
    },

    /**
     * Invalidate encoding data cache for a template
     */
    invalidateEncodingCache: function(templateName) {
        const normalizedName = templateName.trim().toLowerCase();
        delete this.state.encodingDataCache[normalizedName];
        delete this.state.cache[`encoding_data_${normalizedName}`];
        console.log(`Invalidated encoding cache for: ${templateName}`);
    },

    /**
     * Pre-fetch encoding data for all SUMIFS references in a formula
     */
    prefetchSUMIFSDataForFormula: async function(formula) {
        if (!formula || !formula.includes('SUMIFS')) return;

        const sheetNames = new Set();

        const matches = formula.match(/SUMIFS\s*\(([\s\S]*?)\)/gi) || [];
        for (const match of matches) {
            const argsStr = match.replace(/SUMIFS\s*\(/i, '').replace(/\)\s*$/, '');
            const args = this.parseQuotedArgs(argsStr);
            if (args.length < 3) continue;

            const firstRef = this.parseSheetRef(args[0]);
            if (firstRef) {
                sheetNames.add(firstRef.sheet);
            } else {
                sheetNames.add(this.unquote(args[0]));
            }
        }

        for (const sheetName of sheetNames) {
            await this.getEncodingDataFromCache(sheetName);
        }
    },

    /**
     * Evaluate SUMIFS synchronously from cache.
     * Supports both ! notation ('Sheet'!'Column') and legacy syntax.
     */
    evaluateSUMIFSUnifiedSync: function(argsStr, currentEntries) {
        const args = this.parseQuotedArgs(argsStr);
        
        console.log('🔍 SUMIFS args parsed:', args);
        if (args.length < 3 || args.length % 2 === 0) return 0;

        const firstRef = this.parseSheetRef(args[0]);
        let sumRange, conditions;

        if (firstRef) {
            sumRange = firstRef;
            conditions = [];
            for (let i = 1; i < args.length; i += 2) {
                const rangeRef = this.parseSheetRef(args[i]);
                const criteriaVal = this.unquote(args[i + 1] || '');
                if (rangeRef) {
                    conditions.push({ range: rangeRef, criteria: criteriaVal });
                } else {
                    conditions.push({
                        range: { sheet: sumRange.sheet, column: this.unquote(args[i]) },
                        criteria: criteriaVal
                    });
                }
            }
        } else {
            const sheetName = this.unquote(args[0]);
            const sumColumn = this.unquote(args[1]);
            sumRange = { sheet: sheetName, column: sumColumn };
            conditions = [];
            for (let i = 2; i < args.length; i += 2) {
                conditions.push({
                    range: { sheet: sheetName, column: this.unquote(args[i]) },
                    criteria: this.unquote(args[i + 1] || '')
                });
            }
        }

        console.log('📊 Sum range:', sumRange);
        console.log('📋 Conditions:', conditions);

        const normalizedName = (sumRange.sheet || '').trim().toLowerCase();
        const entries = normalizedName
            ? (this.state.encodingDataCache[normalizedName] || [])
            : (currentEntries || this.state.localEntries);

        console.log(`📈 Found ${entries.length} entries for sheet '${sumRange.sheet}'`);
        console.log('💾 Cached sheets:', Object.keys(this.state.encodingDataCache));

        if (!entries.length) {
            console.warn(`SUMIFS cache miss for sheet: ${sumRange.sheet}`);
            return 0;
        }

        let sum = 0;
        for (const entry of entries) {
            let allMatch = true;
            for (const condition of conditions) {
                const value = entry.values[condition.range.column];
                if (!this.evaluateCriteria(value, condition.criteria)) {
                    allMatch = false;
                    break;
                }
            }
            if (allMatch) {
                const raw = entry.values[sumRange.column] ?? '0';
                sum += parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
            }
        }
        return sum;
    },

    computeFormulaForEntry: function (entry, formula, columns) {
        let evalExpr = formula.startsWith('=') ? formula.slice(1) : formula;

        // console.log('🔧 Processing formula:', formula);
        // console.log('🔧 Cleaned expression:', evalExpr);

        // Track if formula involves date columns for result formatting
        let involvesDateColumn = false;

        // Helper: parse date from column name or value
        const parseDate = (arg) => {
            const clean = arg.trim();
            if (!isNaN(clean)) return new Date(clean);
            
            // Check if it's a variable name and convert to column name
            let colNameToUse = clean;
            if (this.state.variableColumns && this.state.variableColumns[clean]) {
                colNameToUse = this.state.variableColumns[clean];
            }
            
            const raw = entry.values[colNameToUse];
            if (raw) {
                // Handle DD/MM/YYYY format
                if (raw.includes('/')) {
                    const parts = raw.split('/');
                    if (parts.length === 3) {
                        const [day, month, year] = parts.map(p => parseInt(p, 10));
                        return new Date(year, month - 1, day);
                    }
                }
                // Handle YYYY-MM-DD format
                if (raw.includes('-')) {
                    const parts = raw.split('-');
                    if (parts.length === 3) {
                        const [year, month, day] = parts.map(p => parseInt(p, 10));
                        return new Date(year, month - 1, day);
                    }
                }
                return new Date(raw);
            }
            return new Date(clean);
        };

        // Helper: check if a column contains a date
        const isDateColumn = (colName) => {
            let colNameToUse = colName.trim();
            if (this.state.variableColumns && this.state.variableColumns[colNameToUse]) {
                colNameToUse = this.state.variableColumns[colNameToUse];
            }
            
            const column = columns.find(c => c.encoding_columns.column_name === colNameToUse);
            return column && column.encoding_columns.column_type === 'date';
        };

        // Helper: get date value from column
        const getDateValue = (colName) => {
            let colNameToUse = colName.trim();
            if (this.state.variableColumns && this.state.variableColumns[colNameToUse]) {
                colNameToUse = this.state.variableColumns[colNameToUse];
            }
            
            const raw = entry.values[colNameToUse];
            if (!raw) return null;
            
            // Handle DD/MM/YYYY format
            if (raw.includes('/')) {
                const parts = raw.split('/');
                if (parts.length === 3) {
                    const [day, month, year] = parts.map(p => parseInt(p, 10));
                    return new Date(year, month - 1, day);
                }
            }
            // Handle YYYY-MM-DD format
            if (raw.includes('-')) {
                const parts = raw.split('-');
                if (parts.length === 3) {
                    const [year, month, day] = parts.map(p => parseInt(p, 10));
                    return new Date(year, month - 1, day);
                }
            }
            return new Date(raw);
        };

        // Helper: get numeric value from column
        const getNumericValue = (colName) => {
            let colNameToUse = colName.trim();
            if (this.state.variableColumns && this.state.variableColumns[colNameToUse]) {
                colNameToUse = this.state.variableColumns[colNameToUse];
            }
            
            const raw = entry.values[colNameToUse] ?? '0';
            return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
        };

        // SUMIFS with ! notation and legacy syntax — evaluated from cache
        let idx = evalExpr.indexOf('SUMIFS(');
        while (idx !== -1) {
            let depth = 1;
            let endIdx = idx + 7;
            while (endIdx < evalExpr.length && depth > 0) {
                const c = evalExpr[endIdx];
                if (c === '(') depth++;
                else if (c === ')') depth--;
                endIdx++;
            }
            const argsStr = evalExpr.substring(idx + 7, endIdx - 1);
            const result = this.evaluateSUMIFSUnifiedSync(argsStr, this.state.localEntries);
            evalExpr = evalExpr.substring(0, idx) + String(result) + evalExpr.substring(endIdx);
            idx = evalExpr.indexOf('SUMIFS(');
        }

        // Process date operations: A+B, A-B, B+A, B-A where A and/or B are dates
        console.log('🔍 Looking for date operations in:', evalExpr);
        evalExpr = evalExpr.replace(/\b([A-Z]+)\s*[+\-]\s*([A-Z]+)\b/g, (match, var1, var2, op) => {
            console.log('🎯 Found operation:', match, 'var1:', var1, 'var2:', var2);
            const originalOp = match.includes('+') ? '+' : '-';
            
            // Check if variables are date columns
            const var1IsDate = isDateColumn(var1);
            const var2IsDate = isDateColumn(var2);
            console.log('📅 Variable types -', var1, ':', var1IsDate ? 'date' : 'not date', ',', var2, ':', var2IsDate ? 'date' : 'not date');
            
            // Case 1: Date subtraction (A-E) where both are dates - return day difference
            if (var1IsDate && var2IsDate && originalOp === '-') {
                console.log('🔍 Date subtraction detected:', var1, '-', var2);
                const date1 = getDateValue(var1);
                const date2 = getDateValue(var2);
                
                console.log('📅 Date1:', date1, 'Date2:', date2);
                console.log('📅 Date1 valid:', date1 && !isNaN(date1.getTime()));
                console.log('📅 Date2 valid:', date2 && !isNaN(date2.getTime()));
                
                if (date1 && date2 && !isNaN(date1.getTime()) && !isNaN(date2.getTime())) {
                    involvesDateColumn = true;
                    const diffTime = date1 - date2;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                    console.log('⏰ Time difference:', diffTime, 'ms');
                    console.log('📊 Day difference:', diffDays, 'days');
                    // Ensure 0 is returned when dates are the same
                    return diffDays === 0 ? 0 : diffDays;
                } else {
                    console.log('❌ Invalid dates detected');
                }
            }
            
            // Case 2: Date addition/subtraction with number (A+5 or A-5)
            if ((var1IsDate && !var2IsDate) || (!var1IsDate && var2IsDate)) {
                const dateVar = var1IsDate ? var1 : var2;
                const numVar = var1IsDate ? var2 : var1;
                
                const dateValue = getDateValue(dateVar);
                const numValue = getNumericValue(numVar);
                
                if (dateValue && !isNaN(dateValue.getTime())) {
                    involvesDateColumn = true;
                    const resultDate = new Date(dateValue);
                    
                    if (originalOp === '+') {
                        resultDate.setDate(resultDate.getDate() + numValue);
                    } else {
                        // For date - number, the number should be subtracted from date
                        if (var1IsDate) {
                            resultDate.setDate(resultDate.getDate() - numValue);
                        } else {
                            // For number - date, this is invalid, return 0
                            return 0;
                        }
                    }
                    
                    // Return as Excel serial number for consistent processing
                    return resultDate.getTime() / (1000 * 60 * 60 * 24);
                }
            }
            
            return match; // Return original if not a date operation pattern
        });

        // Process date functions FIRST
        evalExpr = evalExpr.replace(/TODAY\(\)/gi, () => {
            const today = new Date();
            return today.toISOString().split('T')[0];
        });

        evalExpr = evalExpr.replace(/NOW\(\)/gi, () => {
            return new Date().toISOString();
        });

        evalExpr = evalExpr.replace(/YEAR\((.*?)\)/gi, (_, args) => {
            const date = parseDate(args);
            return date.getFullYear();
        });

        evalExpr = evalExpr.replace(/MONTH\((.*?)\)/gi, (_, args) => {
            const date = parseDate(args);
            return date.getMonth() + 1;
        });

        evalExpr = evalExpr.replace(/DAY\((.*?)\)/gi, (_, args) => {
            const date = parseDate(args);
            return date.getDate();
        });

        evalExpr = evalExpr.replace(/WEEK\((.*?)\)/gi, (_, args) => {
            // Check if the column is date type
            const clean = args.trim();
            let colNameToUse = clean;
            if (this.state.variableColumns && this.state.variableColumns[clean]) {
                colNameToUse = this.state.variableColumns[clean];
            }
            
            // Find the column definition
            const columnDef = columns.find(c => c.encoding_columns.column_name === colNameToUse);
            if (columnDef && columnDef.encoding_columns.column_type !== 'date') {
                throw new Error(`WEEK function can only be used with date columns. Column '${colNameToUse}' is of type '${columnDef.encoding_columns.column_type}'.`);
            }
            
            const date = parseDate(args);
            // Calculate ISO week number (weeks start on Monday)
            const d = new Date(date);
            d.setHours(0, 0, 0, 0);
            // Thursday in current week decides the year.
            d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
            // January 4 is always in week 1.
            const week1 = new Date(d.getFullYear(), 0, 4);
            // Adjust to Thursday in week 1 and count number of weeks from date to week1.
            return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
        });

        evalExpr = evalExpr.replace(/WEEKDAY\((.*?)\)/gi, (_, args) => {
            const date = parseDate(args);
            return date.getDay();
        });

        evalExpr = evalExpr.replace(/DAYS\((.*?)\)/gi, (_, args) => {
            const [end, start] = args.split(',').map(a => parseDate(a));
            const diffTime = end - start;
            return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        });

        evalExpr = evalExpr.replace(/DATEDIF\((.*?)\)/gi, (_, args) => {
            const parts = args.split(',').map(a => a.trim());
            const start = parts[0];
            const end = parts[1];
            const unit = parts[2] || 'D';
            
            const startDate = parseDate(start);
            const endDate = parseDate(end);
            const diffTime = endDate - startDate;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            switch(unit.toUpperCase()) {
                case 'D': return diffDays;
                case 'M': return Math.floor(diffDays / 30);
                case 'Y': return Math.floor(diffDays / 365);
                default: return diffDays;
            }
        });

        // Process aggregate functions
        const getVal = (colName, entry) => {
            const clean = colName.trim();
            let colNameToUse = clean;
            if (this.state.variableColumns && this.state.variableColumns[clean]) {
                colNameToUse = this.state.variableColumns[clean];
            }
            
            const raw = entry.values[colNameToUse] ?? '0';
            return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
        };

        evalExpr = evalExpr.replace(/\bAVERAGE\((.*?)\)/gi, (_, args) => {
            const vals = args.split(',').map(a => getVal(a, entry));
            return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
        });

        evalExpr = evalExpr.replace(/\bSUM\((.*?)\)/gi, (_, args) => {
            const vals = args.split(',').map(a => getVal(a, entry));
            return vals.reduce((a,b)=>a+b,0);
        });

        evalExpr = evalExpr.replace(/\bCOUNT\((.*?)\)/gi, (_, args) => {
            return args.split(',').length;
        });

        evalExpr = evalExpr.replace(/\bMAX\((.*?)\)/gi, (_, args) => {
            const vals = args.split(',').map(a => getVal(a, entry));
            return Math.max(...vals);
        });

        evalExpr = evalExpr.replace(/\bMIN\((.*?)\)/gi, (_, args) => {
            const vals = args.split(',').map(a => getVal(a, entry));
            return Math.min(...vals);
        });

        // Column-level aggregate functions (computed over ALL entries)
        const computeColumnAggregate = (arg, func) => {
            let actualColName = arg.trim();
            if (this.state.variableColumns && this.state.variableColumns[actualColName]) {
                actualColName = this.state.variableColumns[actualColName];
            }
            const values = this.state.localEntries.map(e => {
                const raw = e.values?.[actualColName] ?? '';
                return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
            });
            switch(func.toLowerCase()) {
                case 'sum': return values.reduce((a,b)=>a+b,0);
                case 'avg':
                case 'average': return values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
                case 'max': return values.length ? Math.max(...values) : 0;
                case 'min': return values.length ? Math.min(...values) : 0;
                case 'count': return values.length;
                default: return 0;
            }
        };

        evalExpr = evalExpr.replace(/\bCOLSUM\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'sum'));
        evalExpr = evalExpr.replace(/\bCOLAVG\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'avg'));
        evalExpr = evalExpr.replace(/\bCOLAVERAGE\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'average'));
        evalExpr = evalExpr.replace(/\bCOLMAX\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'max'));
        evalExpr = evalExpr.replace(/\bCOLMIN\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'min'));
        evalExpr = evalExpr.replace(/\bCOLCOUNT\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'count'));

        // SUMIF: SUMIF(range, criteria, [sum_range])
        evalExpr = evalExpr.replace(/\bSUMIF\((.*?)\)/gi, (_, args) => {
            const parts = args.split(',').map(a => a.trim());
            if (parts.length < 2) return 0;
            
            const rangeCol = parts[0];
            const criteria = parts[1].replace(/^["']|["']$/g, ''); // Remove quotes
            const sumRangeCol = parts[2] || rangeCol; // If sum_range not provided, use range
            
            // Get column names from variable mapping
            let rangeColName = rangeCol.trim();
            let sumRangeColName = sumRangeCol.trim();
            
            if (this.state.variableColumns && this.state.variableColumns[rangeColName]) {
                rangeColName = this.state.variableColumns[rangeColName];
            }
            if (this.state.variableColumns && this.state.variableColumns[sumRangeColName]) {
                sumRangeColName = this.state.variableColumns[sumRangeColName];
            }
            
            // Get all entries
            const allEntries = this.state.localEntries || [];
            
            let sum = 0;
            
            allEntries.forEach(e => {
                const rangeValue = e.values[rangeColName] ?? '';
                const sumValue = parseFloat(String(e.values[sumRangeColName] ?? '0').replace(/[^\d.-]/g, '')) || 0;
                
                // Evaluate criteria
                if (this.evaluateCriteria(rangeValue, criteria)) {
                    sum += sumValue;
                }
            });
            
            return sum;
        });

        // Convert column names to variables for evaluation
        columns.forEach(c => {
            const colName = c.encoding_columns.column_name;
            const variable = this.getColumnVariable(colName);
            const raw = entry.values[colName] ?? '0';
            const colType = c.encoding_columns.column_type;

            let num;
            if (colType === 'date' && raw) {
                involvesDateColumn = true;
                let date;
                if (raw.includes('/')) {
                    const parts = raw.split('/');
                    if (parts.length === 3) {
                        const [day, month, year] = parts.map(p => parseInt(p, 10));
                        date = new Date(year, month - 1, day);
                    } else {
                        date = new Date(raw);
                    }
                } else {
                    date = new Date(raw);
                }
                
                if (!isNaN(date.getTime())) {
                    num = date.getTime() / (1000 * 60 * 60 * 24);
                } else {
                    num = 0;
                }
            } else {
                num = parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
            }

            const safeCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`\\b${safeCol}\\b`, 'g');
            evalExpr = evalExpr.replace(regex, num);
        });

        try {
            const result = eval(evalExpr);
            
            // Excel-like date addition: if formula involves dates and result is a number, convert back to date
            if (involvesDateColumn && typeof result === 'number' && !isNaN(result)) {
                // Convert Excel serial number back to date
                const dateResult = new Date(result * (1000 * 60 * 60 * 24));
                if (!isNaN(dateResult.getTime())) {
                    // Format as YYYY-MM-DD for display
                    const year = dateResult.getFullYear();
                    const month = String(dateResult.getMonth() + 1).padStart(2, '0');
                    const day = String(dateResult.getDate()).padStart(2, '0');
                    return `${year}-${month}-${day}`;
                }
            }
            
            return this.formatNumber(result);
        } catch {
            return 'ERR';
        }
    },


    toggleColumnComputationPosition: async function () {
        if (!this.state.activeColumnCompute) return;

        const config = this.state.activeColumnCompute;
        const newPosition = config.position === 'top' ? 'bottom' : 'top';

        // Update state in both places
        config.position = newPosition;
        if (this.state.activeColumnComputes[config.column]) {
            this.state.activeColumnComputes[config.column].position = newPosition;
        }

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
            UI.showToast('Failed to update position', 'error');
            return;
        }

        // Re-render all footers (this will update position for the active one)
        this.updateColumnComputation();
        UI.showToast(`Position changed to ${newPosition}`);
    },

    deleteColumnComputation: async function () {
        if (!this.state.activeColumnCompute) {
            UI.showToast('No active column computation to delete', 'info');
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
            UI.showToast('Failed to delete computation', 'error');
            return;
        }

        // Clear state
        const deletedColumn = config?.column;
        if (deletedColumn) {
            delete this.state.activeColumnComputes[deletedColumn];
        }

        // Remove specific footer from UI
        const table = document.getElementById('tableData');
        if (table && deletedColumn) {
            const footer = table.querySelector(`.column-footer[data-column="${deletedColumn}"]`);
            if (footer) footer.remove();
        }

        // Set a new active computation if any remain
        const remainingKeys = Object.keys(this.state.activeColumnComputes);
        if (remainingKeys.length > 0) {
            const newActiveColumn = remainingKeys[0];
            const newActiveConfig = this.state.activeColumnComputes[newActiveColumn];
            this.state.activeColumnCompute = {
                column: newActiveColumn,
                func: newActiveConfig.func,
                position: newActiveConfig.position
            };
        } else {
            this.state.activeColumnCompute = null;
        }

        UI.showToast('Column computation deleted');
    },

    //para sa 2 decimal places to beh
    formatNumber: function (val) {
        const num = parseFloat(val);
        if (isNaN(num)) return val;

        // If it's an integer, return as is (for date arithmetic results like DAYS)
        if (Number.isInteger(num)) return num;

        return Number(num.toFixed(2)); //number pa rin, hindi string
    },

    // ============================================================
    // AUTO-UPDATE COMPUTATION (Real-time recalculation)
    // ============================================================
    /**
     * Build dependency graph for all column formulas
     * Maps which columns each formula depends on
     */
    buildFormulaDependencyGraph: function() {
        this.state.formulaDependencies = {};
        
        Object.entries(this.state.columnFormulas || {}).forEach(([targetColumn, formula]) => {
            const dependencies = this.extractColumnDependencies(formula);
            this.state.formulaDependencies[targetColumn] = dependencies;
        });
        
        // console.log('Formula dependencies built:', this.state.formulaDependencies);
    },

    /**
     * Extract column dependencies from a formula string
     * @param {string} formula - The formula to analyze
     * @returns {Array} Array of column names this formula depends on
     */
    extractColumnDependencies: function(formula) {
        const dependencies = [];

        // Get all column names and their variable mappings
        // variableColumns is { "A": "columnName", "B": "columnName2", ... }
        const variableNames = Object.keys(this.state.variableColumns || {});
        const columnNames = Object.values(this.state.variableColumns || {});

        // Check for direct column name references
        columnNames.forEach(colName => {
            // Use word boundary to avoid partial matches
            const regex = new RegExp(`\\b${colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
            if (regex.test(formula)) {
                dependencies.push(colName);
            }
        });

        // Check for variable references (A, B, C, etc.)
        variableNames.forEach(varName => {
            // Use word boundary for variables
            const regex = new RegExp(`\\b${varName}\\b`, 'i');
            if (regex.test(formula)) {
                const actualColumnName = this.state.variableColumns[varName];
                if (actualColumnName && !dependencies.includes(actualColumnName)) {
                    dependencies.push(actualColumnName);
                }
            }
        });

        // 🔥 NEW: Check for column computation references (COLSUM, COLAVG, etc.)
        // These are functions like COLSUM(A), COLAVG(B) that depend on the underlying column
        const colComputePattern = /\bCOL(SUM|AVG|AVERAGE|MAX|MIN|COUNT)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/gi;
        let match;
        while ((match = colComputePattern.exec(formula)) !== null) {
            const varName = match[2]; // The variable inside COLSUM(...)
            const actualColumnName = this.state.variableColumns?.[varName];
            if (actualColumnName && !dependencies.includes(actualColumnName)) {
                dependencies.push(actualColumnName);
            }
        }

        return [...new Set(dependencies)]; // Remove duplicates
    },

    /**
     * Get formulas that depend on a specific column
     * @param {string} changedColumn - The column that was changed
     * @returns {Array} Array of target column formulas that should be recalculated
     */
    getDependentFormulas: function(changedColumn) {
        const dependentFormulas = [];
        
        Object.entries(this.state.formulaDependencies).forEach(([targetColumn, dependencies]) => {
            if (dependencies.includes(changedColumn)) {
                dependentFormulas.push(targetColumn);
            }
        });
        
        return dependentFormulas;
    },
    /**
     * Initialize virtual scrolling for large datasets
     */
    initVirtualScroll: function() {
        const tableContainer = document.getElementById('tableContainer');
        if (!tableContainer) return;

        // Enable virtual scrolling for datasets larger than 50 entries
        this.state.virtualScroll.enabled = this.state.localEntries.length > 50;
        
        if (!this.state.virtualScroll.enabled) {
            return; // Use regular rendering for small datasets
        }

        // Calculate visible count based on container height
        const visibleCount = Math.ceil(this.state.virtualScroll.containerHeight / this.state.virtualScroll.itemHeight);
        this.state.virtualScroll.visibleCount = visibleCount;

        // Add scroll event listener
        tableContainer.addEventListener('scroll', this.handleVirtualScroll.bind(this));
        
        // Set container styles
        tableContainer.style.height = `${this.state.virtualScroll.containerHeight}px`;
        tableContainer.style.overflow = 'auto';
        
        console.log('Virtual scrolling enabled for', this.state.localEntries.length, 'entries');
    },

    /**
     * Handle virtual scroll events
     */
    handleVirtualScroll: function(event) {
        if (!this.state.virtualScroll.enabled) return;

        const scrollTop = event.target.scrollTop;
        const itemHeight = this.state.virtualScroll.itemHeight;
        const containerHeight = this.state.virtualScroll.containerHeight;
        const bufferSize = this.state.virtualScroll.bufferSize;

        // Calculate visible range
        const startIndex = Math.floor(scrollTop / itemHeight);
        const endIndex = Math.min(
            startIndex + Math.ceil(containerHeight / itemHeight) + bufferSize,
            this.state.localEntries.length - 1
        );

        // Only re-render if the visible range changed
        if (startIndex !== this.state.virtualScroll.startIndex || 
            endIndex !== this.state.virtualScroll.endIndex) {
            
            this.state.virtualScroll.scrollTop = scrollTop;
            this.state.virtualScroll.startIndex = Math.max(0, startIndex - bufferSize);
            this.state.virtualScroll.endIndex = endIndex;
            
            this.renderVirtualTable();
        }
    },

    /**
     * Calculate virtual scrolling indices
     */
    calculateVirtualIndices: function() {
        if (!this.state.virtualScroll.enabled) {
            return { startIndex: 0, endIndex: this.state.localEntries.length - 1 };
        }

        const scrollTop = this.state.virtualScroll.scrollTop;
        const itemHeight = this.state.virtualScroll.itemHeight;
        const containerHeight = this.state.virtualScroll.containerHeight;
        const bufferSize = this.state.virtualScroll.bufferSize;

        const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - bufferSize);
        const visibleCount = Math.ceil(containerHeight / itemHeight);
        const endIndex = Math.min(
            startIndex + visibleCount + (bufferSize * 2),
            this.state.localEntries.length - 1
        );

        return { startIndex, endIndex };
    },

    /**
     * Render virtual table with only visible rows
     */
    renderVirtualTable: function() {
        const tableBody = document.getElementById('tableData');
        if (!tableBody) return;

        const { startIndex, endIndex } = this.calculateVirtualIndices();
        const visibleEntries = this.state.localEntries.slice(startIndex, endIndex + 1);

        // Clear existing content
        tableBody.innerHTML = '';

        // Create spacer for top offset
        if (startIndex > 0) {
            const topSpacer = document.createElement('tr');
            topSpacer.style.height = `${startIndex * this.state.virtualScroll.itemHeight}px`;
            topSpacer.innerHTML = '<td colspan="100%" style="border: none; padding: 0;"></td>';
            tableBody.appendChild(topSpacer);
        }

        // Render visible rows
        visibleEntries.forEach((entry, index) => {
            const actualIndex = startIndex + index;
            const row = this.createTableRow(entry, actualIndex);
            tableBody.appendChild(row);
        });

        // Create spacer for bottom offset
        const remainingHeight = (this.state.localEntries.length - endIndex - 1) * this.state.virtualScroll.itemHeight;
        if (remainingHeight > 0) {
            const bottomSpacer = document.createElement('tr');
            bottomSpacer.style.height = `${remainingHeight}px`;
            bottomSpacer.innerHTML = '<td colspan="100%" style="border: none; padding: 0;"></td>';
            tableBody.appendChild(bottomSpacer);
        }

        // Re-render column computations since they were cleared by innerHTML
        if (Object.keys(this.state.activeColumnComputes || {}).length > 0) {
            this.updateAllColumnComputations();
        }
    },

    /**
     * Create table row for virtual scrolling
     */
    createTableRow: function(entry, index) {
        const row = document.createElement('tr');
        row.dataset.entryId = entry.id;
        row.style.height = `${this.state.virtualScroll.itemHeight}px`;

        // Add checkbox column
        const checkboxCell = document.createElement('td');
        checkboxCell.innerHTML = `<input type="checkbox" class="row-checkbox" data-entry-id="${entry.id}">`;
        row.appendChild(checkboxCell);

        // Add data cells
        const columns = this.state.currentTemplate.columns || [];
        const visibleColumns = columns.filter(col => {
            const colDef = col.encoding_columns;
            return this.isColumnVisible(colDef.column_name);
        });

        visibleColumns.forEach(col => {
            const cell = document.createElement('td');
            const colName = col.encoding_columns.column_name;
            const value = entry.values[colName] || '';
            
            cell.dataset.columnName = colName;
            cell.dataset.columnId = col.encoding_columns.id;
            cell.textContent = value;
            
            // Add formula indicator if applicable
            if (this.state.columnFormulas[colName]) {
                cell.classList.add('formula-cell');
            }
            
            row.appendChild(cell);
        });

        return row;
    },
    autoRecalculateDependentFormulas: async function (changedColumnName, changedEntryId) {
        if (!this.state.currentTemplate) return;

        // Add to pending recalculations queue
        const recalcKey = `${changedEntryId}|${changedColumnName}`;
        if (!this.state.pendingRecalculations.includes(recalcKey)) {
            this.state.pendingRecalculations.push(recalcKey);
        }

        // Clear existing timer
        if (this.state.formulaRecalcTimer) {
            clearTimeout(this.state.formulaRecalcTimer);
        }

        // Set new timer to batch recalculations (500ms delay)
        this.state.formulaRecalcTimer = setTimeout(async () => {
            // Process all pending recalculations
            const uniqueEntries = [...new Set(this.state.pendingRecalculations.map(key => key.split('|')[0]))];
            
            // Build dependency graph if not already built
            if (Object.keys(this.state.formulaDependencies).length === 0) {
                this.buildFormulaDependencyGraph();
            }
            
            for (const entryId of uniqueEntries) {
                // Get all changed columns for this entry
                const changedColumns = this.state.pendingRecalculations
                    .filter(key => key.startsWith(`${entryId}|`))
                    .map(key => key.split('|')[1]);
                
                // Find all formulas that depend on any of the changed columns
                const formulasToRecalculate = new Set();
                changedColumns.forEach(colName => {
                    const dependentFormulas = this.getDependentFormulas(colName);
                    dependentFormulas.forEach(formula => formulasToRecalculate.add(formula));
                });
                
                // Recalculate only the affected formulas
                for (const targetColumn of formulasToRecalculate) {
                    const formula = this.state.columnFormulas[targetColumn];
                    if (formula) {
                        await this.recalculateSingleFormula(entryId, targetColumn, formula);
                    }
                }

                // 🔥 Update column computations first (so COLSUM, etc. get fresh values)
                if (Object.keys(this.state.activeColumnComputes || {}).length > 0) {
                    console.log('📊 Updating all column computations before recalculating cells');
                    this.updateAllColumnComputations();
                    
                    // 🔥 Then recalculate only cell formulas with COL functions
                    await this.recalculateColComputeCellFormulas();
                }
                
                // 🔥 Also recalculate cell formulas that directly depend on the changed columns
                for (const colName of changedColumns) {
                    await this.recalculateCellFormulas(colName, entryId);
                }
            }

            // Clear the queue
            this.state.pendingRecalculations = [];
            this.state.formulaRecalcTimer = null;
        }, 500); // 500ms debounce delay
    },

    /**
     * Get cell formulas that depend on column computations (COLSUM, etc.)
     * Cached for performance with large datasets
     */
    getCellFormulasWithColCompute: function () {
        // Check if cache is valid
        if (this.state._colComputeFormulaCache && 
            this.state._colComputeFormulaCacheVersion === this.state.cellFormulasVersion) {
            return this.state._colComputeFormulaCache;
        }
        
        // Build cache - find all formulas with COL functions
        const colComputeFormulas = [];
        const colPattern = /\bCOL(?:SUM|AVG|AVERAGE|MAX|MIN|COUNT)\s*\(/i;
        
        for (const [key, formula] of Object.entries(this.state.cellFormulas || {})) {
            if (colPattern.test(formula)) {
                const [entryId, targetColName] = key.split('|');
                colComputeFormulas.push({ key, entryId, targetColName, formula });
            }
        }
        
        // Store cache
        this.state._colComputeFormulaCache = colComputeFormulas;
        this.state._colComputeFormulaCacheVersion = this.state.cellFormulasVersion || Date.now();
        
        return colComputeFormulas;
    },

    /**
     * Invalidate the COL compute formula cache when formulas change
     */
    invalidateColComputeCache: function () {
        this.state._colComputeFormulaCache = null;
        this.state.cellFormulasVersion = Date.now();
    },

    /**
     * Recalculate only cell formulas that have COL functions
     * Optimized for large datasets - only recalculates formulas that depend on column computations
     */
    recalculateColComputeCellFormulas: async function () {
        const colComputeFormulas = this.getCellFormulasWithColCompute();
        
        if (colComputeFormulas.length === 0) {
            return; // No formulas with COL functions
        }
        
        console.log(`🔄 Recalculating ${colComputeFormulas.length} cell formulas with COL functions`);
        
        // Recalculate only formulas with COL functions
        for (const { entryId, targetColName, formula } of colComputeFormulas) {
            const entry = this.state.localEntries.find(e => e.id === entryId);
            if (entry) {
                await this.recalculateSingleFormula(entryId, targetColName, formula);
            }
        }
    },

    /**
     * Recalculate cell formulas that depend on a specific column
     * For large datasets: only recalculates affected formulas
     */
    recalculateCellFormulas: async function (changedColumnName, changedEntryId) {
        const table = document.getElementById('tableData');
        if (!table) return;

        const escapedColName = changedColumnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const colNameRegex = new RegExp(escapedColName, 'i');
        
        const variableName = Object.keys(this.state.variableColumns || {})
            .find(v => this.state.variableColumns[v] === changedColumnName);
        const escapedVarName = variableName ? variableName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
        const varNameRegex = escapedVarName ? new RegExp(escapedVarName, 'i') : null;

        // Collect formulas to recalculate
        const formulasToRecalculate = [];

        for (const [key, formula] of Object.entries(this.state.cellFormulas || {})) {
            const [entryId, targetColName] = key.split('|');
            
            // Check if formula directly references the changed column
            const dependsOnColumn = colNameRegex.test(formula);
            const dependsOnVariable = varNameRegex ? varNameRegex.test(formula) : false;
            
            if ((dependsOnColumn || dependsOnVariable) && entryId === changedEntryId) {
                const entry = this.state.localEntries.find(e => e.id === entryId);
                if (entry) {
                    formulasToRecalculate.push({ entryId, targetColName, formula });
                }
            }
        }

        // Recalculate only affected formulas
        for (const { entryId, targetColName, formula } of formulasToRecalculate) {
            await this.recalculateSingleFormula(entryId, targetColName, formula);
        }
    },

    /**
     * Recalculate all per-row formulas for a specific entry
     */
    recalculateRowFormulas: async function (entryId) {
        // console.log('🔄 recalculateRowFormulas called for entry:', entryId);
        // console.log('📊 Available column formulas:', this.state.columnFormulas);
        
        const entry = this.state.localEntries.find(e => e.id === entryId);
        if (!entry) {
            console.log('❌ Entry not found:', entryId);
            return;
        }
        
        // console.log('✅ Entry found:', entry.id);
        // console.log('📋 Entry values:', entry.values);

        const columns = this.state.currentTemplate?.columns || [];

        // Use for...of to properly await async operations
        for (const [columnName, formula] of Object.entries(this.state.columnFormulas || {})) {
            // console.log('🧮 Applying column formula:', columnName, '=', formula);
            await this.recalculateSingleFormula(entryId, columnName, formula);
        }
        
        // Refresh virtual table if enabled to show updated computed values
        if (this.state.virtualScroll.enabled) {
            this.renderVirtualTable();
        }
    },

    /**
     * Recalculate a single formula and update the cell UI + database
     */
    recalculateSingleFormula: async function (entryId, targetColumnName, formula) {
        const entry = this.state.localEntries.find(e => e.id === entryId);
        if (!entry) return;

        const columns = this.state.currentTemplate?.columns || [];
        const self = this; // Capture 'this' for nested functions

        // Pre-fetch encoding data for SUMIFS before synchronous evaluation
        await this.prefetchSUMIFSDataForFormula(formula);

        // Execute the formula evaluation logic (similar to applyFormula)
        const computeRow = (entry) => {
            let evalExpr = formula.startsWith('=') ? formula.slice(1) : formula;

            // console.log('🔧 Processing formula in recalculateSingleFormula:', formula);
            // console.log('🔧 Cleaned expression:', evalExpr);

            // Helper: parse date from column name or value
            const parseDate = (arg) => {
                const clean = arg.trim();
                if (!isNaN(clean)) return new Date(clean);
                
                // Check if it's a variable name and convert to column name
                let colNameToUse = clean;
                if (this.state.variableColumns && this.state.variableColumns[clean]) {
                    colNameToUse = this.state.variableColumns[clean];
                }
                
                const raw = entry.values[colNameToUse];
                if (raw) {
                    // Handle DD/MM/YYYY format
                    if (raw.includes('/')) {
                        const parts = raw.split('/');
                        if (parts.length === 3) {
                            const [day, month, year] = parts.map(p => parseInt(p, 10));
                            return new Date(year, month - 1, day);
                        }
                    }
                    // Handle YYYY-MM-DD format
                    if (raw.includes('-')) {
                        const parts = raw.split('-');
                        if (parts.length === 3) {
                            const [year, month, day] = parts.map(p => parseInt(p, 10));
                            return new Date(year, month - 1, day);
                        }
                    }
                    return new Date(raw);
                }
                return new Date(clean);
            };

            // Process date functions FIRST (before column name replacement)
            evalExpr = evalExpr.replace(/TODAY\(\)/gi, () => {
                const today = new Date();
                return today.toISOString().split('T')[0];
            });

            evalExpr = evalExpr.replace(/NOW\(\)/gi, () => {
                return new Date().toISOString();
            });

            evalExpr = evalExpr.replace(/YEAR\((.*?)\)/gi, (_, args) => {
                const date = parseDate(args);
                return date.getFullYear();
            });

            evalExpr = evalExpr.replace(/MONTH\((.*?)\)/gi, (_, args) => {
                const date = parseDate(args);
                return date.getMonth() + 1;
            });

            evalExpr = evalExpr.replace(/DAY\((.*?)\)/gi, (_, args) => {
                const date = parseDate(args);
                return date.getDate();
            });

            evalExpr = evalExpr.replace(/WEEK\((.*?)\)/gi, (_, args) => {
                // Check if the column is date type
                const clean = args.trim();
                let colNameToUse = clean;
                if (this.state.variableColumns && this.state.variableColumns[clean]) {
                    colNameToUse = this.state.variableColumns[clean];
                }
                
                // Find the column definition
                const columnDef = columns.find(c => c.encoding_columns.column_name === colNameToUse);
                if (columnDef && columnDef.encoding_columns.column_type !== 'date') {
                    throw new Error(`WEEK function can only be used with date columns. Column '${colNameToUse}' is of type '${columnDef.encoding_columns.column_type}'.`);
                }
                
                const date = parseDate(args);
                // Calculate ISO week number (weeks start on Monday)
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                // Thursday in current week decides the year.
                d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7);
                // January 4 is always in week 1.
                const week1 = new Date(d.getFullYear(), 0, 4);
                // Adjust to Thursday in week 1 and count number of weeks from date to week1.
                return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
            });

            evalExpr = evalExpr.replace(/WEEKDAY\((.*?)\)/gi, (_, args) => {
                const date = parseDate(args);
                return date.getDay();
            });

            evalExpr = evalExpr.replace(/DAYS\((.*?)\)/gi, (_, args) => {
                const [end, start] = args.split(',').map(a => parseDate(a));
                const diffTime = end - start;
                return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            });

            evalExpr = evalExpr.replace(/DATEDIF\((.*?)\)/gi, (_, args) => {
                const parts = args.split(',').map(a => a.trim());
                const start = parts[0];
                const end = parts[1];
                const unit = parts[2] || 'D'; // Default to days if unit not provided
                
                const startDate = parseDate(start);
                const endDate = parseDate(end);
                const diffTime = endDate - startDate;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                
                switch(unit.toUpperCase()) {
                    case 'D': return diffDays;
                    case 'M': return (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth());
                    case 'Y': return endDate.getFullYear() - startDate.getFullYear();
                    default: return diffDays;
                }
            });

            evalExpr = evalExpr.replace(/DATE\((.*?)\)/gi, (_, args) => {
                const [year, month, day] = args.split(',').map(a => parseFloat(a.trim()));
                const date = new Date(year, month - 1, day);
                return date.toISOString().split('T')[0];
            });

            evalExpr = evalExpr.replace(/EDATE\((.*?)\)/gi, (_, args) => {
                const [dateStr, months] = args.split(',').map(a => a.trim());
                const date = parseDate(dateStr);
                const monthsToAdd = parseFloat(months);
                date.setMonth(date.getMonth() + monthsToAdd);
                return date.toISOString().split('T')[0];
            });

            // Helper: convert argument → number for aggregate functions
            const getVal = (arg, entry) => {
                const clean = arg.trim();
                if (!isNaN(clean)) return parseFloat(clean);
                
                // Check if it's a variable name and convert to column name
                let colNameToUse = clean;
                if (this.state.variableColumns && this.state.variableColumns[clean]) {
                    colNameToUse = this.state.variableColumns[clean];
                }
                
                const raw = entry.values[colNameToUse] ?? '0';
                return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
            };

            // Process aggregate functions - ONLY if they are explicitly called
            // Use word boundary to ensure we don't match inside other words
            evalExpr = evalExpr.replace(/\bAVERAGE\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return vals.length ? vals.reduce((a,b)=>a+b,0) / vals.length : 0;
            });

            evalExpr = evalExpr.replace(/\bSUM\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return vals.reduce((a,b)=>a+b,0);
            });

            evalExpr = evalExpr.replace(/\bCOUNT\((.*?)\)/gi, (_, args) => {
                return args.split(',').length;
            });

            evalExpr = evalExpr.replace(/\bMAX\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return Math.max(...vals);
            });

            evalExpr = evalExpr.replace(/\bMIN\((.*?)\)/gi, (_, args) => {
                const vals = args.split(',').map(a => getVal(a, entry));
                return Math.min(...vals);
            });

            // Column-level aggregate functions (computed over ALL entries)
            const computeColumnAggregate = (arg, func) => {
                let actualColName = arg.trim();
                if (this.state.variableColumns && this.state.variableColumns[actualColName]) {
                    actualColName = this.state.variableColumns[actualColName];
                }
                const values = this.state.localEntries.map(e => {
                    const raw = e.values?.[actualColName] ?? '';
                    return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
                });
                switch(func.toLowerCase()) {
                    case 'sum': return values.reduce((a,b)=>a+b,0);
                    case 'avg':
                    case 'average': return values.length ? values.reduce((a,b)=>a+b,0)/values.length : 0;
                    case 'max': return values.length ? Math.max(...values) : 0;
                    case 'min': return values.length ? Math.min(...values) : 0;
                    case 'count': return values.length;
                    default: return 0;
                }
            };

            evalExpr = evalExpr.replace(/\bCOLSUM\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'sum'));
            evalExpr = evalExpr.replace(/\bCOLAVG\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'avg'));
            evalExpr = evalExpr.replace(/\bCOLAVERAGE\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'average'));
            evalExpr = evalExpr.replace(/\bCOLMAX\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'max'));
            evalExpr = evalExpr.replace(/\bCOLMIN\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'min'));
            evalExpr = evalExpr.replace(/\bCOLCOUNT\((.*?)\)/gi, (_, args) => computeColumnAggregate(args, 'count'));

            // SUMIFS with ! notation and legacy syntax — evaluated from cache
            let idx = evalExpr.indexOf('SUMIFS(');
            while (idx !== -1) {
                let depth = 1;
                let endIdx = idx + 7;
                while (endIdx < evalExpr.length && depth > 0) {
                    const c = evalExpr[endIdx];
                    if (c === '(') depth++;
                    else if (c === ')') depth--;
                    endIdx++;
                }
                const argsStr = evalExpr.substring(idx + 7, endIdx - 1);
                const result = this.evaluateSUMIFSUnifiedSync(argsStr, this.state.localEntries);
                evalExpr = evalExpr.substring(0, idx) + String(result) + evalExpr.substring(endIdx);
                idx = evalExpr.indexOf('SUMIFS(');
            }

            // Process date operations BEFORE column name replacement
            // console.log('🔍 Looking for date operations in:', evalExpr);
            
            // Create a more flexible regex that handles column names with spaces
            // First, get all column names to build a proper regex
            const columnNames = columns.map(c => c.encoding_columns.column_name);
            // console.log('📋 Available columns:', columnNames);
            const escapedColumnNames = columnNames.map(name => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
            const columnPattern = escapedColumnNames.join('|');
            
            // Build regex for date operations with column names that may have spaces
            const dateOperationRegex = new RegExp(`(${columnPattern})\\s*[\\+\\-]\\s*(${columnPattern})`, 'g');
            
            // console.log('🔍 Built regex pattern:', dateOperationRegex);
            // console.log('🔍 Testing regex against:', evalExpr);
            
            // Test if regex matches
            const testMatch = evalExpr.match(dateOperationRegex);
            // console.log('🧪 Regex test matches:', testMatch);
            
            evalExpr = evalExpr.replace(dateOperationRegex, (match, var1, var2, op) => {
            // console.log('🎯 Found operation:', match, 'var1:', var1, 'var2:', var2);
                const originalOp = match.includes('+') ? '+' : '-';
                
                // Helper: check if column is date type
                const isDateColumn = (colName) => {
                    const column = columns.find(c => c.encoding_columns.column_name === colName);
                    return column && column.encoding_columns.column_type === 'date';
                };
                
                // Helper: get date value from column
                const getDateValue = (colName) => {
                    // console.log('🔍 Getting date value for column:', colName);
                    // console.log('📊 Entry values:', entry.values);
                    const raw = entry.values[colName];
                    // console.log('📄 Raw value for', colName, ':', raw);
                    if (!raw) return null;
                    
                    // Parse date - handle DD/MM/YYYY format
                    let date;
                    const rawString = String(raw);
                    if (rawString.includes('/')) {
                        const parts = rawString.split('/');
                        if (parts.length === 3) {
                            const [day, month, year] = parts.map(p => parseInt(p, 10));
                            date = new Date(year, month - 1, day);
                        } else {
                            date = new Date(rawString);
                        }
                    } else {
                        date = new Date(rawString);
                    }
                    
                    return date && !isNaN(date.getTime()) ? date : null;
                };
                
                // Check if variables are date columns
                const var1IsDate = isDateColumn(var1);
                const var2IsDate = isDateColumn(var2);
                // console.log('📅 Variable types -', var1, ':', var1IsDate ? 'date' : 'not date', ',', var2, ':', var2IsDate ? 'date' : 'not date');
                
                // Case 1: Date subtraction (A-E) where both are dates - return day difference
                if (var1IsDate && var2IsDate && originalOp === '-') {
                    // console.log('🔍 Date subtraction detected:', var1, '-', var2);
                    const date1 = getDateValue(var1);
                    const date2 = getDateValue(var2);
                    
                    // console.log('📅 Date1:', date1, 'Date2:', date2);
                    // console.log('📅 Date1 valid:', date1 && !isNaN(date1.getTime()));
                    // console.log('📅 Date2 valid:', date2 && !isNaN(date2.getTime()));
                    
                    if (date1 && date2 && !isNaN(date1.getTime()) && !isNaN(date2.getTime())) {
                        const diffTime = date1 - date2;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        // console.log('⏰ Time difference:', diffTime, 'ms');
                        // console.log('📊 Day difference:', diffDays, 'days');
                        // Ensure 0 is returned when dates are the same
                        return diffDays === 0 ? 0 : diffDays;
                    } else {
                        // console.log('❌ Invalid dates detected');
                    }
                }
                
                return match; // Return original if not a date operation pattern
            });

            // Convert column names to numbers for evaluation
            columns.forEach(c => {
                const colName = c.encoding_columns.column_name;
                const raw = entry.values[colName] ?? '0';
                const colType = c.encoding_columns.column_type;

                let num;
                // Handle date columns differently - convert to days for arithmetic
                if (colType === 'date' && raw) {
                    // Convert raw to string to handle different data types
                    const rawString = String(raw);
                    // Parse date - handle DD/MM/YYYY format
                    let date;
                    if (rawString.includes('/')) {
                        const parts = rawString.split('/');
                        if (parts.length === 3) {
                            // Assume DD/MM/YYYY format
                            const [day, month, year] = parts.map(p => parseInt(p, 10));
                            date = new Date(year, month - 1, day);
                        } else {
                            date = new Date(rawString);
                        }
                    } else {
                        date = new Date(rawString);
                    }
                    
                    if (!isNaN(date.getTime())) {
                        num = date.getTime() / (1000 * 60 * 60 * 24); // Convert to days
                    } else {
                        num = 0;
                    }
                } else {
                    // convert text → number
                    num = parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
                }

                const safeCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                const regex = new RegExp(`\\b${safeCol}\\b`, 'g');
                evalExpr = evalExpr.replace(regex, num);
            });

            try {
                const result = eval(evalExpr);
                
                // Check if target column is date type and format accordingly
                const targetColDef = columns.find(c => c.encoding_columns.column_name === targetColumnName);
                if (targetColDef && targetColDef.encoding_columns.column_type === 'date') {
                    // If result is a number (Excel serial), convert to date
                    if (typeof result === 'number' && !isNaN(result)) {
                        const dateResult = new Date(result * (1000 * 60 * 60 * 24));
                        if (!isNaN(dateResult.getTime())) {
                            // Format as MM/DD/YYYY for date display
                            const month = String(dateResult.getMonth() + 1).padStart(2, '0');
                            const day = String(dateResult.getDate()).padStart(2, '0');
                            const year = dateResult.getFullYear();
                            return `${month}/${day}/${year}`;
                        }
                    }
                    // If result is already a date string, return as is
                    return String(result);
                }
                
                return self.formatNumber(result); // For non-date columns
            } catch {
                return 'ERR';
            }
        };

        let newResult;
        try {
            newResult = computeRow(entry);
        } catch (error) {
            console.error('Error computing formula:', error.message);
            newResult = 'ERR';
        }

        // Update local state always (even if table row doesn't exist yet)
        entry.values[targetColumnName] = newResult;

        // Update valueDetails
        const targetColDef = this.state.currentTemplate.columns.find(
            c => c.encoding_columns.column_name === targetColumnName
        )?.encoding_columns;
        
        if (targetColDef) {
            if (!entry.valueDetails) entry.valueDetails = [];
            entry.valueDetails = entry.valueDetails.filter(v => v.column_id !== targetColDef.id);
            if (newResult !== '' && newResult !== null && newResult !== undefined) {
                entry.valueDetails.push({
                    column_id: targetColDef.id,
                    value: newResult
                });
            }
        }

        // Find and update the cell in the table (if row exists)
        const table = document.getElementById('tableData');
        if (table) {
            const row = table.querySelector(`tr[data-entry-id="${entryId}"]`);
            if (row) {
                const cells = Array.from(row.querySelectorAll('td[data-col-name]'));
                const targetCell = cells.find(c => c.dataset.colName === targetColumnName);
                
                if (targetCell) {
                    // Check if this is a date column and update the date input value instead of overwriting
                    const cellColDef = this.state.currentTemplate.columns.find(
                        c => c.encoding_columns.column_name === targetColumnName
                    )?.encoding_columns;
                    
                    if (cellColDef && cellColDef.column_type === 'date') {
                        // For date columns, update the date input value
                        const dateInput = targetCell.querySelector('input[type="date"]');
                        if (dateInput) {
                            // Don't set ERR value to date input - it causes HTML validation errors
                            if (newResult === 'ERR' || newResult === null || newResult === undefined || newResult === '') {
                                dateInput.value = '';
                            } else {
                                // Convert MM/DD/YYYY to YYYY-MM-DD for date input
                                let dateValue = newResult;
                                if (newResult && newResult.includes('/')) {
                                    const parts = newResult.split('/');
                                    if (parts.length === 3) {
                                        const [month, day, year] = parts.map(p => parseInt(p, 10));
                                        dateValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                                    }
                                }
                                dateInput.value = dateValue;
                            }
                        } else {
                            // If no date input found, fallback to text content
                            targetCell.textContent = newResult;
                        }
                    } else {
                        // For non-date columns, use text content as before
                        targetCell.textContent = newResult;
                    }
                }
            }
        }

        // Save to database and update entry data
        try {
            if (targetColDef && newResult !== 'ERR') {
                // For date columns, ensure proper date format for database storage
                let dbValue = newResult;
                if (targetColDef.column_type === 'date' && typeof newResult === 'string') {
                    // Convert MM/DD/YYYY to YYYY-MM-DD for database storage
                    if (newResult.includes('/')) {
                        const parts = newResult.split('/');
                        if (parts.length === 3) {
                            const [month, day, year] = parts.map(p => parseInt(p, 10));
                            dbValue = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                        }
                    }
                }
                
                const payload = {};
                payload[targetColDef.id] = dbValue;
                await SupabaseService.updateEntryValues(entryId, payload);
                
                // IMPORTANT: Update entry data so virtual scrolling can render the computed value
                if (entry) {
                    if (!entry.values) entry.values = {};
                    entry.values[targetColumnName] = newResult;
                    
                    // Also update valueDetails for consistency
                    if (!entry.valueDetails) entry.valueDetails = [];
                    const existingDetail = entry.valueDetails.find(v => v.column_id === targetColDef.id);
                    if (existingDetail) {
                        existingDetail.value = dbValue;
                    } else {
                        entry.valueDetails.push({
                            column_id: targetColDef.id,
                            value: dbValue
                        });
                    }
                }
                
            } else if (targetColDef && newResult === 'ERR') {
                // Skip saving ERR to database - just show in UI
                console.log('Skipping database save for ERR value in column:', targetColumnName);
                
                // Still update entry data for UI consistency
                if (entry) {
                    if (!entry.values) entry.values = {};
                    entry.values[targetColumnName] = newResult;
                }
            }
        } catch (err) {
            console.error('Failed to save formula result:', err);
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
    //------------AUTO-UPDATE MONITORING FROM ENCODING------------------
    //-----------------------------------------------------------------------------------------

    /**
     * Find related monitoring templates for the current encoding template
     * @returns {Promise<Array>} Array of monitoring template objects
     */
    findRelatedMonitoringTemplates: async function () {
        if (!this.state.currentTemplate || this.state.currentTemplate.module !== 'encoding') {
            return [];
        }

        try {
            // Get all templates for the current department
            const allTemplates = await SupabaseService.getTemplates(this.state.departmentId);
            
            // Find monitoring templates that might be related
            // Strategy: Look for monitoring templates with similar names or that share columns
            const monitoringTemplates = allTemplates.filter(template => 
                template.module === 'monitoring'
            );

            // For now, return all monitoring templates in the same department
            // In the future, you could implement more sophisticated matching logic
            return monitoringTemplates;
        } catch (error) {
            console.error('Error finding monitoring templates:', error);
            return [];
        }
    },

    /**
     * Auto-update monitoring templates when encoding data changes
     * Accumulates changes and batches them to prevent data scrambling
     * @param {Object} changedData - Object containing the changed entry data
     * @param {string} operation - 'create', 'update', or 'delete'
     */
    autoUpdateMonitoring: async function (changedData, operation = 'update') {
        if (!this.state.currentTemplate || this.state.currentTemplate.module !== 'encoding') {
            return; // Only auto-update from encoding templates
        }

        // Invalidate encoding cache so SUMIFS gets fresh data
        this.invalidateEncodingCache(this.state.currentTemplate.name);

        const entryId = changedData.entryId || 'new';
        const updateKey = `${entryId}-${operation}`;

        // Track update keys to prevent duplicate queue entries
        if (!this.state.pendingMonitoringUpdates.includes(updateKey)) {
            this.state.pendingMonitoringUpdates.push(updateKey);
        }

        // ACCUMULATE all data changes per entryId for batch processing
        if (!this.state.pendingMonitoringUpdatesData[entryId]) {
            this.state.pendingMonitoringUpdatesData[entryId] = {
                values: {},
                operation: operation
            };
        }

        // Merge new values into accumulated values for this entry
        if (changedData.values) {
            Object.assign(this.state.pendingMonitoringUpdatesData[entryId].values, changedData.values);
        }

        // Preserve entryValues for delete operations
        if (changedData.entryValues) {
            this.state.pendingMonitoringUpdatesData[entryId].entryValues = changedData.entryValues;
        }

        // If any operation for this entry is delete, the final operation becomes delete
        if (operation === 'delete') {
            this.state.pendingMonitoringUpdatesData[entryId].operation = 'delete';
        }

        // Clear existing timer
        if (this.state.monitoringUpdateTimer) {
            clearTimeout(this.state.monitoringUpdateTimer);
        }

        // Set new timer to batch monitoring updates (50ms for near-immediate reflection)
        this.state.monitoringUpdateTimer = setTimeout(async () => {
            try {
                await this.performMonitoringUpdate();
            } catch (error) {
                console.error('Background monitoring update failed:', error);
            }

            // Clear the queues
            this.state.pendingMonitoringUpdates = [];
            this.state.pendingMonitoringUpdatesData = {};
            this.state.monitoringUpdateTimer = null;
        }, 50); // 50ms debounce for immediate batch updates
    },

    /**
     * Perform the actual monitoring update in background
     * Processes ALL accumulated changes in a single batch
     */
    performMonitoringUpdate: async function() {
        const monitoringTemplates = await this.findRelatedMonitoringTemplates();
        
        if (monitoringTemplates.length === 0) {
            return;
        }

        // Get all accumulated pending entries
        const pendingEntries = Object.entries(this.state.pendingMonitoringUpdatesData);
        if (pendingEntries.length === 0) {
            return;
        }

        for (const monitoringTemplate of monitoringTemplates) {
            for (const [entryId, data] of pendingEntries) {
                const changedData = {
                    entryId,
                    values: data.values,
                    entryValues: data.entryValues
                };
                await this.syncDataToMonitoringTemplate(monitoringTemplate, changedData, data.operation);
            }
            this.clearCache(monitoringTemplate.id);
        }

        // If a monitoring template is currently active, refresh the UI
        if (this.state.currentTemplate && this.state.currentTemplate.module === 'monitoring') {
            // Reload entries from database
            await this.loadEntries(this.state.currentTemplate.id);
            // Recalculate formulas
            await this.applyLoadedFormulas();
            // Re-render the table
            this.renderTable(this.state.localEntries);
        }

        // Show toast only if not during compute operation
        if (!this.state.isComputing) {
            UI.showToast(`Updated ${monitoringTemplates.length} monitoring template(s)`, 'success');
        }
    },

    /**
     * Sync data from encoding to a specific monitoring template
     * @param {Object} monitoringTemplate - The monitoring template to update
     * @param {Object} changedData - The changed entry data
     * @param {string} operation - 'create', 'update', or 'delete'
     */
    syncDataToMonitoringTemplate: async function (monitoringTemplate, changedData, operation) {
        try {
            // Get monitoring template columns to find matching columns
            const monitoringTemplateWithColumns = await SupabaseService.getTemplate(monitoringTemplate.id);
            const monitoringColumns = monitoringTemplateWithColumns.columns || [];
            
            // Get encoding template columns for reference
            const encodingColumns = this.state.currentTemplate.columns || [];

            // Find matching columns between encoding and monitoring templates
            const columnMappings = this.findColumnMappings(encodingColumns, monitoringColumns);

            if (columnMappings.length === 0) {
                // console.log(`No matching columns found for monitoring template: ${monitoringTemplate.name}`);
                return;
            }

            // Handle different operations
            switch (operation) {
                case 'create':
                    await this.createMonitoringEntry(monitoringTemplate, changedData, columnMappings);
                    break;
                case 'update':
                    await this.updateMonitoringEntry(monitoringTemplate, changedData, columnMappings);
                    break;
                case 'delete':
                    await this.deleteMonitoringEntry(monitoringTemplate, changedData, columnMappings);
                    break;
            }
        } catch (error) {
            console.error(`Error syncing to monitoring template ${monitoringTemplate.name}:`, error);
        }
    },

    /**
     * Find matching columns between encoding and monitoring templates
     * @param {Array} encodingColumns - Encoding template columns
     * @param {Array} monitoringColumns - Monitoring template columns
     * @returns {Array} Array of column mappings
     */
    findColumnMappings: function (encodingColumns, monitoringColumns) {
        const mappings = [];

        encodingColumns.forEach(encCol => {
            const encColName = encCol.encoding_columns.column_name;
            
            // Find matching column in monitoring template (exact match first, then partial)
            const matchingMonCol = monitoringColumns.find(monCol => {
                const monColName = monCol.encoding_columns.column_name;
                return monColName === encColName || 
                       monColName.toLowerCase().includes(encColName.toLowerCase()) ||
                       encColName.toLowerCase().includes(monColName.toLowerCase());
            });

            if (matchingMonCol) {
                mappings.push({
                    encodingColumn: encCol,
                    monitoringColumn: matchingMonCol
                });
            }
        });

        return mappings;
    },

    // ============================================================
    // COLUMN VISIBILITY FEATURE
    // ============================================================

    /**
     * Toggle column selector modal visibility
     */
    toggleColumnSelector: function () {
        const modal = document.getElementById('columnSelectorModal');
        const isVisible = modal.style.display === 'block';
        
        if (!isVisible) {
            this.populateColumnSelector();
            modal.style.display = 'block';
        } else {
            modal.style.display = 'none';
        }
    },

    /**
     * Populate column selector with checkboxes for all columns
     */
    populateColumnSelector: function () {
        const content = document.getElementById('columnSelectorContent');
        const columns = this.state.currentTemplate?.columns || [];
        
        // Initialize visibility state if not exists
        if (Object.keys(this.state.columnVisibility).length === 0) {
            columns.forEach(col => {
                const colDef = col.encoding_columns;
                this.state.columnVisibility[colDef.column_name] = true; // Default to visible
            });
        }
        
        content.innerHTML = columns.map(col => {
            const colDef = col.encoding_columns;
            const isChecked = this.state.columnVisibility[colDef.column_name] ? 'checked' : '';
            const hasFormula = this.state.columnFormulas[colDef.column_name];
            const formulaIndicator = hasFormula ? 
                '<span class="formula-indicator">fx</span>' : '';
            
            return `
                <div class="checkbox-item">
                    <input type="checkbox" 
                           id="col_${colDef.id}" 
                           data-column-name="${colDef.column_name}"
                           ${isChecked}>
                    <label for="col_${colDef.id}">
                        ${colDef.column_name}${formulaIndicator}
                    </label>
                </div>
            `;
        }).join('');
    },

    /**
     * Select or deselect all columns
     */
    selectAllColumns: function (select) {
        const checkboxes = document.querySelectorAll('#columnSelectorContent input[type="checkbox"]');
        checkboxes.forEach(checkbox => {
            checkbox.checked = select;
            const columnName = checkbox.dataset.columnName;
            this.state.columnVisibility[columnName] = select;
        });
    },

    /**
     * Apply column visibility settings
     */
    applyColumnVisibility: function () {
        console.log('Applying column visibility...');
        const checkboxes = document.querySelectorAll('#columnSelectorContent input[type="checkbox"]');
        
        console.log('Found checkboxes:', checkboxes.length);
        
        checkboxes.forEach(checkbox => {
            const columnName = checkbox.dataset.columnName;
            const isChecked = checkbox.checked;
            console.log(`Column: ${columnName}, Checked: ${isChecked}`);
            this.state.columnVisibility[columnName] = isChecked;
        });
        
        console.log('Column visibility state:', this.state.columnVisibility);
        
        // Debug: Check if entry data is preserved
        console.log('Local entries before re-render:', this.state.localEntries.length);
        if (this.state.localEntries.length > 0) {
            const firstEntry = this.state.localEntries[0];
            console.log('First entry valueDetails:', firstEntry.valueDetails);
        }
        
        // Re-render table with updated visibility
        this.renderTable(this.state.localEntries);
        this.renderHeaders();
        
        // Close modal
        document.getElementById('columnSelectorModal').style.display = 'none';
        
        UI.showToast('Column visibility updated');
    },

    /**
     * Check if a column should be visible
     */
    isColumnVisible: function (columnName) {
        // If no visibility settings exist, default to visible
        if (Object.keys(this.state.columnVisibility).length === 0) {
            // console.log(`Column ${columnName}: No visibility settings, defaulting to visible`);
            return true;
        }
        
        const isVisible = this.state.columnVisibility[columnName] !== false;
        console.log(`Column ${columnName}: Visible = ${isVisible}, State = ${this.state.columnVisibility[columnName]}`);
        return isVisible;
    },

    /**
     * Reset column visibility when switching templates
     */
    resetColumnVisibility: function () {
        this.state.columnVisibility = {};
    },

    // ============================================================
    // COLUMN HEADER CONTEXT MENU
    // ============================================================

    /**
     * Show context menu for column headers
     */
    showHeaderContextMenu: function (th, x, y) {
        console.log('showHeaderContextMenu called with:', { th, x, y });
        
        const menu = document.getElementById('headerContextMenu');
        console.log('Found headerContextMenu menu:', menu);
        
        const colId = th.dataset.colId;
        const colName = th.dataset.colName;
        
        console.log('Column info:', { colId, colName });
        
        // Store current column info
        this.state.currentColId = colId;
        this.state.currentColName = colName;
        
        // Check if column is currently in a group
        const columns = this.state.currentTemplate?.columns || [];
        const currentCol = columns.find(c => c.encoding_columns?.id === colId);
        const currentGroup = currentCol?.encoding_columns?.group_name;
        this.state.currentColGroup = currentGroup;
        
        // Show/hide group buttons based on current group status
        const addBtn = document.getElementById('hctxAddToGroup');
        const removeBtn = document.getElementById('hctxRemoveFromGroup');
        if (addBtn && removeBtn) {
            if (currentGroup) {
                addBtn.style.display = 'none';
                removeBtn.style.display = 'block';
            } else {
                addBtn.style.display = 'block';
                removeBtn.style.display = 'none';
            }
        }
        
        // Position menu
        menu.style.display = 'block';
        menu.style.top = y + 'px';
        menu.style.left = x + 'px';
        
        console.log('Menu positioned at:', { top: y, left: x });
        
        // Adjust position if menu goes off screen
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (x - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (y - rect.height) + 'px';
        }
    },

    /**
     * Handle "Compute Whole Column" from header context menu
     */
    handleHeaderComputeColumn: function () {
        if (!this.state.currentColName) return;
        
        console.log('Opening compute for whole column:', this.state.currentColName);
        
        // Set the current column for computation
        this.state.currentColName = this.state.currentColName;
        
        // Open the compute modal with header flag to disable cell selection
        this.openComputeModal(true);
        
        // Hide context menu
        document.getElementById('headerContextMenu').style.display = 'none';
    },

    /**
     * Handle "Rename Column" from header context menu
     */
    handleHeaderRenameColumn: function () {
        if (!this.state.currentColName) return;
        
        console.log('Renaming column:', this.state.currentColName);
        
        // Find the column header element and trigger rename
        const headerElement = document.querySelector(`th[data-col-name="${this.state.currentColName}"] .th-text`);
        if (headerElement) {
            // Trigger the existing rename functionality
            this.startColumnRename(headerElement);
        }
        
        // Hide context menu
        document.getElementById('headerContextMenu').style.display = 'none';
    },

    /**
     * Handle "Delete Column" from header context menu
     */
    handleHeaderDeleteColumn: function () {
        if (!this.state.currentColId) return;
        
        const columnName = this.state.currentColName;
        console.log('Deleting column:', columnName);
        
        // Call existing delete column functionality (which has its own confirmation)
        this.deleteColumn(this.state.currentColId, columnName);
        
        // Hide context menu
        document.getElementById('headerContextMenu').style.display = 'none';
    },

    /**
     * Toggle Entry Form visibility (collapse/expand)
     */
    toggleEntryForm: function () {
        const formSection = document.getElementById('dynamicForm');
        const toggleBtn = document.getElementById('toggleEntryFormBtn');
        
        if (!formSection || !toggleBtn) return;
        
        const isHidden = formSection.style.display === 'none';
        
        if (isHidden) {
            // Show form
            formSection.style.display = '';
            toggleBtn.textContent = '▼ Hide';
            toggleBtn.title = 'Hide Entry Form';
        } else {
            // Hide form
            formSection.style.display = 'none';
            toggleBtn.textContent = '▶ Show';
            toggleBtn.title = 'Show Entry Form';
        }
    },

    /**
     * Open the custom Add to Group modal
     */
    openAddToGroupModal: function () {
        if (!this.state.currentColId) return;
        
        const columnName = this.state.currentColName;
        const modal = document.getElementById('addToGroupModal');
        const messageEl = document.getElementById('addToGroupMessage');
        const inputEl = document.getElementById('groupNameInput');
        const existingGroupsEl = document.getElementById('existingGroupsList');
        
        // Set message
        messageEl.textContent = `Adding column "${columnName}" to group:`;
        
        // Clear input
        inputEl.value = '';
        
        // Get existing groups from current template columns
        const columns = this.state.currentTemplate?.columns || [];
        const existingGroups = [...new Set(columns
            .map(col => col.encoding_columns?.group_name)
            .filter(g => g))];
        
        // Show existing groups
        if (existingGroups.length > 0) {
            existingGroupsEl.innerHTML = `<strong>Existing groups:</strong> ${existingGroups.join(', ')}`;
        } else {
            existingGroupsEl.innerHTML = '';
        }
        
        // Show modal and hide context menu
        modal.style.display = 'block';
        document.getElementById('headerContextMenu').style.display = 'none';
        
        // Focus input
        setTimeout(() => inputEl.focus(), 100);
    },

    /**
     * Confirm adding column to group from modal
     */
    confirmAddToGroup: async function () {
        if (!this.state.currentColId) return;
        
        const columnName = this.state.currentColName;
        const inputEl = document.getElementById('groupNameInput');
        const groupName = inputEl.value.trim();
        
        if (!groupName) {
            UI.showToast('Please enter a group name', 'error');
            return;
        }
        
        // Get existing groups from current template columns
        const columns = this.state.currentTemplate?.columns || [];
        
        // GUARD: Check if a column with the same name already exists in the target group
        const duplicateInGroup = columns.find(col => 
            col.encoding_columns?.group_name === groupName &&
            col.encoding_columns?.column_name === columnName &&
            col.encoding_columns?.id !== this.state.currentColId
        );
        
        if (duplicateInGroup) {
            UI.showToast(`A column named "${columnName}" already exists in group "${groupName}". Each template cannot have duplicate columns in the same group.`, 'error');
            return;
        }
        
        try {
            // Update the column's group in the database
            await SupabaseService.updateColumnGroup(this.state.currentColId, groupName);
            
            // Close modal
            document.getElementById('addToGroupModal').style.display = 'none';
            
            // Refresh template data
            this.clearCache(this.state.currentTemplate.id);
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);
            
            // Re-render table
            this.renderAll();
            
            UI.showToast(`Column added to group "${groupName}"`, 'success');
        } catch (error) {
            console.error('Error updating column group:', error);
            UI.showToast('Failed to update column group: ' + error.message, 'error');
        }
    },

    /**
     * Handle "Remove from Group" from header context menu
     */
    handleHeaderRemoveFromGroup: async function () {
        if (!this.state.currentColId) return;
        
        const columnName = this.state.currentColName;
        const currentGroup = this.state.currentColGroup;
        
        console.log('Removing column from group:', columnName, 'Group:', currentGroup);
        
        if (!currentGroup) {
            UI.showToast('This column is not in a group', 'error');
            document.getElementById('headerContextMenu').style.display = 'none';
            return;
        }
        
        try {
            // Update the column's group in the database (set to null)
            await SupabaseService.updateColumnGroup(this.state.currentColId, null);
            
            // Refresh template data
            this.clearCache(this.state.currentTemplate.id);
            this.state.currentTemplate = await SupabaseService.getTemplate(this.state.currentTemplate.id);
            
            // Re-render table
            this.renderAll();
            
            UI.showToast(`Column removed from group "${currentGroup}"`, 'success');
        } catch (error) {
            console.error('Error removing column from group:', error);
            UI.showToast('Failed to remove column from group: ' + error.message, 'error');
        }
        
        // Hide context menu
        document.getElementById('headerContextMenu').style.display = 'none';
    },

    /**
     * Create a new entry in monitoring template based on encoding data
     */
    createMonitoringEntry: async function (monitoringTemplate, changedData, columnMappings) {
        try {
            // Create new entry in monitoring template and preserve a reference to the encoding entry
            const monitoringEntry = await SupabaseService.createEntry(
                monitoringTemplate.id,
                this.state.departmentId,
                changedData.entryId
            );

            // Map values from encoding to monitoring
            const monitoringValues = {};
            
            columnMappings.forEach(mapping => {
                const encodingColId = mapping.encodingColumn.encoding_columns.id;
                const monitoringColId = mapping.monitoringColumn.encoding_columns.id;
                
                // Get the value from changed data
                const value = changedData.values?.[encodingColId];
                if (value !== undefined && value !== null) {
                    monitoringValues[monitoringColId] = value;
                }
            });

            // Save the mapped values
            if (Object.keys(monitoringValues).length > 0) {
                await SupabaseService.updateEntryValues(monitoringEntry.id, monitoringValues);
                console.log(`Created monitoring entry ${monitoringEntry.id} in template ${monitoringTemplate.name}`);
            }
        } catch (error) {
            console.error('Error creating monitoring entry:', error);
        }
    },

    /**
     * Update existing entry in monitoring template
     */
    updateMonitoringEntry: async function (monitoringTemplate, changedData, columnMappings) {
        try {
            // Find corresponding monitoring entry for encoding entry
            const targetMonitoringEntry = await this.findCorrespondingMonitoringEntry(
                monitoringTemplate, 
                changedData.entryId, 
                columnMappings
            );

            if (!targetMonitoringEntry) {
                console.log(`No corresponding monitoring entry found for encoding entry ${changedData.entryId}`);
                // If no corresponding entry exists, create one
                await this.createMonitoringEntry(monitoringTemplate, changedData, columnMappings);
                return;
            }

            const monitoringValues = {};
            
            columnMappings.forEach(mapping => {
                const encodingColId = mapping.encodingColumn.encoding_columns.id;
                const monitoringColId = mapping.monitoringColumn.encoding_columns.id;
                
                // Get value from changed data
                const value = changedData.values?.[encodingColId];
                if (value !== undefined && value !== null) {
                    monitoringValues[monitoringColId] = value;
                }
            });

            // Save mapped values
            if (Object.keys(monitoringValues).length > 0) {
                await SupabaseService.updateEntryValues(targetMonitoringEntry.id, monitoringValues);
                console.log(`Updated monitoring entry ${targetMonitoringEntry.id} in template ${monitoringTemplate.name}`);
            }
        } catch (error) {
            console.error('Error updating monitoring entry:', error);
        }
    },

    /**
     * Find corresponding monitoring entry for an encoding entry
     * Uses row index matching as primary strategy
     */
    findCorrespondingMonitoringEntry: async function (monitoringTemplate, encodingEntryId, columnMappings, changedData = {}) {
        try {
            // First try direct reference matching using the source encoding entry id
            const referencedMonitoringEntry = await SupabaseService.getMonitoringEntryByReferenceNumber(
                monitoringTemplate.id,
                encodingEntryId
            );

            if (referencedMonitoringEntry) {
                console.log(`Found corresponding monitoring entry ${referencedMonitoringEntry.id} by reference number`);
                return referencedMonitoringEntry;
            }

            // Get all entries from both templates
            const encodingEntries = await SupabaseService.getEntries(this.state.currentTemplate.id);
            const monitoringEntries = await SupabaseService.getEntries(monitoringTemplate.id);

            // Find index of the encoding entry
            const encodingEntryIndex = encodingEntries.findIndex(entry => entry.id === encodingEntryId);
            
            if (encodingEntryIndex === -1) {
                console.log(`Encoding entry ${encodingEntryId} not found; using fallback values if available`);
                return await this.findMonitoringEntryByMatchingValues(monitoringTemplate, encodingEntryId, columnMappings, changedData);
            }

            // Match by row index (same position in both templates)
            const correspondingMonitoringEntry = monitoringEntries[encodingEntryIndex];
            
            if (correspondingMonitoringEntry) {
                console.log(`Found corresponding monitoring entry ${correspondingMonitoringEntry.id} at index ${encodingEntryIndex}`);
                return correspondingMonitoringEntry;
            }

            // If no exact index match, try to find by matching key column values
            return await this.findMonitoringEntryByMatchingValues(monitoringTemplate, encodingEntryId, columnMappings);
        } catch (error) {
            console.error('Error finding corresponding monitoring entry:', error);
            return null;
        }
    },

    /**
     * Find monitoring entry by matching key column values
     * Fallback method when index matching doesn't work
     */
    findMonitoringEntryByMatchingValues: async function (monitoringTemplate, encodingEntryId, columnMappings, changedData = {}) {
        try {
            // Get encoding entry details
            const encodingEntries = await SupabaseService.getEntries(this.state.currentTemplate.id);
            let encodingEntry = encodingEntries.find(entry => entry.id === encodingEntryId);
            
            if (!encodingEntry && changedData.entryValues) {
                encodingEntry = { id: encodingEntryId, values: changedData.entryValues };
            }
            
            if (!encodingEntry) return null;

            const monitoringEntries = await SupabaseService.getEntries(monitoringTemplate.id);

            // Try to find a monitoring entry with matching key values
            for (const monitoringEntry of monitoringEntries) {
                let matchCount = 0;
                let totalMatches = 0;

                columnMappings.forEach(mapping => {
                    const encodingColName = mapping.encodingColumn.encoding_columns.column_name;
                    const monitoringColName = mapping.monitoringColumn.encoding_columns.column_name;
                    
                    const encodingValue = encodingEntry.values?.[encodingColName];
                    const monitoringValue = monitoringEntry.values?.[monitoringColName];
                    
                    totalMatches++;
                    if (encodingValue === monitoringValue) {
                        matchCount++;
                    }
                });

                // If most values match, consider this the corresponding entry
                if (totalMatches > 0 && matchCount / totalMatches >= 0.7) {
                    console.log(`Found monitoring entry ${monitoringEntry.id} by value matching (${matchCount}/${totalMatches} matches)`);
                    return monitoringEntry;
                }
            }

            return null;
        } catch (error) {
            console.error('Error finding monitoring entry by matching values:', error); 
            return null;
        }
    },

    /**
     * Delete corresponding entry in monitoring template
     */
    deleteMonitoringEntry: async function (monitoringTemplate, changedData, columnMappings) {
        try {
            // Find corresponding monitoring entry for the deleted encoding entry
            const targetMonitoringEntry = await this.findCorrespondingMonitoringEntry(
                monitoringTemplate, 
                changedData.entryId, 
                columnMappings,
                changedData
            );

            if (!targetMonitoringEntry) {
                console.log(`No corresponding monitoring entry found for deleted encoding entry ${changedData.entryId}`);
                return;
            }

            // Delete the monitoring entry
            await SupabaseService.deleteEntry(targetMonitoringEntry.id);
            console.log(`Deleted monitoring entry ${targetMonitoringEntry.id} in template ${monitoringTemplate.name}`);
        } catch (error) {
            console.error('Error deleting monitoring entry:', error);
        }
    },

    //-----------------------------------------------------------------------------------------
    //------------function para mapunta agad sa last row------------------
    //-----------------------------------------------------------------------------------------

    // Add any additional functions here if needed
};

// Ensure AppCore is globally available
if (typeof window !== 'undefined') {
    window.AppCore = AppCore;
}
