// Data Generator for Performance Testing
// Generates thousands of sample records for testing pagination and caching

import { SUPABASE_CONFIG } from './config.js';
import { SupabaseService } from './supabase-service.js';

export const DataGenerator = {
    // Sample data pools for realistic data generation
    firstNames: ['Juan', 'Maria', 'Jose', 'Ana', 'Pedro', 'Rosa', 'Carlos', 'Sofia', 'Miguel', 'Isabella', 
                  'Antonio', 'Carmen', 'Francisco', 'Patricia', 'Luis', 'Gabriela', 'Manuel', 'Daniela', 'Roberto', 'Valeria'],
    lastNames: ['Santos', 'Reyes', 'Cruz', 'Garcia', 'Lopez', 'Martinez', 'Gonzalez', 'Rodriguez', 'Perez', 'Sanchez',
                'Ramirez', 'Torres', 'Flores', 'Rivera', 'Morales', 'Castillo', 'Diaz', 'Vargas', 'Jimenez', 'Mendoza'],
    
    departments: ['Sales', 'Marketing', 'IT', 'HR', 'Finance', 'Operations', 'Customer Service', 'R&D'],
    statuses: ['Active', 'Pending', 'Completed', 'On Hold', 'Cancelled'],
    
    products: ['Laptop', 'Desktop', 'Monitor', 'Keyboard', 'Mouse', 'Printer', 'Router', 'Switch', 'Server', 'Tablet'],
    
    cities: ['Manila', 'Quezon City', 'Cebu', 'Davao', 'Makati', 'Pasig', 'Taguig', 'Pasay', 'Caloocan', 'Bacoor'],
    
    // Generate random date within range
    randomDate(startYear = 2020, endYear = 2024) {
        const start = new Date(startYear, 0, 1);
        const end = new Date(endYear, 11, 31);
        const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
        return date.toISOString().split('T')[0]; // YYYY-MM-DD format
    },
    
    // Generate random number within range
    randomNumber(min, max, decimals = 0) {
        const num = Math.random() * (max - min) + min;
        return decimals > 0 ? parseFloat(num.toFixed(decimals)) : Math.floor(num);
    },
    
    // Generate random item from array
    randomChoice(array) {
        return array[Math.floor(Math.random() * array.length)];
    },
    
    // Generate random email
    randomEmail(firstName, lastName) {
        const domains = ['gmail.com', 'yahoo.com', 'outlook.com', 'company.com'];
        const domain = this.randomChoice(domains);
        return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
    },
    
    // Generate random phone number
    randomPhone() {
        return `09${Math.floor(Math.random() * 9000000000) + 1000000000}`;
    },
    
    // Generate sample data based on column types
    generateSampleData(columnName, columnType) {
        const firstName = this.randomChoice(this.firstNames);
        const lastName = this.randomChoice(this.lastNames);
        
        switch (columnType.toLowerCase()) {
            case 'text':
            case 'varchar':
                if (columnName.toLowerCase().includes('name')) {
                    return `${firstName} ${lastName}`;
                } else if (columnName.toLowerCase().includes('email')) {
                    return this.randomEmail(firstName, lastName);
                } else if (columnName.toLowerCase().includes('phone')) {
                    return this.randomPhone();
                } else if (columnName.toLowerCase().includes('address')) {
                    return `${this.randomNumber(1, 999)} ${this.randomChoice(['St', 'Ave', 'Blvd', 'Rd'])}, ${this.randomChoice(this.cities)}`;
                } else if (columnName.toLowerCase().includes('department')) {
                    return this.randomChoice(this.departments);
                } else if (columnName.toLowerCase().includes('status')) {
                    return this.randomChoice(this.statuses);
                } else if (columnName.toLowerCase().includes('product')) {
                    return this.randomChoice(this.products);
                } else {
                    return `Sample ${this.randomNumber(1000, 9999)}`;
                }
                
            case 'number':
            case 'integer':
                if (columnName.toLowerCase().includes('price') || columnName.toLowerCase().includes('cost')) {
                    return this.randomNumber(100, 10000, 2);
                } else if (columnName.toLowerCase().includes('quantity') || columnName.toLowerCase().includes('qty')) {
                    return this.randomNumber(1, 100);
                } else if (columnName.toLowerCase().includes('age')) {
                    return this.randomNumber(18, 65);
                } else {
                    return this.randomNumber(1, 100000);
                }
                
            case 'date':
                return this.randomDate();
                
            case 'boolean':
                return Math.random() > 0.5;
                
            default:
                return `Sample ${this.randomNumber(1000, 9999)}`;
        }
    },
    
    // Generate batch data for a template
    async generateBatchData(templateId, numRecords, batchSize = 50) {
        console.log(`🚀 Generating ${numRecords} records for template ${templateId}...`);
        
        try {
            // Get template structure
            const template = await SupabaseService.getTemplate(templateId);
            const columns = template.columns || [];
            
            console.log(`📋 Template has ${columns.length} columns`);
            
            const results = {
                success: 0,
                failed: 0,
                errors: []
            };
            
            // Generate in batches to avoid overwhelming the database
            for (let batch = 0; batch < Math.ceil(numRecords / batchSize); batch++) {
                const startIdx = batch * batchSize;
                const endIdx = Math.min(startIdx + batchSize, numRecords);
                const batchRecords = [];
                
                console.log(`📦 Processing batch ${batch + 1}: records ${startIdx + 1}-${endIdx}`);
                
                // Generate batch records
                for (let i = startIdx; i < endIdx; i++) {
                    const values = {};
                    
                    // Generate values for each column
                    columns.forEach(col => {
                        const colDef = col.encoding_columns;
                        if (colDef) {
                            values[colDef.id] = this.generateSampleData(colDef.column_name, colDef.column_type);
                        }
                    });
                    
                    batchRecords.push(values);
                }
                
                // Insert batch records
                try {
                    for (const values of batchRecords) {
                        try {
                            // Create entry
                            const entry = await SupabaseService.createEntry(templateId, 1);
                            
                            // Save values
                            if (Object.keys(values).length > 0) {
                                await SupabaseService.updateEntryValues(entry.id, values);
                            }
                            
                            results.success++;
                        } catch (error) {
                            results.failed++;
                            results.errors.push(`Record ${startIdx + results.success + results.failed}: ${error.message}`);
                        }
                    }
                    
                    console.log(`✅ Batch ${batch + 1} completed: ${results.success} success, ${results.failed} failed`);
                    
                    // Small delay to prevent overwhelming the database
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (error) {
                    console.error(`❌ Batch ${batch + 1} failed:`, error);
                    results.failed += (endIdx - startIdx);
                    results.errors.push(`Batch ${batch + 1}: ${error.message}`);
                }
            }
            
            console.log(`🎉 Generation completed!`);
            console.log(`✅ Success: ${results.success}`);
            console.log(`❌ Failed: ${results.failed}`);
            
            if (results.errors.length > 0) {
                console.log(`📝 Errors:`, results.errors.slice(0, 10)); // Show first 10 errors
            }
            
            return results;
            
        } catch (error) {
            console.error('❌ Data generation failed:', error);
            throw error;
        }
    },
    
    // Quick test with specific amounts
    async generateTestData(templateId, amount = 1000) {
        const amounts = {
            small: 100,
            medium: 1000,
            large: 5000,
            xlarge: 10000
        };
        
        const numRecords = amounts[amount] || amount;
        return await this.generateBatchData(templateId, numRecords);
    }
};

// Usage examples (run in browser console):
// DataGenerator.generateTestData('your-template-id', 'medium')  // 1000 records
// DataGenerator.generateTestData('your-template-id', 2500)     // 2500 records
// DataGenerator.generateBatchData('your-template-id', 5000, 100) // 5000 records in batches of 100
