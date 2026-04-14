// =====================================================
// SUPABASE SERVICE - Encoding & Monitoring Operations
// =====================================================
// Helper functions for database operations with the new schema

import { SUPABASE_CONFIG } from './config.js';

const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey);

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
          display_order
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
   * @returns {Promise<Object>} New column
   */
  async createColumn(departmentId, columnName, columnType = 'text', displayOrder = null, isRequired = false) {
    const { data, error } = await this.client
      .from('encoding_columns')
      .insert([{
        department_id: departmentId,
        column_name: columnName,
        column_type: columnType,
        display_order: displayOrder,
        is_required: isRequired
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
   * @returns {Promise<void>}
   */
  async updateEntryValues(entryId, values) {
    const updates = Object.entries(values).map(([columnId, value]) => ({
      entry_id: entryId,
      column_id: columnId,
      value: typeof value === 'number' ? null : String(value),
      value_number: typeof value === 'number' ? value : null,
      updated_at: new Date().toISOString()
    }));

    // Batch all upserts into ONE call instead of looping through each one
    if (updates.length > 0) {
      const { error } = await this.client
        .from('encoding_entry_values')
        .upsert(updates, { onConflict: 'entry_id,column_id' });
      
      if (error) throw error;
    }
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
   * @returns {Promise<Object>} New metric
   */
  async addMonitoringMetric(monitoringId, columnId, operationId, metricName) {
    const { data, error } = await this.client
      .from('monitoring_computed_metrics')
      .insert([{
        monitoring_id: monitoringId,
        column_id: columnId,
        operation_id: operationId,
        metric_name: metricName
      }])
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
      .select('value_number')
      .eq('column_id', columnId);
    
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
      .select('value_number')
      .eq('column_id', columnId);
    
    if (error) throw error;
    
    const sum = data.reduce((sum, row) => sum + (row.value_number || 0), 0);
    return sum / data.length;
  },

  /**
   * Compute COUNT for a column
   * @param {string} columnId
   * @returns {Promise<number>} Count of entries with value
   */
  async computeCount(columnId) {
    const { count, error } = await this.client
      .from('encoding_entry_values')
      .select('*', { count: 'exact', head: true })
      .eq('column_id', columnId)
      .not('value', 'is', null);
    
    if (error) throw error;
    return count;
  }
};
