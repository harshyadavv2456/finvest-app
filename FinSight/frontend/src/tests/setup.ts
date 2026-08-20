/**
 * Test Setup for FinVest
 * 
 * PHASE 21: Adversarial Authority Validation
 * 
 * This setup ensures all authority modules are initialized
 * before tests run.
 */

import { beforeAll, afterAll, vi } from 'vitest';

// Mock localStorage for tests
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock sessionStorage for tests
const sessionStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] || null
  };
})();

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock
});

// Setup before all tests
beforeAll(() => {
  console.log('');
  console.log('='.repeat(70));
  console.log('  FINVEST AUTHORITY TEST SUITE');
  console.log('  Phase 21: Adversarial Authority Validation');
  console.log('='.repeat(70));
  console.log('');
  console.log('These tests ATTACK the authority system to prove it fails CLOSED.');
  console.log('ALL tests MUST pass for the build to succeed.');
  console.log('');
});

// Cleanup after all tests
afterAll(() => {
  console.log('');
  console.log('='.repeat(70));
  console.log('  AUTHORITY VALIDATION COMPLETE');
  console.log('='.repeat(70));
  console.log('');
  
  // Clear all mocks
  vi.clearAllMocks();
  
  // Clear storage
  localStorage.clear();
  sessionStorage.clear();
});

