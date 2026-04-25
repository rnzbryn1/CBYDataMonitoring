import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { DataService } from '../services/dataService';

const EntryForm = ({ templateId, templateName, departmentId, columns, onSave }) => {
  const [formData, setFormData] = useState({});
  const inputRefs = useRef({});
  const queryClient = useQueryClient();

  // Auto-focus first input when component mounts
  useEffect(() => {
    const firstInput = Object.values(inputRefs.current)[0];
    if (firstInput) {
      firstInput.focus();
    }
  }, [columns]);

  // Handle input change
  const handleChange = (columnId, value) => {
    setFormData(prev => ({
      ...prev,
      [columnId]: value
    }));
  };

  // Save entry mutation
  const saveMutation = useMutation({
    mutationFn: async (values) => {
      // Create entry
      const entry = await DataService.createEntry(templateId, departmentId);
      
      // Save values
      if (Object.keys(values).length > 0) {
        await DataService.updateEntryValues(entry.id, values);
      }
      
      return entry;
    },
    onSuccess: () => {
      // Clear form
      setFormData({});
      
      // Invalidate entries query
      queryClient.invalidateQueries({ queryKey: ['entries', templateId] });
      
      // Focus first input again
      const firstInput = Object.values(inputRefs.current)[0];
      if (firstInput) {
        firstInput.focus();
      }
      
      // Call onSave callback
      if (onSave) {
        onSave();
      }
      
      // Show success toast
      if (window.showToast) {
        window.showToast('Entry added successfully', 'success');
      }
    },
  });

  // Handle save
  const handleSave = () => {
    const nonEmptyValues = Object.fromEntries(
      Object.entries(formData).filter(([_, value]) => value && value.trim() !== '')
    );
    
    if (Object.keys(nonEmptyValues).length === 0) {
      alert('Please enter at least one field value');
      return;
    }
    
    saveMutation.mutate(nonEmptyValues);
  };

  // Handle clear
  const handleClear = () => {
    setFormData({});
    const firstInput = Object.values(inputRefs.current)[0];
    if (firstInput) {
      firstInput.focus();
    }
  };

  return (
    <div className="entry-form-section">
      <h3 id="entryFormTitle">{templateName ? `${templateName} Entry Form` : 'Entry Form'}</h3>
      <div id="dynamicForm" className="entry-form">
        {columns.map((col) => {
          const colDef = col.encoding_columns;
          const value = formData[colDef.id] || '';
          
          return (
            <div key={colDef.id} className="input-box">
              <label>{colDef.column_name}</label>
              <input
                ref={(el) => {
                  if (el) inputRefs.current[colDef.id] = el;
                }}
                type="text"
                id={`input_${colDef.id}`}
                data-column-id={colDef.id}
                data-column-name={colDef.column_name}
                placeholder={`Enter ${colDef.column_name}`}
                value={value}
                onChange={(e) => handleChange(colDef.id, e.target.value)}
              />
            </div>
          );
        })}
        <button 
          onClick={handleSave} 
          className="save-btn" 
          id="mainSaveBtn"
          disabled={saveMutation.isPending}
        >
          {saveMutation.isPending ? 'Saving...' : 'Save Record'}
        </button>
        <button 
          onClick={handleClear} 
          className="clear-btn"
          disabled={saveMutation.isPending}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default EntryForm;
