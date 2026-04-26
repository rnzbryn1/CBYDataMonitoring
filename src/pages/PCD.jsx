import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { DataService } from '../services/dataService';
import EditableTable from '../components/EditableTable';
import EntryForm from '../components/EntryForm';
import { useFormulas } from '../hooks/useFormulas';
import * as XLSX from 'xlsx';

const PCD = () => {
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [templateModal, setTemplateModal] = useState({ visible: false, name: '', description: '', type: 'encoding' });
  const [columnModal, setColumnModal] = useState({ visible: false, name: '', type: 'text', group: '', existingColumnId: '', selectedColumns: [], formulaType: 'SUM' });
  const [editModal, setEditModal] = useState({ visible: false, entryId: null, values: {} });
  const [computeModal, setComputeModal] = useState({ visible: false, formula: '', mode: 'cell', entryId: null, columnId: null });
  const [searchTerm, setSearchTerm] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle'); // idle, saving, saved
  const [deleteModal, setDeleteModal] = useState({ visible: false, templateId: null, templateName: '', templateType: 'encoding' });
  const [cardMenuOpen, setCardMenuOpen] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [encodingColumns, setEncodingColumns] = useState([]);
  const [isCopyingData, setIsCopyingData] = useState(false);
  const formulaInputRef = useRef(null);
  const departmentId = 1;
  const queryClient = useQueryClient();

  // Disable body scroll when any modal is open
  useEffect(() => {
    const anyModalOpen = computeModal.visible || editModal.visible || columnModal.visible || templateModal.visible || deleteModal.visible;
    if (anyModalOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }
  }, [computeModal.visible, editModal.visible, columnModal.visible, templateModal.visible, deleteModal.visible]);

  // Close card menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (cardMenuOpen && !e.target.closest('.category-card') && !e.target.closest('.card-dropdown')) {
        setCardMenuOpen(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [cardMenuOpen]);

  // Focus formula input when compute modal opens
  useEffect(() => {
    if (computeModal.visible && formulaInputRef.current) {
      formulaInputRef.current.focus();
    }
  }, [computeModal.visible]);

  // Fetch templates
  const { data: templates = [], isLoading: templatesLoading } = useQuery({
    queryKey: ['templates', departmentId],
    queryFn: () => DataService.getTemplates(departmentId),
  });

  // Fetch current template with columns
  const { data: currentTemplate, isLoading: templateLoading } = useQuery({
    queryKey: ['template', selectedTemplateId],
    queryFn: () => DataService.getTemplate(selectedTemplateId),
    enabled: !!selectedTemplateId,
  });

  // Fetch entries for selected template
  const { data: entries = [], isLoading: entriesLoading } = useQuery({
    queryKey: ['entries', selectedTemplateId],
    queryFn: () => DataService.getEntries(selectedTemplateId),
    enabled: !!selectedTemplateId,
  });

  const columns = currentTemplate?.columns || [];
  const isLoading = templateLoading || entriesLoading;

  // Update entry values mutation
  const updateEntryMutation = useMutation({
    mutationFn: ({ entryId, values, cellColors }) => DataService.updateEntryValues(entryId, values, cellColors),
    onMutate: async (variables) => {
      setSaveStatus('saving');
      // Cancel outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['entries', selectedTemplateId] });

      // Snapshot previous value
      const previousEntries = queryClient.getQueryData(['entries', selectedTemplateId]);

      // Optimistically update entry
      queryClient.setQueryData(['entries', selectedTemplateId], (old) => {
        if (!old) return old;
        return old.map(entry => {
          if (entry.id !== variables.entryId) return entry;
          
          const updatedEntry = { ...entry };
          
          // Update values
          if (variables.values) {
            Object.entries(variables.values).forEach(([columnId, value]) => {
              const col = columns.find(c => c.encoding_columns.id === columnId);
              if (col) {
                updatedEntry.values = {
                  ...updatedEntry.values,
                  [col.encoding_columns.column_name]: value
                };
              }
            });
          }
          
          // Update cell colors
          if (variables.cellColors) {
            const updatedValueDetails = [...(updatedEntry.valueDetails || [])];
            Object.entries(variables.cellColors).forEach(([columnId, color]) => {
              const existingIndex = updatedValueDetails.findIndex(v => v.column_id === columnId);
              if (existingIndex >= 0) {
                updatedValueDetails[existingIndex] = {
                  ...updatedValueDetails[existingIndex],
                  cell_color: color
                };
              } else {
                updatedValueDetails.push({
                  column_id: columnId,
                  cell_color: color,
                  value: null,
                  value_number: null
                });
              }
            });
            updatedEntry.valueDetails = updatedValueDetails;
          }
          
          return updatedEntry;
        });
      });

      return { previousEntries };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      queryClient.setQueryData(['entries', selectedTemplateId], context.previousEntries);
      setSaveStatus('idle');
    },
    onSettled: () => {
      // Refetch to ensure server state
      queryClient.invalidateQueries({ queryKey: ['entries', selectedTemplateId] });
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
  });

  // Generate column variables (A, B, C, etc.)
  const getColumnVariable = (columnName) => {
    const index = columns.findIndex(c => c.encoding_columns.column_name === columnName);
    if (index === -1) return '';
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let variable = '';
    let num = index;
    do {
      variable = letters[num % 26] + variable;
      num = Math.floor(num / 26) - 1;
    } while (num >= 0);
    return variable;
  };

  const {
    cellFormulas,
    columnFormulas,
    evaluateFormula,
    recalculateDependentFormulas,
    applyFormula,
    getFormula,
    convertFormulaToVariables,
    convertFormulaToColumnNames,
  } = useFormulas(columns, entries, getColumnVariable, updateEntryMutation, selectedTemplateId);

  // Delete entry mutation
  const deleteEntryMutation = useMutation({
    mutationFn: (entryId) => DataService.deleteEntry(entryId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entries', selectedTemplateId] });
      if (window.showToast) {
        window.showToast('Entry deleted successfully', 'success');
      }
    },
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: ({ name, description, type }) => DataService.createTemplate(departmentId, name, description, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', departmentId] });
      setTemplateModal({ visible: false, name: '', description: '', type: 'encoding' });
      if (window.showToast) {
        window.showToast('Template created successfully', 'success');
      }
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: ({ templateId, type }) => DataService.deleteTemplate(templateId, type),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['templates', departmentId] });
      setDeleteModal({ visible: false, templateId: null, templateName: '', templateType: 'encoding' });
      setCardMenuOpen(null);
      if (window.showToast) {
        window.showToast('Template deleted successfully', 'success');
      }
    },
  });

  // Add column mutation
  const addColumnMutation = useMutation({
    mutationFn: async ({ name, type, group, existingColumnId, templateType }) => {
      if (!currentTemplate) throw new Error('No template selected');

      let columnId;
      let newDisplayOrder;

      if (templateType === 'monitoring') {
        // For monitoring templates: select existing column from encoding
        if (!existingColumnId) throw new Error('Please select a column from encoding templates');

        // Check if column already exists in current template
        const existingColumn = currentTemplate.columns?.find(
          col => col.encoding_columns.id === existingColumnId
        );
        if (existingColumn) {
          throw new Error('This column is already added to the template');
        }

        // Calculate display order to add at the end
        const existingColumns = currentTemplate.columns || [];
        const maxDisplayOrder = existingColumns.length > 0
          ? Math.max(...existingColumns.map(col => col.display_order || 0))
          : 0;
        newDisplayOrder = maxDisplayOrder + 1;
        columnId = existingColumnId;
      } else {
        // For encoding templates: create new column
        if (!name) throw new Error('Column name is required');

        // Calculate display order to add column within the group or at the end
        const existingColumns = currentTemplate.columns || [];

        if (group) {
          // Find the last column in the specified group
          const groupColumns = existingColumns.filter(col => col.encoding_columns.group_name === group);
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
        const column = await DataService.createColumn(
          departmentId,
          name,
          type,
          newDisplayOrder,
          false, // isRequired
          group // Use group name instead of parent_column_id
        );
        columnId = column.id;
      }

      // Add to current template with display order
      await DataService.addColumnToTemplate(
        currentTemplate.id,
        columnId,
        newDisplayOrder
      );

      return { success: true };
    },
    onSuccess: async (data, variables) => {
      // Invalidate queries to refresh columns
      queryClient.invalidateQueries({ queryKey: ['template', selectedTemplateId] });
      
      setColumnModal({ visible: false, name: '', type: 'text', group: '', existingColumnId: '', selectedColumns: [], formulaType: 'SUM' });
      if (window.showToast) {
        window.showToast('Column added successfully', 'success');
      }
    },
    onError: (error) => {
      console.error('Failed to add column:', error);
      if (window.showToast) {
        window.showToast('Failed to add column: ' + error.message, 'error');
      }
    },
  });

  // Delete column mutation
  const deleteColumnMutation = useMutation({
    mutationFn: (columnId) => DataService.removeColumnFromTemplate(selectedTemplateId, columnId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['template', selectedTemplateId] });
      if (window.showToast) {
        window.showToast('Column deleted successfully', 'success');
      }
    },
  });

  const selectTemplate = (templateId) => {
    setSelectedTemplateId(templateId);
  };

  // Open column modal and load encoding columns if monitoring template
  const openColumnModal = async () => {
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;

    if (template.type === 'monitoring') {
      try {
        const cols = await DataService.getEncodingTemplateColumns(departmentId);
        setEncodingColumns(cols);
      } catch (error) {
        console.error('Failed to load encoding columns:', error);
        setEncodingColumns([]);
      }
    }

    setColumnModal({ visible: true, name: '', type: 'text', group: '', existingColumnId: '' });
  };

  // Generate color based on template name
  const getCardColor = (name) => {
    const colors = [
      '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
      '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const handleCellEdit = (entryId, columnId, value) => {
    // Check if value actually changed
    const entry = entries.find(e => e.id === entryId);
    if (!entry) return;

    const col = columns.find(c => c.encoding_columns.id === columnId);
    if (!col) return;

    const currentValue = entry.values?.[col.encoding_columns.column_name];
    
    // Only update if value changed
    if (currentValue !== value) {
      updateEntryMutation.mutate({
        entryId,
        values: { [columnId]: value },
      });

      // Then, recalculate dependent formulas
      recalculateDependentFormulas(columnId);
    }
  };

  const handleDeleteRow = (entryId) => {
    deleteEntryMutation.mutate(entryId);
  };

  const handleDeleteColumn = (columnId) => {
    deleteColumnMutation.mutate(columnId);
  };

  const handleEditEntry = (entryId) => {
    const entry = entries.find(e => e.id === entryId);
    if (entry) {
      const values = {};
      columns.forEach(col => {
        values[col.encoding_columns.id] = entry.values?.[col.encoding_columns.column_name] || '';
      });
      setEditModal({ visible: true, entryId, values });
    }
  };

  const handleSaveEditEntry = () => {
    if (!editModal.entryId) return;

    updateEntryMutation.mutate({
      entryId: editModal.entryId,
      values: editModal.values,
    });

    setEditModal({ visible: false, entryId: null, values: {} });
  };

  const handleEditValueChange = (columnId, value) => {
    setEditModal(prev => ({
      ...prev,
      values: {
        ...prev.values,
        [columnId]: value
      }
    }));
  };

  const handleExportToExcel = () => {
    if (!currentTemplate || entries.length === 0) {
      alert('No data to export');
      return;
    }

    // Create header row
    const header = columns.map(col => col.encoding_columns.column_name);

    // Create data rows
    const data = entries.map(entry => {
      return columns.map(col => {
        const value = entry.values?.[col.encoding_columns.column_name] || '';
        return value;
      });
    });

    // Combine header and data
    const finalData = [header, ...data];

    // Create worksheet
    const ws = XLSX.utils.aoa_to_sheet(finalData);

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Data');

    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `${currentTemplate.name}_${timestamp}.xlsx`;

    // Download
    XLSX.writeFile(wb, filename);
  };

  const handleCompute = (entryId, columnId) => {
    const col = columns.find(c => c.encoding_columns.id === columnId);
    if (!col) return;

    const columnName = col.encoding_columns.column_name;
    const currentFormula = getFormula(entryId, columnName);

    setComputeModal({
      visible: true,
      formula: currentFormula,
      mode: columnFormulas[columnName] ? 'column' : 'cell',
      entryId,
      columnId,
      columnName
    });
  };

  const handleApplyFormula = async () => {
    const { formula, mode, entryId, columnId, columnName } = computeModal;
    await applyFormula(formula, mode, entryId, columnId, columnName);
    setComputeModal({ visible: false, formula: '', mode: 'cell', entryId: null, columnId: null, columnName: null });
  };

  const handleApplyColor = (cellKeys, color) => {
    // Group by entryId and build cell colors map
    const entriesToUpdate = {};
    cellKeys.forEach(cellKey => {
      const [entryId, columnId] = cellKey.split('|');
      if (!entriesToUpdate[entryId]) {
        entriesToUpdate[entryId] = { values: {}, cellColors: {} };
      }
      entriesToUpdate[entryId].cellColors[columnId] = color;
      
      // Find the entry to preserve its current value
      const entry = entries.find(e => e.id === entryId);
      if (entry) {
        const valueDetail = entry.valueDetails?.find(v => v.column_id === columnId);
        if (valueDetail) {
          entriesToUpdate[entryId].values[columnId] = valueDetail.value || valueDetail.value_number;
        }
      }
    });

    // Update each entry with its cell colors
    Object.entries(entriesToUpdate).forEach(([entryId, data]) => {
      updateEntryMutation.mutate({ 
        entryId, 
        values: data.values, 
        cellColors: data.cellColors 
      });
    });
  };

  if (templatesLoading) {
    return <div className="container">Loading...</div>;
  }

  if (!selectedTemplateId) {
    return (
      <div className="container">
        <div className="header">
          <h1>Templates</h1>
          <button onClick={() => setTemplateModal({ visible: true, name: '', description: '', type: 'encoding' })}>+ New Template</button>
        </div>
        <h3>Select Template</h3>
        <div className="category-nav-wrapper">
          <input
            type="text"
            placeholder="Search templates..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="category-search"
          />
          {templates.length === 0 ? (
            <p>No templates found. Create a template to get started.</p>
          ) : (
            <div className="category-scroll-container">
              {templates
                .filter(template => {
                  if (!searchTerm) return true;
                  return template.name.toLowerCase().includes(searchTerm.toLowerCase());
                })
                .map(template => (
                  <div
                    key={template.id}
                    className={`category-card ${selectedTemplateId === template.id ? 'active' : ''}`}
                    onClick={() => selectTemplate(template.id)}
                    style={{ borderTop: `4px solid ${getCardColor(template.name)}` }}
                  >
                    <button
                      className="card-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        const rect = e.target.getBoundingClientRect();
                        setMenuPosition({ x: rect.right - 100, y: rect.top });
                        setCardMenuOpen(cardMenuOpen === template.id ? null : template.id);
                      }}
                    >
                      ⋮
                    </button>
                    {cardMenuOpen === template.id && createPortal(
                      <div 
                        className="card-dropdown"
                        style={{ 
                          position: 'fixed',
                          left: `${menuPosition.x}px`,
                          top: `${menuPosition.y}px`
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <button
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setDeleteModal({
                              visible: true,
                              templateId: template.id,
                              templateName: template.name,
                              templateType: template.type || 'encoding'
                            });
                            setCardMenuOpen(null);
                          }}
                        >
                          Delete
                        </button>
                      </div>,
                      document.body
                    )}
                    <span className="card-label">{template.name}</span>
                    <span className={`card-type-badge ${template.type || 'encoding'}`}>
                      {template.type || 'encoding'}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </div>

        {/* New Template Modal */}
        {templateModal.visible && (
          <div className="modal" style={{ display: 'block' }}>
            <div className="modal-content">
              <span className="close-btn" onClick={() => setTemplateModal({ visible: false, name: '', description: '', type: 'encoding' })}>&times;</span>
              <h3>New Template</h3>
              <input
                type="text"
                placeholder="Template name"
                value={templateModal.name}
                onChange={(e) => setTemplateModal({ ...templateModal, name: e.target.value })}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
              />
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Template Type</label>
              <select
                value={templateModal.type}
                onChange={(e) => setTemplateModal({ ...templateModal, type: e.target.value })}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
              >
                <option value="encoding">Encoding (data input source)</option>
                <option value="monitoring">Monitoring (compiled/computed data)</option>
              </select>
              <textarea
                placeholder="Description (optional)"
                value={templateModal.description}
                onChange={(e) => setTemplateModal({ ...templateModal, description: e.target.value })}
                style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px', minHeight: '80px' }}
              />
              <div className="modal-actions">
                <button onClick={() => setTemplateModal({ visible: false, name: '', description: '', type: 'encoding' })}>Cancel</button>
                <button onClick={() => createTemplateMutation.mutate({ name: templateModal.name, description: templateModal.description, type: templateModal.type })}>Create</button>
              </div>
            </div>
          </div>
        )}

        {/* Delete Template Modal */}
        {deleteModal.visible && (
          <div className="modal" style={{ display: 'block' }}>
            <div className="modal-content">
              <span className="close-btn" onClick={() => setDeleteModal({ visible: false, templateId: null, templateName: '', templateType: 'encoding' })}>&times;</span>
              <h3>Delete Template</h3>
              <p>Are you sure you want to delete "<strong>{deleteModal.templateName}</strong>"?</p>
              <p style={{ color: '#ef4444', fontSize: '14px' }}>This action cannot be undone and will delete all associated data.</p>
              <div className="modal-actions">
                <button onClick={() => setDeleteModal({ visible: false, templateId: null, templateName: '', templateType: 'encoding' })}>Cancel</button>
                <button 
                  onClick={() => deleteTemplateMutation.mutate({ templateId: deleteModal.templateId, type: deleteModal.templateType })}
                  style={{ backgroundColor: '#ef4444' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="container">
      <div className="header">
        <div className="header-left">
          <button onClick={() => setSelectedTemplateId(null)}>← Back to Templates</button>
          <h2>PCD</h2>
        </div>
      </div>

      {/* Entry Form - Separated from table - Only for encoding templates */}
      {selectedTemplateId && columns.length > 0 && currentTemplate?.type === 'encoding' && (
        <EntryForm
          templateId={selectedTemplateId}
          templateName={currentTemplate?.name}
          departmentId={departmentId}
          columns={columns}
          onSave={() => {
            // Optional: Show success message or perform other actions
          }}
        />
      )}

      <div className="table-section">
        <div className="table-header">
          <h3>Records</h3>
          <div className="table-header-right">
            {selectedTemplateId && (
              <>
                <button onClick={() => openColumnModal()}>+ Add Column</button>
                {columns.length > 0 && (
                  <button onClick={handleExportToExcel}>Export to Excel</button>
                )}
              </>
            )}
            <input
              type="text"
              placeholder="Search records..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="search-input"
            />
            {saveStatus !== 'idle' && (
              <span className={`save-indicator ${saveStatus}`}>
                {saveStatus === 'saving' ? 'Saving...' : 'Saved'}
              </span>
            )}
          </div>
        </div>
        {isLoading ? (
          <p>Loading...</p>
        ) : entries.length === 0 ? (
          <p>No records found.</p>
        ) : (
          <EditableTable
            columns={columns}
            entries={entries.filter(entry => {
              if (!searchTerm) return true;
              const searchLower = searchTerm.toLowerCase();
              return Object.values(entry.values || {}).some(value =>
                String(value).toLowerCase().includes(searchLower)
              );
            })}
            searchTerm={searchTerm}
            onCellEdit={currentTemplate?.type === 'encoding' ? handleCellEdit : undefined}
            onDeleteRow={currentTemplate?.type === 'encoding' ? handleDeleteRow : undefined}
            onApplyColor={handleApplyColor}
            onEditEntry={currentTemplate?.type === 'encoding' ? handleEditEntry : undefined}
            onCompute={handleCompute}
            onDeleteColumn={handleDeleteColumn}
            getColumnVariable={getColumnVariable}
            readOnly={currentTemplate?.type === 'monitoring'}
          />
        )}
      </div>

      {/* Add Column Modal */}
      {columnModal.visible && (
        <div className="modal" style={{ display: 'block' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setColumnModal({ visible: false, name: '', type: 'text', group: '', existingColumnId: '' })}>&times;</span>
            <h3>Add Column</h3>
            
            {/* Encoding Form */}
            {templates.find(t => t.id === selectedTemplateId)?.type !== 'monitoring' ? (
              <>
                <input
                  type="text"
                  placeholder="Column name"
                  value={columnModal.name}
                  onChange={(e) => setColumnModal({ ...columnModal, name: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
                />
                <select
                  value={columnModal.type}
                  onChange={(e) => setColumnModal({ ...columnModal, type: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
                >
                  <option value="text">Text</option>
                  <option value="number">Number</option>
                  <option value="date">Date</option>
                </select>
                <input
                  type="text"
                  placeholder="Group name (optional for header grouping)"
                  value={columnModal.group}
                  onChange={(e) => setColumnModal({ ...columnModal, group: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
                />
                <div className="modal-actions">
                  <button onClick={() => setColumnModal({ visible: false, name: '', type: 'text', group: '', existingColumnId: '' })}>Cancel</button>
                  <button onClick={() => addColumnMutation.mutate({ 
                    name: columnModal.name, 
                    type: columnModal.type, 
                    group: columnModal.group,
                    templateType: templates.find(t => t.id === selectedTemplateId)?.type || 'encoding'
                  })}>Add</button>
                </div>
              </>
            ) : (
              /* Monitoring Form - Select Existing Column */
              <>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Select Column from Encoding Templates</label>
                <select
                  value={columnModal.existingColumnId}
                  onChange={(e) => setColumnModal({ ...columnModal, existingColumnId: e.target.value })}
                  style={{ width: '100%', padding: '10px', marginBottom: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
                >
                  <option value="">-- Select a column --</option>
                  {encodingColumns.map(col => (
                    <option key={col.id} value={col.id}>
                      {col.column_name} ({col.column_type})
                    </option>
                  ))}
                </select>

                {encodingColumns.length === 0 && (
                  <p style={{ color: '#ef4444', fontSize: '14px', marginBottom: '10px' }}>
                    No columns found in encoding templates. Please create encoding templates first.
                  </p>
                )}

                <div className="modal-actions">
                  <button onClick={() => setColumnModal({ visible: false, name: '', type: 'text', group: '', existingColumnId: '' })}>Cancel</button>
                  <button 
                    onClick={() => addColumnMutation.mutate({ 
                      existingColumnId: columnModal.existingColumnId,
                      templateType: 'monitoring'
                    })}>Add</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Edit Entry Modal */}
      {editModal.visible && (
        <div className="modal" style={{ display: 'block' }}>
          <div className="modal-content">
            <span className="close-btn" onClick={() => setEditModal({ visible: false, entryId: null, values: {} })}>&times;</span>
            <h3>Edit Entry</h3>
            {columns.map(col => (
              <div key={col.id} style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>
                  {col.encoding_columns.column_name}
                </label>
                <input
                  type="text"
                  value={editModal.values[col.encoding_columns.id] || ''}
                  onChange={(e) => handleEditValueChange(col.encoding_columns.id, e.target.value)}
                  style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
                />
              </div>
            ))}
            <div className="modal-actions">
              <button onClick={() => setEditModal({ visible: false, entryId: null, values: {} })}>Cancel</button>
              <button onClick={handleSaveEditEntry}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Compute Modal */}
      {computeModal.visible && (
        <div className="modal" style={{ display: 'flex' }}>
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <span className="close-btn" onClick={() => setComputeModal({ visible: false, formula: '', mode: 'cell', entryId: null, columnId: null, columnName: null })}>&times;</span>
            <h3>Compute Formula</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Formula</label>
              <input
                ref={formulaInputRef}
                type="text"
                placeholder="=SUM(A, B, C)"
                value={computeModal.formula}
                onChange={(e) => setComputeModal(prev => ({ ...prev, formula: e.target.value }))}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Apply Mode</label>
              <select
                value={computeModal.mode}
                onChange={(e) => setComputeModal(prev => ({ ...prev, mode: e.target.value }))}
                style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '5px' }}
              >
                <option value="cell">Selected Cell</option>
                <option value="column">Whole Column</option>
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Column Variables</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {columns.map(col => (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => {
                      const variable = getColumnVariable(col.encoding_columns.column_name);
                      const input = formulaInputRef.current;
                      if (!input) return;

                      const start = input.selectionStart ?? input.value.length;
                      const end = input.selectionEnd ?? input.value.length;
                      const before = input.value.substring(0, start);
                      const after = input.value.substring(end);

                      // Check if inside a function (for comma instead of space)
                      const insideFunc = /\w+\([^()]*$/.test(before);
                      const insert = insideFunc
                        ? (before.endsWith('(') ? '' : ', ') + variable
                        : (before.trim() === '' ? '' : ' ') + variable;

                      const newFormula = before + insert + after;
                      setComputeModal(prev => ({ ...prev, formula: newFormula }));

                      // Use setTimeout to restore cursor position after React re-render
                      setTimeout(() => {
                        if (input) {
                          const newPos = start + insert.length;
                          input.selectionStart = input.selectionEnd = newPos;
                          input.focus();
                        }
                      }, 0);
                    }}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      background: '#f5f5f5',
                      cursor: 'pointer'
                    }}
                  >
                    {getColumnVariable(col.encoding_columns.column_name)} - {col.encoding_columns.column_name}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', fontWeight: 'bold' }}>Functions</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {['=SUM()', '=AVERAGE()', '=COUNT()', '=MIN()', '=MAX()'].map(func => (
                  <button
                    key={func}
                    type="button"
                    onClick={() => {
                      const input = formulaInputRef.current;
                      if (!input) return;

                      const start = input.selectionStart ?? input.value.length;
                      const end = input.selectionEnd ?? input.value.length;
                      const funcName = func.replace('()', '').trim();
                      const insert = `${funcName}()`;

                      const before = input.value.substring(0, start);
                      const after = input.value.substring(end);

                      const newFormula = before + insert + after;
                      setComputeModal(prev => ({ ...prev, formula: newFormula }));

                      // Use setTimeout to restore cursor position after React re-render
                      setTimeout(() => {
                        if (input) {
                          const pos = start + funcName.length + 1;
                          input.selectionStart = input.selectionEnd = pos;
                          input.focus();
                        }
                      }, 0);
                    }}
                    style={{
                      padding: '8px 12px',
                      border: '1px solid #ddd',
                      borderRadius: '4px',
                      background: '#f5f5f5',
                      cursor: 'pointer'
                    }}
                  >
                    {func}
                  </button>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button onClick={() => setComputeModal({ visible: false, formula: '', mode: 'cell', entryId: null, columnId: null, columnName: null })}>Cancel</button>
              <button onClick={handleApplyFormula}>Apply</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PCD;
