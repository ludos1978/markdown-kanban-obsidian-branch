/**
 * Jest Configuration for Kanban Board Extension Tests
 */

module.exports = {
    // Test environment
    testEnvironment: 'jsdom',
    
    // Test file patterns
    testMatch: [
        '**/src/test/suite/**/*.test.js'
    ],
    
    // Setup files
    setupFilesAfterEnv: [
        '<rootDir>/src/test/setup.js'
    ],
    
    // Module paths
    moduleNameMapping: {
        '^@/(.*)$': '<rootDir>/src/$1'
    },
    
    // Coverage configuration
    collectCoverageFrom: [
        'src/html/**/*.js',
        '!src/html/**/*.min.js',
        '!src/test/**/*'
    ],
    
    coverageDirectory: 'coverage',
    
    coverageReporters: [
        'text',
        'lcov',
        'html'
    ],
    
    // Thresholds for coverage
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 80,
            lines: 80,
            statements: 80
        }
    },
    
    // Transform files
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    
    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/out/'
    ],
    
    // Verbose output
    verbose: true,
    
    // Global setup
    globalSetup: '<rootDir>/src/test/globalSetup.js',
    
    // Global teardown
    globalTeardown: '<rootDir>/src/test/globalTeardown.js',
    
    // Mock configuration
    clearMocks: true,
    restoreMocks: true,
    
    // Timeout
    testTimeout: 10000
};