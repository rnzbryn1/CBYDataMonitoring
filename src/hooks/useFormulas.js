import { useState, useEffect } from 'react';
import { DataService } from '../services/dataService';

export const useFormulas = (columns, entries, getColumnVariable, updateEntryMutation, templateId) => {
  const [cellFormulas, setCellFormulas] = useState({});
  const [columnFormulas, setColumnFormulas] = useState({});

  // Convert formula from column names to variables (for display)
  const convertFormulaToVariables = (formula) => {
    if (!formula) return formula;
    let convertedFormula = formula;
    columns.forEach(col => {
      const colName = col.encoding_columns.column_name;
      const variable = getColumnVariable(colName);
      if (variable) {
        const safeCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${safeCol}\\b`, 'g');
        convertedFormula = convertedFormula.replace(regex, variable);
      }
    });
    return convertedFormula;
  };

  // Convert formula from variables to column names (for storage)
  const convertFormulaToColumnNames = (formula) => {
    if (!formula) return formula;
    let convertedFormula = formula;
    columns.forEach(col => {
      const colName = col.encoding_columns.column_name;
      const variable = getColumnVariable(colName);
      if (variable) {
        const safeVar = variable.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`\\b${safeVar}\\b`, 'g');
        convertedFormula = convertedFormula.replace(regex, colName);
      }
    });
    return convertedFormula;
  };

  // Load formulas from database when template changes
  useEffect(() => {
    if (!templateId || !entries || entries.length === 0) {
      setCellFormulas({});
      setColumnFormulas({});
      return;
    }

    const loadFormulas = async () => {
      try {
        const formulas = await DataService.getFormulas(templateId);
        
        const loadedCellFormulas = {};
        const loadedColumnFormulas = {};

        formulas.forEach(f => {
          if (f.formula_type === 'cell' && f.entry_id) {
            const col = columns.find(c => c.encoding_columns.id === f.column_id);
            if (col) {
              const key = `${f.entry_id}|${col.encoding_columns.column_name}`;
              loadedCellFormulas[key] = f.formula;
            }
          } else if (f.formula_type === 'column' && !f.entry_id) {
            const col = columns.find(c => c.encoding_columns.id === f.column_id);
            if (col) {
              loadedColumnFormulas[col.encoding_columns.column_name] = f.formula;
            }
          }
        });

        setCellFormulas(loadedCellFormulas);
        setColumnFormulas(loadedColumnFormulas);

        // Recalculate all formulas immediately after loading
        // Collect all updates first
        const updates = [];

        // Apply column formulas first
        for (const [columnName, formula] of Object.entries(loadedColumnFormulas)) {
          const col = columns.find(c => c.encoding_columns.column_name === columnName);
          if (col) {
            entries.forEach(entry => {
              const result = evaluateFormula(formula, entry);
              if (result !== null) {
                updates.push({
                  entryId: entry.id,
                  values: { [col.encoding_columns.id]: result },
                });
              }
            });
          }
        }

        // Apply cell formulas
        for (const [key, formula] of Object.entries(loadedCellFormulas)) {
          const [entryId, columnName] = key.split('|');
          const entry = entries.find(e => e.id === entryId);
          const col = columns.find(c => c.encoding_columns.column_name === columnName);
          if (entry && col) {
            const result = evaluateFormula(formula, entry);
            if (result !== null) {
              updates.push({
                entryId,
                values: { [col.encoding_columns.id]: result },
              });
            }
          }
        }

        // Apply all updates to database directly
        for (const update of updates) {
          try {
            await DataService.updateEntryValues(update.entryId, update.values);
          } catch (error) {
            console.error('Failed to update computed value:', error);
          }
        }

        // Trigger a single refetch after all updates
        if (updates.length > 0) {
          // We'll let the parent component handle the refetch
          console.log(`Updated ${updates.length} computed cells`);
        }
      } catch (error) {
        console.error('Failed to load formulas:', error);
      }
    };

    loadFormulas();
  }, [templateId, entries]);

  const evaluateFormula = (formula, entry) => {
    if (!formula || !formula.startsWith('=')) return null;

    let evalExpr = formula.slice(1);

    // Replace column names with actual values
    columns.forEach(col => {
      const colName = col.encoding_columns.column_name;
      const raw = entry.values?.[colName];
      // Handle empty/blank values as 0
      const num = (raw === null || raw === undefined || raw === '') 
        ? 0 
        : parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
      const safeCol = colName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${safeCol}\\b`, 'g');
      evalExpr = evalExpr.replace(regex, num);
    });

    // Helper function to get values for function arguments
    const getVal = (arg) => {
      const clean = arg.trim();
      if (!isNaN(clean)) return parseFloat(clean);
      const raw = entry.values?.[clean] ?? '0';
      return parseFloat(String(raw).replace(/[^\d.-]/g, '')) || 0;
    };

    // Handle AVERAGE function
    evalExpr = evalExpr.replace(/AVERAGE\((.*?)\)/gi, (_, args) => {
      const vals = args.split(',').map(a => getVal(a));
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    });

    // Handle SUM function
    evalExpr = evalExpr.replace(/SUM\((.*?)\)/gi, (_, args) => {
      const vals = args.split(',').map(a => getVal(a));
      return vals.reduce((a, b) => a + b, 0);
    });

    // Handle COUNT function
    evalExpr = evalExpr.replace(/COUNT\((.*?)\)/gi, (_, args) => {
      const vals = args.split(',').map(a => {
        const clean = a.trim();
        if (!isNaN(clean)) return 1;
        const raw = entry.values?.[clean] ?? '';
        return raw !== null && raw !== '' ? 1 : 0;
      });
      return vals.reduce((a, b) => a + b, 0);
    });

    // Handle MIN function
    evalExpr = evalExpr.replace(/MIN\((.*?)\)/gi, (_, args) => {
      const vals = args.split(',').map(a => getVal(a));
      return Math.min(...vals);
    });

    // Handle MAX function
    evalExpr = evalExpr.replace(/MAX\((.*?)\)/gi, (_, args) => {
      const vals = args.split(',').map(a => getVal(a));
      return Math.max(...vals);
    });

    // Evaluate the expression
    try {
      // eslint-disable-next-line no-eval
      const result = eval(evalExpr);
      // Round to 2 decimal places
      return Math.round(result * 100) / 100;
    } catch (error) {
      console.error('Formula evaluation error:', error);
      return null;
    }
  };

  const recalculateDependentFormulas = (changedColumnId) => {
    const col = columns.find(c => c.encoding_columns.id === changedColumnId);
    if (!col) return;

    const columnName = col.encoding_columns.column_name;

    // Find all cell formulas that reference this column
    Object.entries(cellFormulas).forEach(([key, formula]) => {
      const [formulaEntryId, formulaColumnName] = key.split('|');
      
      // Check if the formula references the changed column (using column name, not variable)
      const safeColName = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${safeColName}\\b`, 'gi');
      if (regex.test(formula)) {
        const entry = entries.find(e => e.id === formulaEntryId);
        if (entry) {
          const formulaCol = columns.find(c => c.encoding_columns.column_name === formulaColumnName);
          if (formulaCol) {
            const result = evaluateFormula(formula, entry);
            if (result !== null) {
              updateEntryMutation.mutate({
                entryId: formulaEntryId,
                values: { [formulaCol.encoding_columns.id]: result },
              });
            }
          }
        }
      }
    });

    // Recalculate column formulas for this column
    Object.entries(columnFormulas).forEach(([formulaColumnName, formula]) => {
      const safeColName = columnName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${safeColName}\\b`, 'gi');
      if (regex.test(formula)) {
        const formulaCol = columns.find(c => c.encoding_columns.column_name === formulaColumnName);
        if (formulaCol) {
          entries.forEach(entry => {
            const result = evaluateFormula(formula, entry);
            if (result !== null) {
              updateEntryMutation.mutate({
                entryId: entry.id,
                values: { [formulaCol.encoding_columns.id]: result },
              });
            }
          });
        }
      }
    });
  };

  const applyFormula = async (formula, mode, entryId, columnId, columnName) => {
    // Convert formula from variables to column names for storage
    const convertedFormula = convertFormulaToColumnNames(formula);

    if (!convertedFormula || !convertedFormula.startsWith('=')) {
      alert('Formula must start with =');
      return;
    }

    // Conflict detection
    if (mode === 'cell') {
      // Check if there's an existing column formula for this column
      if (columnFormulas[columnName]) {
        alert('Cannot apply cell formula: This column already has a whole column formula applied. To update, you must use "Whole Column" mode or remove the existing column formula first.');
        return;
      }
    } else if (mode === 'column') {
      // Check if there are existing cell formulas for this column
      const existingCellFormulas = [];
      Object.keys(cellFormulas).forEach(key => {
        const [entryIdKey, colName] = key.split('|');
        if (colName === columnName) {
          existingCellFormulas.push({ entryId: entryIdKey, formula: cellFormulas[key] });
        }
      });

      if (existingCellFormulas.length > 0) {
        const confirmReplace = confirm(`Found ${existingCellFormulas.length} cell formula(s) in this column that will be replaced:\n\n${existingCellFormulas.slice(0, 3).map(f => `Row ${f.entryId.substring(0, 8)}: ${f.formula}`).join('\n')}${existingCellFormulas.length > 3 ? '\n...' : ''}\n\nDo you want to replace these cell formulas with the new column formula?`);
        if (!confirmReplace) {
          return; // User cancelled
        }
        // Remove all existing cell formulas for this column
        for (const cellFormula of existingCellFormulas) {
          const colDef = columns.find(c => c.encoding_columns.column_name === columnName);
          if (colDef) {
            try {
              await DataService.deleteCellFormula(templateId, cellFormula.entryId, colDef.encoding_columns.id);
            } catch (error) {
              console.error('Failed to delete cell formula:', error);
            }
          }
        }
        // Update local state
        setCellFormulas(prev => {
          const newFormulas = { ...prev };
          existingCellFormulas.forEach(f => {
            const key = `${f.entryId}|${columnName}`;
            delete newFormulas[key];
          });
          return newFormulas;
        });
      }
    }

    if (mode === 'cell') {
      // Apply to single cell
      const cellFormulaKey = `${entryId}|${columnName}`;
      setCellFormulas(prev => ({ ...prev, [cellFormulaKey]: convertedFormula }));

      // Save to database
      try {
        await DataService.saveCellFormula(templateId, entryId, columnId, convertedFormula);
      } catch (error) {
        console.error('Failed to save cell formula:', error);
      }

      // Calculate and update the cell value
      const entry = entries.find(e => e.id === entryId);
      if (entry) {
        const result = evaluateFormula(convertedFormula, entry);
        if (result !== null) {
          updateEntryMutation.mutate({
            entryId,
            values: { [columnId]: result },
          });
        }
      }

      // Recalculate dependent formulas
      setTimeout(() => recalculateDependentFormulas(columnId), 0);
    } else {
      // Apply to whole column
      setColumnFormulas(prev => ({ ...prev, [columnName]: convertedFormula }));

      // Save to database
      try {
        await DataService.saveColumnFormula(templateId, columnId, convertedFormula);
      } catch (error) {
        console.error('Failed to save column formula:', error);
      }

      // Calculate and update all cells in the column
      const updatePromises = [];
      entries.forEach(entry => {
        const result = evaluateFormula(convertedFormula, entry);
        if (result !== null) {
          updatePromises.push(
            new Promise((resolve) => {
              updateEntryMutation.mutate(
                {
                  entryId: entry.id,
                  values: { [columnId]: result },
                },
                {
                  onSuccess: () => resolve(),
                  onError: () => resolve(),
                }
              );
            })
          );
        }
      });

      // Wait for all updates to complete before recalculating dependents
      await Promise.all(updatePromises);

      // Recalculate dependent formulas
      setTimeout(() => recalculateDependentFormulas(columnId), 100);
    }
  };

  const getFormula = (entryId, columnName) => {
    const cellFormulaKey = `${entryId}|${columnName}`;
    const formula = cellFormulas[cellFormulaKey] || columnFormulas[columnName] || '';
    // Convert to variables for display
    return convertFormulaToVariables(formula);
  };

  const clearCellFormula = async (entryId, columnId, columnName) => {
    const cellFormulaKey = `${entryId}|${columnName}`;
    setCellFormulas(prev => {
      const newFormulas = { ...prev };
      delete newFormulas[cellFormulaKey];
      return newFormulas;
    });

    // Delete from database
    try {
      await DataService.deleteCellFormula(templateId, entryId, columnId);
    } catch (error) {
      console.error('Failed to delete cell formula:', error);
    }
  };

  const clearColumnFormula = async (columnId, columnName) => {
    setColumnFormulas(prev => {
      const newFormulas = { ...prev };
      delete newFormulas[columnName];
      return newFormulas;
    });

    // Delete from database
    try {
      await DataService.deleteColumnFormula(templateId, columnId);
    } catch (error) {
      console.error('Failed to delete column formula:', error);
    }
  };

  return {
    cellFormulas,
    columnFormulas,
    evaluateFormula,
    recalculateDependentFormulas,
    applyFormula,
    getFormula,
    clearCellFormula,
    clearColumnFormula,
    convertFormulaToVariables,
    convertFormulaToColumnNames,
  };
};
