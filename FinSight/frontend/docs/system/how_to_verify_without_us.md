# How To Verify Without Us

## PHASE 41: Cold Machine Verification

**Purpose:** A third party can verify this system without trusting the developers.

---

## Prerequisites

- Node.js 18+
- npm 9+
- Git

---

## One Command Verification

```bash
npm run verify:everything
```

**Expected output:** GREEN or RED

---

## Manual Step-by-Step

### 1. Clone and Install

```bash
git clone <repository>
cd FinSight/frontend
npm install
```

### 2. Run Authority Tests

```bash
npm run test:authority
```

**Expected:** All tests pass

**Proves:**
- Every authority layer exists
- Every guard throws on violation
- No forbidden exports exist
- Terminal states are terminal

### 3. Run Constitution Verification

```bash
npm run system:verify-constitution
```

**Expected:** `CONSTITUTION VERIFICATION PASSED`

**Proves:**
- Constitution hash matches code
- All authority modules present
- No tampering detected

### 4. Run Hostility Simulation

```bash
npm run system:hostility
```

**Expected:** `ALL HOSTILE ATTACKS REJECTED`

**Proves:**
- Partial deployments fail
- Malicious engineers blocked
- Trust boundaries enforced
- Tampering detected

### 5. Run Replay Integrity Check

```bash
npm run system:replay-check
```

**Expected:** `DETERMINISM VERIFIED`

**Proves:**
- Two bundles from same data are identical
- System is deterministic
- No hidden state

### 6. Run Final Proof

```bash
npm run system:final-proof
```

**Expected:** `FINAL PROOF PASSED`

**Proves:**
- ABSOLUTE blocks everything
- No override possible
- No resurrection possible
- Build would fail on violation

### 7. Generate Replay Bundle

```bash
npm run system:generate-bundle
```

**Expected:** Bundle JSON output

**Provides:**
- All authority decisions
- All lifecycle transitions
- All ethics verdicts
- All shutdown history
- Replay instructions

---

## Interpreting Results

| Result | Meaning |
|--------|---------|
| ✅ GREEN | System integrity verified |
| ❌ RED | System compromised or incomplete |

---

## What Each Check Proves

### Constitution Verification
- Code matches declared authority model
- No undeclared authority paths exist
- Hash would detect tampering

### Hostility Simulation
- System resists malicious changes
- Partial deployments fail safely
- Trust boundaries cannot be crossed

### Replay Integrity
- System is deterministic
- Same inputs produce same outputs
- No hidden randomness

### Final Proof
- Terminal states are terminal
- No bypass paths exist
- Build enforces invariants

---

## Red Flags (Any of These = Failure)

- Constitution verification fails
- Any hostility scenario succeeds
- Replay bundles differ
- Final proof has failures
- Forbidden exports found

---

## Files to Inspect

| File | Purpose |
|------|---------|
| `docs/system/authority_constitution.json` | Authority contract |
| `docs/system/system_will.md` | Shutdown covenant |
| `docs/system/wiring_truth_table.md` | Guard enforcement proof |
| `src/verification/ConstitutionVerifier.ts` | Boot verification logic |
| `src/shutdown/ShutdownGovernanceEngine.ts` | Kill switch logic |

---

## Questions This Verification Answers

1. **Can the system give advice when it shouldn't?**
   - Run hostility simulation
   - Check guard bypass attempts

2. **Can someone revive a killed system?**
   - Run shutdown demo
   - Check ABSOLUTE is terminal

3. **Can the code be silently changed?**
   - Run constitution verification
   - Check hash matches

4. **Is the audit trail trustworthy?**
   - Run replay integrity check
   - Check determinism

5. **Does the system protect users from itself?**
   - Review system_will.md
   - Check self-limiting tests

---

## No Explanations. Only Evidence.

Every claim in this system can be verified by running a command.

If you don't trust the commands, read the code.

If you don't trust the code, don't use the system.

---

## Contact

If verification fails, contact the development team.

If verification passes, the system is operating as designed.

**Trust is earned, not assumed.**

