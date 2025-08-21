/**
 * Comprehensive Test Suite for App Optimizations
 * Tests database operations, error handling, and performance improvements
 */
import { dataManager } from './dataManager.js';
import { ErrorHandler, FormValidator, loadingManager, Performance } from './utils.js';
import { supabase } from './supabaseClient.js';

class OptimizationTester {
    constructor() {
        this.testResults = [];
        this.performance = {};
    }

    log(message, type = 'info') {
        const timestamp = new Date().toISOString();
        const logEntry = { timestamp, message, type };
        this.testResults.push(logEntry);
        
        const style = {
            info: 'color: blue',
            success: 'color: green', 
            error: 'color: red',
            warning: 'color: orange'
        };
        
        console.log(`%c[${timestamp}] ${message}`, style[type] || style.info);
    }

    async runTest(name, testFn) {
        this.log(`Starting test: ${name}`, 'info');
        const start = performance.now();
        
        try {
            await testFn();
            const duration = performance.now() - start;
            this.performance[name] = duration;
            this.log(`✓ Test passed: ${name} (${duration.toFixed(2)}ms)`, 'success');
            return true;
        } catch (error) {
            const duration = performance.now() - start;
            this.performance[name] = duration;
            this.log(`✗ Test failed: ${name} - ${error.message} (${duration.toFixed(2)}ms)`, 'error');
            return false;
        }
    }

    async testDataManagerCaching() {
        // Test cache functionality
        const key = 'test-cache-key';
        const testData = { test: 'data', timestamp: Date.now() };
        
        dataManager.setCache(key, testData);
        const cachedData = dataManager.getCache(key);
        
        if (JSON.stringify(cachedData) !== JSON.stringify(testData)) {
            throw new Error('Cache data mismatch');
        }
        
        // Test cache expiry
        dataManager.setCache(key, testData, 1); // 1ms TTL
        await new Promise(resolve => setTimeout(resolve, 10));
        
        const expiredData = dataManager.getCache(key);
        if (expiredData !== null) {
            throw new Error('Cache should have expired');
        }
    }

    async testDataValidation() {
        // Test player validation
        const validPlayer = {
            name: 'Test Player',
            team: 'AEK',
            position: 'ST',
            value: 100000
        };
        
        const validation = dataManager.validateData('players', validPlayer);
        if (!validation.valid) {
            throw new Error(`Valid player failed validation: ${validation.errors.join(', ')}`);
        }
        
        // Test invalid player
        const invalidPlayer = {
            name: '', // Empty name
            team: 'INVALID', // Invalid team
            position: 'INVALID', // Invalid position
            value: -100 // Negative value
        };
        
        const invalidValidation = dataManager.validateData('players', invalidPlayer);
        if (invalidValidation.valid) {
            throw new Error('Invalid player should not pass validation');
        }
        
        if (invalidValidation.errors.length < 4) {
            throw new Error('Should have found 4 validation errors');
        }
    }

    async testFormValidation() {
        // Test email validation
        try {
            FormValidator.validateEmail('invalid-email');
            throw new Error('Should have thrown error for invalid email');
        } catch (error) {
            if (!error.message.includes('Ungültige E-Mail-Adresse')) {
                throw error;
            }
        }
        
        // Test valid email
        FormValidator.validateEmail('test@example.com');
        
        // Test number validation
        const num = FormValidator.validateNumber('123.45', 'Test Number', 0, 200);
        if (num !== 123.45) {
            throw new Error('Number validation failed');
        }
        
        // Test string validation
        const str = FormValidator.validateString('  Test String  ', 'Test String', 1, 20);
        if (str !== 'Test String') {
            throw new Error('String validation/sanitization failed');
        }
    }

    async testErrorHandling() {
        // Test error notification system
        const originalShowUserError = ErrorHandler.showUserError;
        let errorShown = false;
        
        ErrorHandler.showUserError = (message, type) => {
            errorShown = true;
            if (!message || !type) {
                throw new Error('Error notification missing parameters');
            }
        };
        
        ErrorHandler.showUserError('Test error', 'error');
        
        if (!errorShown) {
            throw new Error('Error notification was not shown');
        }
        
        // Restore original function
        ErrorHandler.showUserError = originalShowUserError;
    }

    async testLoadingManager() {
        // Test loading state management
        loadingManager.show('test-loading');
        
        if (!loadingManager.isLoading('test-loading')) {
            throw new Error('Loading state not set correctly');
        }
        
        loadingManager.hide('test-loading');
        
        if (loadingManager.isLoading('test-loading')) {
            throw new Error('Loading state not cleared correctly');
        }
    }

    async testPerformanceUtilities() {
        // Test debounce function
        let counter = 0;
        const debouncedFn = Performance.debounce(() => counter++, 50);
        
        // Call multiple times quickly
        debouncedFn();
        debouncedFn();
        debouncedFn();
        
        // Should only execute once after delay
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (counter !== 1) {
            throw new Error(`Debounce failed: expected 1, got ${counter}`);
        }
        
        // Test throttle function
        counter = 0;
        const throttledFn = Performance.throttle(() => counter++, 50);
        
        // Call multiple times quickly
        throttledFn();
        throttledFn();
        throttledFn();
        
        // Should execute immediately but then be throttled
        if (counter !== 1) {
            throw new Error(`Throttle failed: expected 1, got ${counter}`);
        }
    }

    async testDatabaseOperations() {
        // Test health check
        const isHealthy = await dataManager.healthCheck();
        if (!isHealthy) {
            throw new Error('Database health check failed');
        }
        
        // Test batch data loading (should not throw)
        try {
            const data = await dataManager.loadAllAppData();
            if (!data || typeof data !== 'object') {
                throw new Error('Batch data loading returned invalid data');
            }
        } catch (error) {
            // If this fails due to no authentication, that's acceptable for testing
            if (!error.message.includes('auth')) {
                throw error;
            }
        }
    }

    async testSanitization() {
        // Test input sanitization
        const maliciousInput = '<script>alert("xss")</script>Hello World';
        const sanitized = FormValidator.sanitizeInput(maliciousInput);
        
        if (sanitized.includes('<script>')) {
            throw new Error('Sanitization failed to remove script tags');
        }
        
        if (!sanitized.includes('Hello World')) {
            throw new Error('Sanitization removed legitimate content');
        }
    }

    async testCacheInvalidation() {
        // Test cache invalidation
        dataManager.setCache('test:players:1', { id: 1, name: 'Test' });
        dataManager.setCache('test:matches:1', { id: 1, score: '1-0' });
        dataManager.setCache('other:data', { id: 1, value: 'test' });
        
        // Invalidate specific pattern
        dataManager.invalidateCache('test:');
        
        if (dataManager.getCache('test:players:1') !== null) {
            throw new Error('Cache invalidation failed for players');
        }
        
        if (dataManager.getCache('test:matches:1') !== null) {
            throw new Error('Cache invalidation failed for matches');
        }
        
        if (dataManager.getCache('other:data') === null) {
            throw new Error('Cache invalidation affected unrelated data');
        }
    }

    async runAllTests() {
        this.log('🚀 Starting comprehensive optimization tests', 'info');
        
        const tests = [
            ['Data Manager Caching', () => this.testDataManagerCaching()],
            ['Data Validation', () => this.testDataValidation()],
            ['Form Validation', () => this.testFormValidation()],
            ['Error Handling', () => this.testErrorHandling()],
            ['Loading Manager', () => this.testLoadingManager()],
            ['Performance Utilities', () => this.testPerformanceUtilities()],
            ['Database Operations', () => this.testDatabaseOperations()],
            ['Input Sanitization', () => this.testSanitization()],
            ['Cache Invalidation', () => this.testCacheInvalidation()]
        ];
        
        let passed = 0;
        let failed = 0;
        
        for (const [name, testFn] of tests) {
            const success = await this.runTest(name, testFn);
            if (success) {
                passed++;
            } else {
                failed++;
            }
        }
        
        this.log(`\n📊 Test Results Summary:`, 'info');
        this.log(`✓ Passed: ${passed}`, 'success');
        this.log(`✗ Failed: ${failed}`, failed > 0 ? 'error' : 'info');
        this.log(`📈 Total Tests: ${passed + failed}`, 'info');
        
        // Performance summary
        this.log(`\n⚡ Performance Summary:`, 'info');
        Object.entries(this.performance).forEach(([test, duration]) => {
            const status = duration < 100 ? 'success' : duration < 500 ? 'warning' : 'error';
            this.log(`  ${test}: ${duration.toFixed(2)}ms`, status);
        });
        
        return { passed, failed, performance: this.performance, results: this.testResults };
    }
    
    generateReport() {
        const report = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.testResults.length,
                passed: this.testResults.filter(r => r.type === 'success').length,
                failed: this.testResults.filter(r => r.type === 'error').length,
            },
            performance: this.performance,
            details: this.testResults
        };
        
        return report;
    }
}

// Export for use in browser console or other modules
export async function runOptimizationTests() {
    const tester = new OptimizationTester();
    const results = await tester.runAllTests();
    
    console.log('\n📋 Detailed Test Report:', tester.generateReport());
    
    return results;
}

// Auto-run tests if this module is loaded directly
if (typeof window !== 'undefined') {
    window.runOptimizationTests = runOptimizationTests;
    console.log('Optimization tests loaded. Run window.runOptimizationTests() to execute all tests.');
}

export default OptimizationTester;