// =====================================================
// SUPABASE SERVICE - Encoding & Monitoring Operations
// =====================================================
// Helper functions for database operations with the new schema

import { SUPABASE_CONFIG } from './config.js';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

export { supabaseClient };

export const SupabaseService = {
  client: supabaseClient,

  // =====================================================
  // ENCODING TEMPLATES
  // =====================================================

  /**
   * Get all templates for a department
   * @param {number} departmentId
   * @returns {Promise<Array>} Array of templates
   */
  async getTemplates(departmentId) {
    const { data, error } = await this.client
      .from('encoding_templates')
      .select('*')
      .eq('department_id', departmentId)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  /**
   * Get a single template with all its columns
   * @param {string} templateId
   * @returns {Promise<Object>} Template with columns
   */
  async getTemplate(templateId) {
    const { data: template, error: templateError } = await this.client
      .from('encoding_templates')
      .select('*')
      .eq('id', templateId)
      .single();
    
    if (templateError) throw templateError;

    // Get template columns
    const { data: columns, error: columnError } = await this.client
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

  /**
   * Create a new template
   * @param {number} departmentId
   * @param {string} name
   * @param {string} description
   * @param {string} module
   * @returns {Promise<Object>} New template
   */
  async createTemplate(departmentId, name, description = null, module = 'General') {
    const { data, error } = await this.client
      .from('encoding_templates')
      .insert([{
        department_id: departmentId,
        name,
        description,
        module
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update a template
   * @param {string} templateId
   * @param {Object} updates
   * @returns {Promise<Object>} Updated template
   */
  async updateTemplate(templateId, updates) {
    const { data, error } = await this.client
      .from('encoding_templates')
      .update(updates)
      .eq('id', templateId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete a template (cascades to entries)
   * @param {string} templateId
   * @returns {Promise<void>}
   */
  async deleteTemplate(templateId) {
    // Delete monitoring computed metrics that reference this template as source
    const { error: metricsError } = await this.client
      .from('monitoring_computed_metrics')
      .delete()
      .eq('source_template_id', templateId);
    
    if (metricsError) throw metricsError;

    // Delete entries first (cascade delete their values)
    const { error: entriesError } = await this.client
      .from('encoding_entries')
      .delete()
      .eq('template_id', templateId);
    
    if (entriesError) throw entriesError;

    // Delete template columns
    const { error: colsError } = await this.client
      .from('encoding_template_columns')
      .delete()
      .eq('template_id', templateId);
    
    if (colsError) throw colsError;

    // Finally delete the template itself
    const { error: templateError } = await this.client
      .from('encoding_templates')
      .delete()
      .eq('id', templateId);
    
    if (templateError) throw templateError;
  },

  // =====================================================
  // ENCODING COLUMNS
  // =====================================================

  /**
   * Get all columns for a department
   * @param {number} departmentId
   * @returns {Promise<Array>} Array of columns
   */
  async getColumns(departmentId) {
    const { data, error } = await this.client
      .from('encoding_columns')
      .select('*')
      .eq('department_id', departmentId)
      .order('display_order', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  /**
   * Create a new column (reusable across templates)
   * @param {number} departmentId
   * @param {string} columnName
   * @param {string} columnType - 'text', 'number', 'date', 'decimal', 'boolean', 'select'
   * @param {number} displayOrder
   * @param {boolean} isRequired
   * @param {string} groupName - Optional group name for visual grouping (stored in parent_column_id field)
   * @returns {Promise<Object>} New or existing column
   */
  async createColumn(departmentId, columnName, columnType = 'text', displayOrder = null, isRequired = false, groupName = null) {
    // Trim column name to remove leading/trailing spaces
    columnName = columnName.trim();
    groupName = groupName ? groupName.trim() : null;

    // Check if column with same name AND same group already exists for this department
    // Allow duplicate column names if they are in different groups
    let query = this.client
      .from('encoding_columns')
      .select('*')
      .eq('department_id', departmentId)
      .eq('column_name', columnName);

    const { data: existingColumns, error: checkError } = await query;

    if (checkError) {
      throw checkError;
    }

    // Filter in application logic to handle null groups correctly
    const existingColumn = existingColumns?.find(col => {
      if (groupName) {
        return col.group_name === groupName;
      } else {
        return col.group_name === null || col.group_name === '';
      }
    });

    // If column exists with same name AND same group, return it
    if (existingColumn) {
      return existingColumn;
    }

    // Otherwise create new column
    const { data, error } = await this.client
      .from('encoding_columns')
      .insert([{
        department_id: departmentId,
        column_name: columnName,
        column_type: columnType,
        display_order: displayOrder,
        is_required: isRequired,
        group_name: groupName // Store group name in group_name field
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete a column
   * @param {string} columnId
   * @returns {Promise<void>}
   */
  async deleteColumn(columnId) {
    const { error } = await this.client
      .from('encoding_columns')
      .delete()
      .eq('id', columnId);
    
    if (error) throw error;
  },

  /**
   * Get columns from encoding templates only (for monitoring templates to reuse)
   * @param {number} departmentId
   * @returns {Promise<Array>} Array of columns from encoding templates
   */
  async getEncodingTemplateColumns(departmentId) {
    // First, get all encoding template IDs
    const { data: templates, error: templatesError } = await this.client
      .from('encoding_templates')
      .select('id')
      .eq('module', 'encoding')
      .eq('department_id', departmentId);
    
    if (templatesError) throw templatesError;
    
    if (!templates || templates.length === 0) {
      return [];
    }
    
    const templateIds = templates.map(t => t.id);
    
    // Then, get all columns from those templates
    const { data, error } = await this.client
      .from('encoding_template_columns')
      .select(`
        encoding_columns (
          id,
          column_name,
          column_type
        )
      `)
      .in('template_id', templateIds);
    
    if (error) throw error;
    
    // Extract unique columns
    const uniqueColumns = [];
    const seenIds = new Set();
    
    if (Array.isArray(data)) {
      data.forEach(item => {
        if (item.encoding_columns && !seenIds.has(item.encoding_columns.id)) {
          seenIds.add(item.encoding_columns.id);
          uniqueColumns.push(item.encoding_columns);
        }
      });
    }
    
    return uniqueColumns;
  },

  /**
   * Get encoding entries with values for a specific column
   * @param {number} departmentId
   * @param {string} columnId
   * @returns {Promise<Array>} Array of entries with values for the column
   */
  async getEncodingEntriesByColumn(departmentId, columnId) {
    // Get all encoding template IDs
    const { data: templates, error: templatesError } = await this.client
      .from('encoding_templates')
      .select('id')
      .eq('module', 'encoding')
      .eq('department_id', departmentId);
    
    if (templatesError) throw templatesError;
    
    if (!templates || templates.length === 0) {
      return [];
    }
    
    const templateIds = templates.map(t => t.id);
    
    // Get all entries from encoding templates
    const { data: entries, error: entriesError } = await this.client
      .from('encoding_entries')
      .select('id')
      .in('template_id', templateIds);
    
    if (entriesError) throw entriesError;
    
    if (!entries || entries.length === 0) {
      return [];
    }
    
    const entryIds = entries.map(e => e.id);
    
    // Get values for the specific column
    const { data: values, error: valuesError } = await this.client
      .from('encoding_entry_values')
      .select('entry_id, value, value_number')
      .eq('column_id', columnId)
      .in('entry_id', entryIds);
    
    if (valuesError) throw valuesError;
    
    return values || [];
  },

  /**
   * Copy data from encoding entries to monitoring entries for a specific column
   * @param {string} monitoringTemplateId
   * @param {string} columnId
   * @param {number} departmentId
   * @returns {Promise<number>} Number of entries updated
   */
  async copyColumnDataToMonitoring(monitoringTemplateId, columnId, departmentId) {
    // Get all encoding template IDs
    const { data: encodingTemplates, error: templatesError } = await this.client
      .from('encoding_templates')
      .select('id')
      .eq('module', 'encoding')
      .eq('department_id', departmentId);
    
    if (templatesError) throw templatesError;
    
    if (!encodingTemplates || encodingTemplates.length === 0) {
      return 0;
    }
    
    const encodingTemplateIds = encodingTemplates.map(t => t.id);
    
    // Find which encoding template this column belongs to
    const { data: templateColumn, error: templateError } = await this.client
      .from('encoding_template_columns')
      .select('template_id')
      .eq('column_id', columnId)
      .in('template_id', encodingTemplateIds)
      .limit(1)
      .single();
    
    if (templateError || !templateColumn) {
      // If column not found in any template, return 0
      return 0;
    }
    
    const sourceTemplateId = templateColumn.template_id;
    
    // Get all encoding entries from the specific template where the column exists
    // Order by created_at descending to match how encoding template displays entries
    const { data: allEncodingEntries, error: entriesError } = await this.client
      .from('encoding_entries')
      .select('id, created_at')
      .eq('template_id', sourceTemplateId)
      .order('created_at', { ascending: false });
    
    if (entriesError) throw entriesError;
    
    if (!allEncodingEntries || allEncodingEntries.length === 0) {
      return 0;
    }
    
    // Get values for the specific column from the specific template
    const encodingEntryIds = allEncodingEntries.map(e => e.id);
    const { data: values, error: valuesError } = await this.client
      .from('encoding_entry_values')
      .select('entry_id, value, value_number')
      .eq('column_id', columnId)
      .in('entry_id', encodingEntryIds);
    
    if (valuesError) throw valuesError;
    
    // Create a map of entry_id to value for easy lookup
    const valueMap = {};
    (values || []).forEach(v => {
      valueMap[v.entry_id] = {
        value: v.value,
        value_number: v.value_number
      };
    });
    
    // Get all monitoring entries ordered by created_at descending to match encoding order
    const { data: monitoringEntries, error: monitoringError } = await this.client
      .from('encoding_entries')
      .select('id, created_at')
      .eq('template_id', monitoringTemplateId)
      .order('created_at', { ascending: false });
    
    if (monitoringError) throw monitoringError;
    
    if (!monitoringEntries || monitoringEntries.length === 0) {
      // Create monitoring entries with matching created_at timestamps to preserve order
      const entriesToInsert = allEncodingEntries.map(encEntry => ({
        template_id: monitoringTemplateId,
        department_id: departmentId,
        status: 'draft',
        created_at: encEntry.created_at
      }));

      const { data: newEntries, error: createError } = await this.client
        .from('encoding_entries')
        .insert(entriesToInsert)
        .select();
      
      if (createError) throw createError;
      
      // Copy values from encoding entries to newly created monitoring entries
      const valuesToInsert = [];
      for (let i = 0; i < newEntries.length; i++) {
        const monitoringEntryId = newEntries[i].id;
        const encEntryId = allEncodingEntries[i].id;
        const encValue = valueMap[encEntryId];
        
        if (!encValue) continue; // Skip if no value for this column
        
        const valueData = {};
        if (encValue.value !== null) valueData.value = encValue.value;
        if (encValue.value_number !== null) valueData.value_number = encValue.value_number;
        
        valuesToInsert.push({
          entry_id: monitoringEntryId,
          column_id: columnId,
          ...valueData
        });
      }
      
      if (valuesToInsert.length > 0) {
        const { error: insertError } = await this.client
          .from('encoding_entry_values')
          .insert(valuesToInsert);
        
        if (insertError) throw insertError;
      }
      
      return valuesToInsert.length;
    } else {
      // Monitoring entries already exist, add values by position
      const valuesToInsert = [];
      const maxEntries = Math.min(monitoringEntries.length, allEncodingEntries.length);
      
      for (let i = 0; i < maxEntries; i++) {
        const monitoringEntryId = monitoringEntries[i].id;
        const encEntryId = allEncodingEntries[i].id;
        const encValue = valueMap[encEntryId];
        
        if (!encValue) continue; // Skip if no value for this column
        
        const valueData = {};
        if (encValue.value !== null) valueData.value = encValue.value;
        if (encValue.value_number !== null) valueData.value_number = encValue.value_number;
        
        valuesToInsert.push({
          entry_id: monitoringEntryId,
          column_id: columnId,
          ...valueData
        });
      }
      
      if (valuesToInsert.length > 0) {
        const { error: insertError } = await this.client
          .from('encoding_entry_values')
          .insert(valuesToInsert);
        
        if (insertError) throw insertError;
      }
      
      return valuesToInsert.length;
    }
  },

  // =====================================================
  // TEMPLATE-COLUMN MAPPINGS
  // =====================================================

  /**
   * Add a column to a template
   * @param {string} templateId
   * @param {string} columnId
   * @param {number} displayOrder
   * @param {boolean} isMandatory
   * @returns {Promise<Object>} New mapping
   */
  async addColumnToTemplate(templateId, columnId, displayOrder = null, isMandatory = false) {
    const { data, error } = await this.client
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

  /**
   * Remove a column from a template
   * @param {string} templateId
   * @param {string} columnId
   * @returns {Promise<void>}
   */
  async removeColumnFromTemplate(templateId, columnId) {
    // First, get all entry IDs for this template
    const { data: entries, error: entriesError } = await this.client
      .from('encoding_entries')
      .select('id')
      .eq('template_id', templateId);
    
    if (entriesError) {
      console.warn('Failed to fetch entries:', entriesError);
    } else if (entries && entries.length > 0) {
      // Delete all values for this column in those entries
      const entryIds = entries.map(e => e.id);
      const { error: valuesError } = await this.client
        .from('encoding_entry_values')
        .delete()
        .in('entry_id', entryIds)
        .eq('column_id', columnId);
      
      if (valuesError) {
        console.warn('Failed to delete column values:', valuesError);
        // Continue anyway to remove the column mapping
      }
    }
    
    // Then remove the column-template mapping
    const { error } = await this.client
      .from('encoding_template_columns')
      .delete()
      .eq('template_id', templateId)
      .eq('column_id', columnId);
    
    if (error) throw error;
  },

  // =====================================================
  // ENCODING ENTRIES (Documents)
  // =====================================================

  /**
   * Get all entries for a template WITH their values
   * @param {string} templateId
   * @param {string} status - 'draft', 'submitted', 'verified', 'archived'
   * @returns {Promise<Array>} Array of entries with values
   */
  async getEntries(templateId, status = null) {
    // Get all entries
    let query = this.client
      .from('encoding_entries')
      .select('*')
      .eq('template_id', templateId);
    
    if (status) {
      query = query.eq('status', status);
    }
    
    const { data: entries, error } = await query.order('created_at', { ascending: false });
    
    if (error) throw error;
    
    if (entries.length === 0) return [];

    // OPTIMIZATION: Fetch values in batches to avoid URL length limits
    // Supabase has a limit on .in() query parameter size, so chunk into batches of 200
    const entryIds = entries.map(e => e.id);
    const batchSize = 200;
    const allValues = [];

    for (let i = 0; i < entryIds.length; i += batchSize) {
      const batch = entryIds.slice(i, i + batchSize);
      const { data: batchValues, error: valuesError } = await this.client
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

    // Group values by entry_id for fast lookup
    const valuesByEntry = {};
    allValues.forEach(v => {
      if (!valuesByEntry[v.entry_id]) {
        valuesByEntry[v.entry_id] = [];
      }
      valuesByEntry[v.entry_id].push(v);
    });

    // Enrich entries with their values
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

  /**
   * Get a single entry with all its values
   * @param {string} entryId
   * @returns {Promise<Object>} Entry with values
   */
  async getEntry(entryId) {
    // Get entry
    const { data: entry, error: entryError } = await this.client
      .from('encoding_entries')
      .select('*')
      .eq('id', entryId)
      .single();
    
    if (entryError) throw entryError;

    // Get values
    const { data: values, error: valuesError } = await this.client
      .from('encoding_entry_values')
      .select(`
        id,
        column_id,
        value,
        value_number,
        encoding_columns (
          id,
          column_name,
          column_type
        )
      `)
      .eq('entry_id', entryId);
    
    if (valuesError) throw valuesError;

    // Convert to object format
    const valueObj = {};
    values.forEach(v => {
      valueObj[v.encoding_columns.column_name] = v.value || v.value_number;
    });

    return {
      ...entry,
      values: valueObj,
      valueDetails: values
    };
  },

  /**
   * Create a new entry
   * @param {string} templateId
   * @param {number} departmentId
   * @param {string} referenceNumber
   * @returns {Promise<Object>} New entry
   */
  async createEntry(templateId, departmentId, referenceNumber = null) {
    const { data, error } = await this.client
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

  /**
   * Create multiple entries in batch (for bulk imports)
   * @param {string} templateId
   * @param {number} departmentId
   * @param {number} count - Number of entries to create
   * @returns {Promise<Array>} Array of new entries
   */
  async createEntries(templateId, departmentId, count) {
    const entriesToInsert = Array.from({ length: count }, () => ({
      template_id: templateId,
      department_id: departmentId,
      status: 'draft'
    }));

    const { data, error } = await this.client
      .from('encoding_entries')
      .insert(entriesToInsert)
      .select();
    
    if (error) throw error;
    return data;
  },

  /**
   * Update entry values
   * @param {string} entryId
   * @param {Object} values - { columnId: value, ... }
   * @param {Object} cellColors - { columnId: color, ... } (optional)
   * @returns {Promise<void>}
   */
  async updateEntryValues(entryId, values, cellColors = null) {
    const updates = Object.entries(values).map(([columnId, value]) => {
      const update = {
        entry_id: entryId,
        column_id: columnId,
        value: typeof value === 'number' ? null : String(value),
        value_number: typeof value === 'number' ? value : null,
        updated_at: new Date().toISOString()
      };

      // Include cell color if provided for this column
      if (cellColors && cellColors[columnId]) {
        update.cell_color = cellColors[columnId];
      }

      return update;
    });

    // Batch all upserts into ONE call instead of looping through each one
    if (updates.length > 0) {
      const { error } = await this.client
        .from('encoding_entry_values')
        .upsert(updates, { onConflict: 'entry_id,column_id' });
      
      if (error) throw error;
    }
  },

  /**
   * Update cell color for specific cells
   * @param {Object} cellColors - { entryId_columnId: color, ... }
   * @returns {Promise<void>}
   */
  async updateCellColors(cellColors) {
    const updates = Object.entries(cellColors).map(([key, color]) => {
      const [entryId, columnId] = key.split('_');
      return {
        entry_id: entryId,
        column_id: columnId,
        cell_color: color,
        updated_at: new Date().toISOString()
      };
    });

    if (updates.length > 0) {
      const { error } = await this.client
        .from('encoding_entry_values')
        .upsert(updates, { onConflict: 'entry_id,column_id' });
      
      if (error) throw error;
    }
  },

  /**
   * Save column computation setting
   * @param {string} templateId
   * @param {string} columnId
   * @param {string} functionType - 'sum', 'average', 'max', 'min', 'count'
   * @param {string} displayPosition - 'top', 'bottom'
   */
  async saveColumnComputation(templateId, columnId, functionType, displayPosition = 'bottom') {
    const { error } = await this.client
      .from('column_computation')
      .upsert({
        template_id: templateId,
        column_id: columnId,
        function_type: functionType,
        display_position: displayPosition,
        updated_at: new Date().toISOString()
      }, { onConflict: 'template_id,column_id' });
    
    if (error) throw error;
  },

  /**
   * Get column computations for a template
   * @param {string} templateId
   * @returns {Promise<Array>} Array of column computation settings
   */
  async getColumnComputations(templateId) {
    const { data, error } = await this.client
      .from('column_computation')
      .select('*')
      .eq('template_id', templateId);
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete column computation for a template
   * @param {string} templateId
   * @param {string} columnId
   */
  async deleteColumnComputation(templateId, columnId) {
    const { error } = await this.client
      .from('column_computation')
      .delete()
      .eq('template_id', templateId)
      .eq('column_id', columnId);
    
    if (error) throw error;
  },

  /**
   * Change entry status
   * @param {string} entryId
   * @param {string} newStatus - 'draft', 'submitted', 'verified', 'archived'
   * @returns {Promise<Object>} Updated entry
   */
  async updateEntryStatus(entryId, newStatus) {
    const updates = {
      status: newStatus,
      updated_at: new Date().toISOString()
    };

    if (newStatus === 'verified') {
      updates.verified_at = new Date().toISOString();
    }

    const { data, error } = await this.client
      .from('encoding_entries')
      .update(updates)
      .eq('id', entryId)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete an entry (cascades to values)
   * @param {string} entryId
   * @returns {Promise<void>}
   */
  async deleteEntry(entryId) {
    const { error } = await this.client
      .from('encoding_entries')
      .delete()
      .eq('id', entryId);
    
    if (error) throw error;
  },

  /**
   * Delete multiple entries in batches to avoid URL length limits
   * @param {Array<string>} entryIds - Array of entry IDs to delete
   * @returns {Promise<void>}
   */
  async deleteEntries(entryIds) {
    if (!entryIds || entryIds.length === 0) return;

    // Batch deletions in chunks of 100 to avoid URL length limit
    const batchSize = 100;
    for (let i = 0; i < entryIds.length; i += batchSize) {
      const batch = entryIds.slice(i, i + batchSize);
      const { error } = await this.client
        .from('encoding_entries')
        .delete()
        .in('id', batch);
      
      if (error) throw error;
    }
  },

  // =====================================================
  // MONITORING DEFINITIONS
  // =====================================================

  /**
   * Get all monitoring definitions for a department
   * @param {number} departmentId
   * @returns {Promise<Array>} Array of monitoring definitions
   */
  async getMonitoringDefinitions(departmentId) {
    const { data, error } = await this.client
      .from('monitoring_definitions')
      .select(`
        *,
        monitoring_computed_metrics (
          id,
          metric_name,
          operation_id,
          column_id,
          computation_operations (
            operation_name,
            display_name
          ),
          encoding_columns (
            column_name
          )
        )
      `)
      .eq('department_id', departmentId)
      .eq('is_active', true)
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    return data;
  },

  /**
   * Create a monitoring definition
   * @param {number} departmentId
   * @param {string} name
   * @param {string} monitoringType - 'real-time', 'daily', 'weekly', 'monthly'
   * @param {string} description
   * @returns {Promise<Object>} New monitoring definition
   */
  async createMonitoringDefinition(departmentId, name, monitoringType = 'daily', description = null) {
    const { data, error } = await this.client
      .from('monitoring_definitions')
      .insert([{
        department_id: departmentId,
        name,
        monitoring_type: monitoringType,
        description,
        is_active: true
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Delete a monitoring definition
   * @param {string} monitoringId
   * @returns {Promise<void>}
   */
  async deleteMonitoringDefinition(monitoringId) {
    const { error } = await this.client
      .from('monitoring_definitions')
      .delete()
      .eq('id', monitoringId);
    
    if (error) throw error;
  },

  // =====================================================
  // MONITORING METRICS & AGGREGATIONS
  // =====================================================

  /**
   * Add a computed metric to monitoring
   * @param {string} monitoringId
   * @param {string} columnId - source column
   * @param {string} operationId - SUM, AVG, COUNT, etc.
   * @param {string} metricName
   * @param {string} sourceTemplateId - encoding template to pull data from
   * @returns {Promise<Object>} New metric
   */
  async addMonitoringMetric(monitoringId, columnId, operationId, metricName, sourceTemplateId) {
    const insertData = {
      monitoring_id: monitoringId,
      column_id: columnId,
      metric_name: metricName,
      source_template_id: sourceTemplateId
    };
    
    // Only include operation_id if it's provided (not null)
    if (operationId !== null && operationId !== undefined) {
      insertData.operation_id = operationId;
    }
    
    const { data, error } = await this.client
      .from('monitoring_computed_metrics')
      .insert([insertData])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  /**
   * Get computation result for a metric
   * @param {string} metricId
   * @returns {Promise<Object>} Latest aggregation
   */
  async getMetricResult(metricId) {
    const { data, error } = await this.client
      .from('monitoring_aggregations')
      .select('*')
      .eq('metric_id', metricId)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; // Ignore "not found" error
    return data;
  },

  /**
   * Store a computed metric result
   * @param {string} metricId
   * @param {number} computedValue
   * @param {Date} periodStart
   * @param {Date} periodEnd
   * @returns {Promise<Object>} New aggregation
   */
  async storeAggregation(metricId, computedValue, periodStart = null, periodEnd = null) {
    const { data, error } = await this.client
      .from('monitoring_aggregations')
      .insert([{
        metric_id: metricId,
        computed_value: computedValue,
        period_start: periodStart,
        period_end: periodEnd,
        computed_at: new Date().toISOString()
      }])
      .select()
      .single();
    
    if (error) throw error;
    return data;
  },

  // =====================================================
  // UTILITY FUNCTIONS
  // =====================================================

  /**
   * Get all computation operations
   * @returns {Promise<Array>} Available operations
   */
  async getOperations() {
    const { data, error } = await this.client
      .from('computation_operations')
      .select('*')
      .order('operation_name', { ascending: true });
    
    if (error) throw error;
    return data;
  },

  /**
   * Compute SUM for a column
   * @param {string} columnId
   * @param {string} templateId
   * @returns {Promise<number>} Sum value
   */
  async computeSum(columnId, templateId) {
    const { data, error } = await this.client
      .from('encoding_entry_values')
      .select('value_number, encoding_entries!inner(template_id)')
      .eq('column_id', columnId)
      .eq('encoding_entries.template_id', templateId);
    
    if (error) throw error;
    
    return data.reduce((sum, row) => sum + (row.value_number || 0), 0);
  },

  /**
   * Compute AVERAGE for a column
   * @param {string} columnId
   * @param {string} templateId
   * @returns {Promise<number>} Average value
   */
  async computeAverage(columnId, templateId) {
    const { data, error } = await this.client
      .from('encoding_entry_values')
      .select('value_number, encoding_entries!inner(template_id)')
      .eq('column_id', columnId)
      .eq('encoding_entries.template_id', templateId);
    
    if (error) throw error;
    
    const sum = data.reduce((sum, row) => sum + (row.value_number || 0), 0);
    return sum / data.length;
  },

  /**
   * Compute COUNT for a column
   * @param {string} columnId
   * @param {string} templateId
   * @returns {Promise<number>} Count of entries with value
   */
  async computeCount(columnId, templateId) {
    const { count, error } = await this.client
      .from('encoding_entry_values')
      .select('*, encoding_entries!inner(template_id)', { count: 'exact', head: true })
      .eq('column_id', columnId)
      .eq('encoding_entries.template_id', templateId)
      .not('value', 'is', null);
    
    if (error) throw error;
    return count;
  }
};
