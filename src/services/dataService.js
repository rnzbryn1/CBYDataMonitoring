import { supabaseClient } from './supabase';

export const DataService = {
  // =====================================================
  // ENCODING TEMPLATES
  // =====================================================

  async getTemplates(departmentId) {
    // Get all templates from encoding_templates table
    // The old system uses a 'module' field to distinguish encoding vs monitoring
    const { data: templates, error } = await supabaseClient
      .from('encoding_templates')
      .select('*')
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;

    // Map module field to type for consistency
    return (templates || []).map(t => ({
      ...t,
      type: t.module === 'monitoring' ? 'monitoring' : 'encoding'
    }));
  },

  async getTemplate(templateId) {
    const { data: template, error: templateError } = await supabaseClient
      .from('encoding_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    
    if (templateError) throw templateError;

    const { data: columns, error: columnError } = await supabaseClient
      .from('encoding_template_columns')
      .select(`
        id,
        display_order,
        is_mandatory,
        encoding_columns (
          id,
          column_name,
          column_type,
          is_required,
          display_order,
          group_name
        )
      `)
      .eq('template_id', templateId)
      .order('display_order', { ascending: true });
    
    if (columnError) throw columnError;

    return {
      ...template,
      columns: columns
    };
  },

  async createTemplate(departmentId, name, description = null, type = 'encoding', module = 'General') {
    const { data, error } = await supabaseClient
      .from('encoding_templates')
      .insert([{
        department_id: departmentId,
        name,
        description,
        module: type === 'monitoring' ? 'monitoring' : module
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async deleteTemplate(templateId, type = 'encoding') {
    // Delete entries
    const { error: entriesError } = await supabaseClient
      .from('encoding_entries')
      .delete()
      .eq('template_id', templateId);
    
    if (entriesError) throw entriesError;

    // Delete template columns
    const { error: colsError } = await supabaseClient
      .from('encoding_template_columns')
      .delete()
      .eq('template_id', templateId);
    
    if (colsError) throw colsError;

    // Delete template
    const { error: templateError } = await supabaseClient
      .from('encoding_templates')
      .delete()
      .eq('id', templateId);
    
    if (templateError) throw templateError;
  },

  // =====================================================
  // ENCODING COLUMNS
  // =====================================================

  async getColumns(departmentId) {
    const { data, error } = await supabaseClient
      .from('encoding_columns')
      .select('*')
      .eq('department_id', departmentId)
      .order('display_order', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  async getEncodingTemplateColumns(departmentId) {
    const { data, error } = await supabaseClient
      .from('encoding_columns')
      .select('*')
      .eq('department_id', departmentId)
      .order('column_name', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  async createColumn(departmentId, columnName, columnType = 'text', displayOrder = null, isRequired = false, groupName = null) {
    columnName = columnName.trim();
    groupName = groupName ? groupName.trim() : null;

    let query = supabaseClient
      .from('encoding_columns')
      .select('*')
      .eq('department_id', departmentId)
      .eq('column_name', columnName);

    const { data: existingColumns, error: checkError } = await query;

    if (checkError) throw checkError;

    const existingColumn = existingColumns?.find(col => {
      if (groupName) {
        return col.group_name === groupName;
      } else {
        return col.group_name === null || col.group_name === '';
      }
    });

    if (existingColumn) {
      return existingColumn;
    }

    const { data, error } = await supabaseClient
      .from('encoding_columns')
      .insert([{
        department_id: departmentId,
        column_name: columnName,
        column_type: columnType,
        display_order: displayOrder,
        is_required: isRequired,
        group_name: groupName
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async deleteColumn(columnId) {
    const { error } = await supabaseClient
      .from('encoding_columns')
      .delete()
      .eq('id', columnId);
    
    if (error) throw error;
  },

  // =====================================================
  // TEMPLATE-COLUMN MAPPINGS
  // =====================================================

  async addColumnToTemplate(templateId, columnId, displayOrder = null, isMandatory = false) {
    const { data, error } = await supabaseClient
      .from('encoding_template_columns')
      .insert([{
        template_id: templateId,
        column_id: columnId,
        display_order: displayOrder,
        is_mandatory: isMandatory
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async removeColumnFromTemplate(templateId, columnId) {
    const { data: entries, error: entriesError } = await supabaseClient
      .from('encoding_entries')
      .select('id')
      .eq('template_id', templateId);
    
    if (!entriesError && entries && entries.length > 0) {
      const entryIds = entries.map(e => e.id);
      await supabaseClient
        .from('encoding_entry_values')
        .delete()
        .in('entry_id', entryIds)
        .eq('column_id', columnId);
    }
    
    const { error } = await supabaseClient
      .from('encoding_template_columns')
      .delete()
      .eq('template_id', templateId)
      .eq('column_id', columnId);
    
    if (error) throw error;
  },

  // =====================================================
  // ENCODING ENTRIES
  // =====================================================

  async getEntries(templateId, status = null) {
    let query = supabaseClient
      .from('encoding_entries')
      .select('*')
      .eq('template_id', templateId);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: entries, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (entries.length === 0) return [];

    const entryIds = entries.map(e => e.id);
    const batchSize = 200;
    const allValues = [];

    for (let i = 0; i < entryIds.length; i += batchSize) {
      const batch = entryIds.slice(i, i + batchSize);
      const { data: batchValues, error: valuesError } = await supabaseClient
        .from('encoding_entry_values')
        .select(`
          id,
          entry_id,
          column_id,
          value,
          value_number,
          cell_color,
          encoding_columns (
            id,
            column_name,
            column_type
          )
        `)
        .in('entry_id', batch);
      
      if (valuesError) throw valuesError;
      allValues.push(...batchValues);
    }

    const valuesByEntry = {};
    allValues.forEach(v => {
      if (!valuesByEntry[v.entry_id]) {
        valuesByEntry[v.entry_id] = [];
      }
      valuesByEntry[v.entry_id].push(v);
    });

    const enrichedEntries = entries.map(entry => {
      const values = valuesByEntry[entry.id] || [];
      const valueObj = {};
      values.forEach(v => {
        valueObj[v.encoding_columns.column_name] = v.value || v.value_number;
      });
      
      return {
        ...entry,
        values: valueObj,
        valueDetails: values
      };
    });
    
    return enrichedEntries;
  },

  async createEntry(templateId, departmentId, referenceNumber = null) {
    const { data, error } = await supabaseClient
      .from('encoding_entries')
      .insert([{
        template_id: templateId,
        department_id: departmentId,
        reference_number: referenceNumber,
        status: 'draft'
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  async createEntries(templateId, departmentId, count) {
    const entriesToInsert = Array.from({ length: count }, () => ({
      template_id: templateId,
      department_id: departmentId,
      status: 'draft'
    }));

    const { data, error } = await supabaseClient
      .from('encoding_entries')
      .insert(entriesToInsert)
      .select();
    
    if (error) throw error;
    return data;
  },

  async updateEntryValues(entryId, values, cellColors = null) {
    const updates = [];

    // Process value updates
    Object.entries(values).forEach(([columnId, value]) => {
      const update = {
        entry_id: entryId,
        column_id: columnId,
        value: typeof value === 'number' ? null : String(value),
        value_number: typeof value === 'number' ? value : null,
        updated_at: new Date().toISOString()
      };

      if (cellColors && cellColors[columnId]) {
        update.cell_color = cellColors[columnId];
      }

      updates.push(update);
    });

    // Process color-only updates (for cells without values)
    if (cellColors) {
      Object.entries(cellColors).forEach(([columnId, color]) => {
        // Skip if already processed in values loop
        if (values[columnId] !== undefined) return;

        const update = {
          entry_id: entryId,
          column_id: columnId,
          value: null,
          value_number: null,
          cell_color: color,
          updated_at: new Date().toISOString()
        };

        updates.push(update);
      });
    }

    if (updates.length > 0) {
      const { error } = await supabaseClient
        .from('encoding_entry_values')
        .upsert(updates, { onConflict: 'entry_id,column_id' });
      
      if (error) throw error;
    }
  },

  async deleteEntry(entryId) {
    const { error } = await supabaseClient
      .from('encoding_entries')
      .delete()
      .eq('id', entryId);
    
    if (error) throw error;
  },

  // =====================================================
  // CELL AND COLUMN FORMULAS
  // =====================================================

  async saveCellFormula(templateId, entryId, columnId, formula) {
    const { error } = await supabaseClient
      .from('cell_formulas')
      .upsert({
        template_id: templateId,
        entry_id: entryId,
        column_id: columnId,
        formula: formula,
        formula_type: 'cell',
        updated_at: new Date().toISOString()
      }, { onConflict: 'template_id,entry_id,column_id' });
    
    if (error) throw error;
  },

  async saveColumnFormula(templateId, columnId, formula) {
    await supabaseClient
      .from('cell_formulas')
      .delete()
      .eq('template_id', templateId)
      .eq('column_id', columnId)
      .is('entry_id', null);

    const { error } = await supabaseClient
      .from('cell_formulas')
      .insert({
        template_id: templateId,
        entry_id: null,
        column_id: columnId,
        formula: formula,
        formula_type: 'column',
        updated_at: new Date().toISOString()
      });

    if (error) throw error;
  },

  async getFormulas(templateId) {
    const { data, error } = await supabaseClient
      .from('cell_formulas')
      .select('*')
      .eq('template_id', templateId);
    
    if (error) throw error;
    return data || [];
  },

  async deleteCellFormula(templateId, entryId, columnId) {
    const { error } = await supabaseClient
      .from('cell_formulas')
      .delete()
      .eq('template_id', templateId)
      .eq('entry_id', entryId)
      .eq('column_id', columnId);
    
    if (error) throw error;
  },

  async deleteColumnFormula(templateId, columnId) {
    const { error } = await supabaseClient
      .from('cell_formulas')
      .delete()
      .eq('template_id', templateId)
      .eq('column_id', columnId)
      .is('entry_id', null);
    
    if (error) throw error;
  },

  // =====================================================
  // DEPARTMENTS
  // =====================================================

  async getDepartments() {
    const { data, error } = await supabaseClient
      .from('departments')
      .select('*')
      .order('name', { ascending: true });
    
    if (error) throw error;
    return data;
  }
};
