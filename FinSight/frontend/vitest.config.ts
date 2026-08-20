/**
 * Vitest Configuration for FinVest
 * 
 * PHASE 21: Adversarial Authority Validation
 * 
 * BUILD FAILS if authority tests fail.
 * This is mandatory - no exceptions.
 */

import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    
    // Include authority tests
    include: [
      'src/tests/**/*.test.ts',
      'src/tests/**/*.test.tsx'
    ],
    
    // Ensure authority tests are always run
    // These tests MUST pass for the build to succeed
    testTimeout: 30000,
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/core/**/*.ts',
        'src/ai/**/*.ts',
        'src/analysis/**/*.ts',
        'src/memory/**/*.ts',
        'src/execution/**/*.ts',
        'src/audit/**/*.ts'
      ],
      exclude: [
        'node_modules',
        'src/tests'
      ]
    },
    
    // Reporter configuration
    reporters: ['default', 'verbose'],
    
    // Fail fast on critical test failures
    bail: 1
  }
});

