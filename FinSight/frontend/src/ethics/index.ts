/**
 * Ethics Module Index
 * 
 * PHASE 34: Execution Ethics Firewall (EEF)
 * 
 * EXPORTS ONLY:
 * - ExecutionEthicsFirewall
 * - EthicsGuard
 */

export {
  ExecutionEthicsFirewall,
  getExecutionEthicsFirewall,
  type EthicsVerdict,
  type EthicsContext,
  type EthicsPrinciple,
  type EthicsVerdictSeverity
} from './ExecutionEthicsFirewall';

export {
  EthicsGuard,
  ethicsGuard,
  EthicsContextBuilder
} from './EthicsGuard';

