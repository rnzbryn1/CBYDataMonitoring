// Performance Testing Script
// Run this in browser console to test pagination performance

async function testPaginationPerformance() {
    console.log('🚀 Testing pagination performance...');
    
    const testCases = [
        { page: 1, description: 'First page' },
        { page: 10, description: 'Page 10' },
        { page: 50, description: 'Page 50' },
        { page: 100, description: 'Page 100' }
    ];
    
    for (const testCase of testCases) {
        const startTime = performance.now();
        
        try {
            const result = await SupabaseService.getEntries(
                AppCore.state.currentTemplateId,
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
}

// Test search/filter performance
async function testSearchPerformance() {
    console.log('🔍 Testing search performance...');
    
    const startTime = performance.now();
    
    try {
        const result = await SupabaseService.getEntries(
            AppCore.state.currentTemplateId,
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
}

// Run tests
console.log('🧪 Starting performance tests...');
testPaginationPerformance().then(() => {
    testSearchPerformance();
});
