import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

const EditableTable = ({ 
  columns, 
  entries, 
  searchTerm,
  onCellEdit, 
  onDeleteRow, 
  onApplyColor,
  onEditEntry,
  onCompute,
  onDeleteColumn,
  getColumnVariable,
  readOnly = false
}) => {
  const [selectedCells, setSelectedCells] = useState(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState(null);
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, entryId: null, columnId: null, isColumn: false });
  const [colorModal, setColorModal] = useState({ visible: false });
  const [columnWidths, setColumnWidths] = useState({});
  const [resizingColumn, setResizingColumn] = useState(null);
  const [resizeStartX, setResizeStartX] = useState(0);
  const [resizeStartWidth, setResizeStartWidth] = useState(0);
  const [copiedCells, setCopiedCells] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const tableBodyRef = useRef(null);
  const tableRef = useRef(null);

  const getCellKey = (entryId, columnId) => `${entryId}|${columnId}`;

  const getCellPosition = (td) => {
    const row = td.closest('tr');
    const rows = Array.from(tableBodyRef.current?.rows || []);
    const rowIndex = rows.indexOf(row);
    const cells = Array.from(row.querySelectorAll('td[contenteditable]'));
    const colIndex = cells.indexOf(td);
    return { rowIndex, colIndex };
  };

  const clearSelection = () => {
    setSelectedCells(new Set());
  };

  const applySelection = (startTd, endTd) => {
    if (!tableBodyRef.current) return;
    
    const start = getCellPosition(startTd);
    const end = getCellPosition(endTd);
    const minRow = Math.min(start.rowIndex, end.rowIndex);
    const maxRow = Math.max(start.rowIndex, end.rowIndex);
    const minCol = Math.min(start.colIndex, end.colIndex);
    const maxCol = Math.max(start.colIndex, end.colIndex);

    const newSelection = new Set();
    const rows = Array.from(tableBodyRef.current.rows);

    for (let r = minRow; r <= maxRow; r++) {
      if (!rows[r]) continue;
      const cells = Array.from(rows[r].querySelectorAll('td[contenteditable]'));
      for (let c = minCol; c <= maxCol; c++) {
        if (cells[c]) {
          const entryId = rows[r].dataset.entryId;
          const columnId = cells[c].dataset.columnId;
          newSelection.add(getCellKey(entryId, columnId));
        }
      }
    }

    setSelectedCells(newSelection);
  };

  const handleMouseDown = (e, entryId, columnId) => {
    // Don't clear selection on right-click
    if (e.button === 2) return;

    if (e.shiftKey && selectionStart) {
      const startTd = selectionStart;
      const endTd = e.target.closest('td');
      applySelection(startTd, endTd);
      e.preventDefault();
      return;
    }

    clearSelection();
    setIsSelecting(true);
    setSelectionStart(e.target.closest('td'));
    const cellKey = getCellKey(entryId, columnId);
    setSelectedCells(new Set([cellKey]));
  };

  const handleMouseOver = (e, entryId, columnId) => {
    if (!isSelecting || !selectionStart) return;
    const endTd = e.target.closest('td');
    if (endTd) {
      applySelection(selectionStart, endTd);
    }
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const handleKeyDown = (e) => {
    const target = e.target;
    const td = target.closest('td');
    
    if (!td) return;

    const row = td.closest('tr');
    const rows = Array.from(tableBodyRef.current?.rows || []);
    const rowIndex = rows.indexOf(row);
    const cells = Array.from(row.querySelectorAll('td[contenteditable]'));
    const colIndex = cells.indexOf(td);

    // Arrow key navigation
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      e.preventDefault();
      
      let nextRow = rowIndex;
      let nextCol = colIndex;

      if (e.key === 'ArrowUp') {
        nextRow = Math.max(0, rowIndex - 1);
      } else if (e.key === 'ArrowDown') {
        nextRow = Math.min(rows.length - 1, rowIndex + 1);
      } else if (e.key === 'ArrowLeft') {
        nextCol = Math.max(0, colIndex - 1);
      } else if (e.key === 'ArrowRight') {
        nextCol = Math.min(cells.length - 1, colIndex + 1);
      }

      const nextRowEl = rows[nextRow];
      if (nextRowEl) {
        const nextCells = Array.from(nextRowEl.querySelectorAll('td[contenteditable]'));
        const nextCell = nextCells[nextCol];
        if (nextCell) {
          nextCell.focus();
          // Select all text when navigating
          const range = document.createRange();
          range.selectNodeContents(nextCell);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }

    // Enter to save and move to next row
    if (e.key === 'Enter') {
      e.preventDefault();
      target.blur(); // This triggers the onBlur to save
      
      const nextRow = Math.min(rows.length - 1, rowIndex + 1);
      const nextRowEl = rows[nextRow];
      if (nextRowEl) {
        const nextCells = Array.from(nextRowEl.querySelectorAll('td[contenteditable]'));
        const nextCell = nextCells[colIndex];
        if (nextCell) {
          setTimeout(() => {
            nextCell.focus();
            const range = document.createRange();
            range.selectNodeContents(nextCell);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }, 0);
        }
      }
    }

    // Tab to move to next column
    if (e.key === 'Tab') {
      e.preventDefault();
      target.blur(); // This triggers the onBlur to save
      
      if (e.shiftKey) {
        // Shift+Tab: move to previous column
        const prevCol = Math.max(0, colIndex - 1);
        const prevCell = cells[prevCol];
        if (prevCell) {
          setTimeout(() => {
            prevCell.focus();
            const range = document.createRange();
            range.selectNodeContents(prevCell);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }, 0);
        }
      } else {
        // Tab: move to next column
        const nextCol = Math.min(cells.length - 1, colIndex + 1);
        const nextCell = cells[nextCol];
        if (nextCell) {
          setTimeout(() => {
            nextCell.focus();
            const range = document.createRange();
            range.selectNodeContents(nextCell);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }, 0);
        }
      }
    }

    // Delete key for selected cells
    if (e.key === 'Delete' && selectedCells.size > 0) {
      e.preventDefault();
      selectedCells.forEach(cellKey => {
        const [entryId, columnId] = cellKey.split('|');
        onCellEdit(entryId, columnId, '');
      });
      clearSelection();
    }

    // Ctrl+C for copy
    if (e.ctrlKey && e.key === 'c') {
      e.preventDefault();
      if (selectedCells.size > 0) {
        const cellData = [];
        selectedCells.forEach(cellKey => {
          const [entryId, columnId] = cellKey.split('|');
          const row = rows.find(r => r.dataset.entryId === entryId);
          if (row) {
            const cell = row.querySelector(`td[data-column-id="${columnId}"]`);
            if (cell) {
              cellData.push({
                entryId,
                columnId,
                value: cell.textContent
              });
            }
          }
        });
        setCopiedCells(cellData);
      } else if (td) {
        // Copy single cell
        const entryId = row.dataset.entryId;
        const columnId = td.dataset.columnId;
        setCopiedCells([{
          entryId,
          columnId,
          value: td.textContent
        }]);
      }
    }

    // Ctrl+V for paste
    if (e.ctrlKey && e.key === 'v' && copiedCells) {
      e.preventDefault();
      
      if (copiedCells.length === 1) {
        // Paste single cell to current position
        const { value } = copiedCells[0];
        const entryId = row.dataset.entryId;
        const columnId = td.dataset.columnId;
        
        // Save to undo stack before paste
        const oldValue = td.textContent;
        setUndoStack(prev => [...prev, { type: 'paste', entryId, columnId, oldValue, newValue: value }]);
        setRedoStack([]);
        
        onCellEdit(entryId, columnId, value);
      } else if (selectedCells.size > 0 && selectedCells.size === copiedCells.length) {
        // Paste multiple cells to selected cells
        const cellArray = Array.from(selectedCells);
        const changes = [];
        
        copiedCells.forEach((copied, index) => {
          if (cellArray[index]) {
            const [entryId, columnId] = cellArray[index].split('|');
            const rowEl = rows.find(r => r.dataset.entryId === entryId);
            if (rowEl) {
              const cellEl = rowEl.querySelector(`td[data-column-id="${columnId}"]`);
              if (cellEl) {
                changes.push({ entryId, columnId, oldValue: cellEl.textContent, newValue: copied.value });
              }
            }
          }
        });
        
        // Save to undo stack
        setUndoStack(prev => [...prev, { type: 'multi-paste', changes }]);
        setRedoStack([]);
        
        changes.forEach(({ entryId, columnId, newValue }) => {
          onCellEdit(entryId, columnId, newValue);
        });
      }
    }

    // Ctrl+Z for undo
    if (e.ctrlKey && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (undoStack.length > 0) {
        const lastAction = undoStack[undoStack.length - 1];
        
        if (lastAction.type === 'paste') {
          onCellEdit(lastAction.entryId, lastAction.columnId, lastAction.oldValue);
          setRedoStack(prev => [...prev, lastAction]);
        } else if (lastAction.type === 'multi-paste') {
          lastAction.changes.forEach(({ entryId, columnId, oldValue }) => {
            onCellEdit(entryId, columnId, oldValue);
          });
          setRedoStack(prev => [...prev, lastAction]);
        }
        
        setUndoStack(prev => prev.slice(0, -1));
      }
    }

    // Ctrl+Y or Ctrl+Shift+Z for redo
    if ((e.ctrlKey && e.key === 'y') || (e.ctrlKey && e.shiftKey && e.key === 'z')) {
      e.preventDefault();
      if (redoStack.length > 0) {
        const lastAction = redoStack[redoStack.length - 1];
        
        if (lastAction.type === 'paste') {
          onCellEdit(lastAction.entryId, lastAction.columnId, lastAction.newValue);
          setUndoStack(prev => [...prev, lastAction]);
        } else if (lastAction.type === 'multi-paste') {
          lastAction.changes.forEach(({ entryId, columnId, newValue }) => {
            onCellEdit(entryId, columnId, newValue);
          });
          setUndoStack(prev => [...prev, lastAction]);
        }
        
        setRedoStack(prev => prev.slice(0, -1));
      }
    }
  };

  const handleContextMenu = (e, entryId, columnId, isColumn = false) => {
    e.preventDefault();
    
    // Calculate position to keep menu within viewport
    const menuWidth = 160;
    const menuHeight = 200; // Approximate height
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Adjust if menu would go off right edge
    if (x + menuWidth > viewportWidth) {
      x = viewportWidth - menuWidth - 10;
    }
    
    // Adjust if menu would go off bottom edge
    if (y + menuHeight > viewportHeight) {
      y = viewportHeight - menuHeight - 10;
    }
    
    setContextMenu({
      visible: true,
      x,
      y,
      entryId,
      columnId,
      isColumn,
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ visible: false, x: 0, y: 0, entryId: null, columnId: null, isColumn: false });
  };

  const handleContextAction = (action) => {
    const { entryId, columnId, isColumn } = contextMenu;
    
    switch (action) {
      case 'edit':
        if (entryId) {
          onEditEntry(entryId);
        }
        break;
      case 'delete':
        if (isColumn && columnId) {
          onDeleteColumn(columnId);
        } else {
          // Delete all unique rows from selected cells
          if (selectedCells.size > 0) {
            const uniqueEntryIds = new Set();
            selectedCells.forEach(cellKey => {
              const [entryId] = cellKey.split('|');
              uniqueEntryIds.add(entryId);
            });
            uniqueEntryIds.forEach(id => onDeleteRow(id));
          } else if (entryId) {
            onDeleteRow(entryId);
          }
        }
        break;
      case 'compute':
        if (entryId && columnId) {
          onCompute(entryId, columnId);
        }
        break;
      case 'color':
        setColorModal({ visible: true });
        break;
      case 'clear':
        // Clear all selected cells
        if (selectedCells.size > 0) {
          selectedCells.forEach(cellKey => {
            const [entryId, columnId] = cellKey.split('|');
            onCellEdit(entryId, columnId, '');
          });
        } else if (entryId && columnId) {
          onCellEdit(entryId, columnId, '');
        }
        break;
    }
    
    closeContextMenu();
    clearSelection();
  };

  const applyCellColor = (color) => {
    console.log('Applying color:', color, 'to cells:', Array.from(selectedCells));
    onApplyColor(Array.from(selectedCells), color);
    setColorModal({ visible: false });
    clearSelection();
  };

  // Column resize handlers
  const handleResizeStart = (e, columnIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setResizingColumn(columnIndex);
    setResizeStartX(e.clientX);
    const currentWidth = columnWidths[columnIndex] || 150;
    setResizeStartWidth(currentWidth);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  const handleResizeMove = (e) => {
    if (resizingColumn === null) return;
    
    const deltaX = e.clientX - resizeStartX;
    const newWidth = Math.max(50, resizeStartWidth + deltaX);
    
    setColumnWidths(prev => ({
      ...prev,
      [resizingColumn]: newWidth
    }));
  };

  const handleResizeEnd = () => {
    if (resizingColumn !== null) {
      setResizingColumn(null);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
  };

  // Force re-render when color is applied
  useEffect(() => {
    if (!colorModal.visible) {
      // Modal closed, data should be refreshed
    }
  }, [colorModal.visible]);

  useEffect(() => {
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', closeContextMenu);
    document.addEventListener('mousemove', handleResizeMove);
    document.addEventListener('mouseup', handleResizeEnd);
    
    // Clear selection when clicking outside the table
    const handleClickOutside = (e) => {
      if (tableBodyRef.current && !tableBodyRef.current.contains(e.target)) {
        clearSelection();
      }
    };
    document.addEventListener('click', handleClickOutside);
    
    return () => {
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', closeContextMenu);
      document.removeEventListener('click', handleClickOutside);
      document.removeEventListener('mousemove', handleResizeMove);
      document.removeEventListener('mouseup', handleResizeEnd);
    };
  }, [selectedCells, selectionStart, isSelecting, resizingColumn]);

  // Render table headers with grouping support
  const renderTableHeaders = () => {
    let firstRow = [];
    let secondRow = [];
    let needsSecondRow = false;
    let currentGroup = null;
    let groupStartIndex = -1;

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i];
      const colDef = col.encoding_columns;
      const groupName = colDef.group_name || null;
      const variable = getColumnVariable(colDef.column_name);
      const width = columnWidths[i] || 150;

      if (groupName) {
        if (currentGroup !== groupName) {
          if (currentGroup !== null && groupStartIndex !== -1) {
            const groupLength = i - groupStartIndex;
            firstRow.push(<th key={`group-${groupStartIndex}`} colSpan={groupLength} className="group-header">{currentGroup}</th>);
          }
          currentGroup = groupName;
          groupStartIndex = i;
          needsSecondRow = true;
        }
      } else {
        if (currentGroup !== null && groupStartIndex !== -1) {
          const groupLength = i - groupStartIndex;
          firstRow.push(<th key={`group-${groupStartIndex}`} colSpan={groupLength} className="group-header">{currentGroup}</th>);
          currentGroup = null;
          groupStartIndex = -1;
        }
        firstRow.push(
          <th 
            key={`col-${col.id}`} 
            data-col-id={colDef.id} 
            rowSpan={2}
            style={{ width: `${width}px`, position: 'relative' }}
            onContextMenu={(e) => handleContextMenu(e, null, colDef.id, true)}
          >
            {variable} - {colDef.column_name}
            <div 
              className="resize-handle"
              onMouseDown={(e) => handleResizeStart(e, i)}
            />
          </th>
        );
      }
    }

    if (currentGroup !== null && groupStartIndex !== -1) {
      const groupLength = columns.length - groupStartIndex;
      firstRow.push(<th key={`group-${groupStartIndex}`} colSpan={groupLength} className="group-header">{currentGroup}</th>);
    }

    if (needsSecondRow) {
      for (let i = 0; i < columns.length; i++) {
        const col = columns[i];
        const colDef = col.encoding_columns;
        const groupName = colDef.group_name || null;
        const variable = getColumnVariable(colDef.column_name);
        const width = columnWidths[i] || 150;

        if (groupName) {
          secondRow.push(
            <th 
              key={`col-${col.id}`} 
              data-col-id={colDef.id}
              style={{ width: `${width}px`, position: 'relative' }}
              onContextMenu={(e) => handleContextMenu(e, null, colDef.id, true)}
            >
              {variable} - {colDef.column_name}
              <div 
                className="resize-handle"
                onMouseDown={(e) => handleResizeStart(e, i)}
              />
            </th>
          );
        }
      }
    }

    return (
      <thead>
        <tr>{firstRow}</tr>
        {needsSecondRow && <tr>{secondRow}</tr>}
      </thead>
    );
  };

  return (
    <>
      <table ref={tableRef}>
        {renderTableHeaders()}
        <tbody ref={tableBodyRef}>
          {entries.map(entry => (
            <tr key={entry.id} data-entry-id={entry.id}>
              {columns.map((col, colIndex) => {
                const value = entry.values?.[col.encoding_columns.column_name] || '';
                const cellKey = getCellKey(entry.id, col.encoding_columns.id);
                const isSelected = selectedCells.has(cellKey);
                const width = columnWidths[colIndex] || 150;
                
                // Check if cell matches search term
                const isHighlighted = searchTerm && String(value).toLowerCase().includes(searchTerm.toLowerCase());
                
                return (
                  <td
                    key={col.id}
                    data-column-id={col.encoding_columns.id}
                    contentEditable={!readOnly}
                    suppressContentEditableWarning
                    className={`${isSelected ? 'cell-selected' : ''} ${isHighlighted ? 'cell-highlighted' : ''}`}
                    style={{
                      width: `${width}px`,
                      ...(entry.valueDetails?.find(v => v.column_id === col.encoding_columns.id)?.cell_color ? 
                        { backgroundColor: entry.valueDetails.find(v => v.column_id === col.encoding_columns.id).cell_color } : {})
                    }}
                    onMouseDown={(e) => handleMouseDown(e, entry.id, col.encoding_columns.id)}
                    onMouseOver={(e) => handleMouseOver(e, entry.id, col.encoding_columns.id)}
                    onBlur={(e) => onCellEdit(entry.id, col.encoding_columns.id, e.target.textContent)}
                    onContextMenu={(e) => handleContextMenu(e, entry.id, col.encoding_columns.id)}
                  >
                    {value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Context Menu */}
      {contextMenu.visible && createPortal(
        <div
          className="context-menu"
          style={{ 
            position: 'fixed',
            left: contextMenu.x, 
            top: contextMenu.y 
          }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {contextMenu.isColumn ? (
            <>
              <button onMouseDown={() => handleContextAction('delete')} className="delete">Delete Column</button>
            </>
          ) : (
            <>
              <button onMouseDown={() => handleContextAction('edit')}>Edit Row</button>
              <button onMouseDown={() => handleContextAction('compute')}>Compute</button>
              <button onMouseDown={() => handleContextAction('color')}>Cell Color</button>
              <button onMouseDown={() => handleContextAction('clear')}>Clear Cell</button>
              <button onMouseDown={() => handleContextAction('delete')} className="delete">Delete Row</button>
            </>
          )}
        </div>,
        document.body
      )}

      {/* Color Modal */}
      {colorModal.visible && (
        <div className="modal" style={{ display: 'block' }}>
          <div className="modal-content color-modal">
            <span className="close-btn" onClick={() => setColorModal({ visible: false })}>&times;</span>
            <h3>Apply Color</h3>
            <div className="color-palette">
              {['#ffffff', '#ffeb3b', '#ff9800', '#f44336', '#9c27b0', '#2196f3', '#4caf50', '#795548'].map(color => (
                <div
                  key={color}
                  className="color-swatch"
                  style={{ backgroundColor: color }}
                  onClick={() => applyCellColor(color)}
                />
              ))}
            </div>
            <div className="modal-actions">
              <button onClick={() => setColorModal({ visible: false })}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default EditableTable;
