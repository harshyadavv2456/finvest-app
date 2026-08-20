/**
 * Debug Module Index
 * 
 * PHASE 36: System Reality Check (SRC)
 * PHASE 38.5: Reality Convergence & Deception Elimination
 * PHASE 39: Irreversibility & Shutdown Governance
 * PHASE 40: Institutional Freeze & External Verification
 * PHASE 41: External Hostility & Reality Validation
 * 
 * EXPORTS:
 * - SystemExecutionMap - Runtime probing
 * - AuthorityScenarioRunner - Kill-switch test harness
 * - EndToEndAuthorityWalkthrough - Full chain verification
 * - AuthorityCoverageProbe - Dead authority detection
 * - KillSwitchRealityTest - Worst-case silence verification
 * - ShutdownDemo - Kill-switch demonstration
 * - FinalProof - Non-regression proof
 * - HostilitySimulator - Hostile attack simulation
 * - ReplayIntegrityCheck - Determinism verification
 * - VerifyEverything - One command verification
 */

export {
  SystemExecutionMap,
  getSystemExecutionMap,
  type ExecutionPathResult,
  type SystemProbeResult,
  type SystemHealthStatus
} from './SystemExecutionMap';

export {
  AuthorityScenarioRunner,
  getAuthorityScenarioRunner,
  type ScenarioResult,
  type ScenarioRunResult
} from './AuthorityScenarioRunner';

export {
  EndToEndAuthorityWalkthrough,
  runEndToEndWalkthrough,
  type WalkthroughStep,
  type WalkthroughResult
} from './EndToEndAuthorityWalkthrough';

export {
  AuthorityCoverageProbe,
  runAuthorityCoverageProbe,
  type AuthorityModule,
  type CoverageResult
} from './AuthorityCoverageProbe';

export {
  KillSwitchRealityTest,
  runKillSwitchRealityTest,
  type KillSwitchState,
  type SilenceVerification,
  type KillSwitchTestResult
} from './KillSwitchRealityTest';

export {
  ShutdownDemo,
  runShutdownDemo,
  type DemoStep,
  type ShutdownDemoResult
} from './ShutdownDemo';

export {
  runRealityConvergence,
  type RealityConvergenceResult
} from './realityConvergence';

export {
  FinalProof,
  runFinalProof,
  type ProofCheck,
  type FinalProofResult
} from './FinalProof';

export {
  HostilitySimulator,
  runHostilitySimulation,
  type HostilityScenario,
  type HostilityResult
} from './HostilitySimulator';

export {
  ReplayIntegrityCheck,
  runReplayIntegrityCheck,
  type IntegrityCheckResult
} from './ReplayIntegrityCheck';

export {
  verifyEverything,
  type VerificationStep,
  type FullVerificationResult
} from './VerifyEverything';

