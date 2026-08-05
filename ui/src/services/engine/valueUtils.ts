/**
 * Value-comparison semantics live in shared/formflow-core/valueComparison.ts —
 * the single implementation consumed by both the form runtime and the DSL
 * reference semantics. Re-exported here for callers of this module.
 */
export { sameValue, comparableValue } from '../../../../shared/formflow-core/valueComparison';
