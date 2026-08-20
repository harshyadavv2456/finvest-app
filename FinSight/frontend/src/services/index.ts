/**
 * Services - API & External Integrations
 * 
 * Single source of truth for all external API calls.
 */

export { default as apiClient, api, withRetry, API_BASE_URL } from './apiClient';
export type { ApiError, RetryConfig } from './apiClient';

