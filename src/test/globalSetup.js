/**
 * Global Test Setup
 * 
 * Runs once before all tests
 */

module.exports = async () => {
    // Set up global test environment
    process.env.NODE_ENV = 'test';
    
    // Disable console output during tests (unless debugging)
    if (!process.env.DEBUG_TESTS) {
        global.console.log = jest.fn();
        global.console.warn = jest.fn();
        global.console.error = jest.fn();
    }
    
    console.log('🧪 Setting up Kanban Board Extension tests...');
};