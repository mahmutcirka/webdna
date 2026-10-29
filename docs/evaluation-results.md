# Detector evaluation on synthetic fixtures

> **Scope:** these results come from hand-written synthetic fixtures (`fixtures/evaluation/manifest.json`). They check that the rules behave as designed. They are **not** a measurement of accuracy on real websites, and no real-world accuracy is claimed.

Rule set: `engine@1.0.0+platforms@2026.10.0+ai-builders@2026.10.0` · cases: 12

## Per-case results

| Case | Fixture | Expected | Actual | |
|---|---|---|---|---|
| explicit-lovable-marker | generator-marker | strong_ai_evidence | strong_ai_evidence | ✓ |
| lovable-hosting-domain | removed-marker | strong_ai_evidence | strong_ai_evidence | ✓ |
| removed-marker | removed-marker | no_meaningful_evidence | no_meaningful_evidence | ✓ |
| framework-only | framework-only | no_meaningful_evidence | no_meaningful_evidence | ✓ |
| hand-written | basic-landing | no_meaningful_evidence | no_meaningful_evidence | ✓ |
| article-about-ai | ai-article | no_meaningful_evidence | no_meaningful_evidence | ✓ |
| starter-template | template-default | no_meaningful_evidence | no_meaningful_evidence | ✓ |
| ambiguous-weak | ambiguous | weak_or_ambiguous | weak_or_ambiguous | ✓ |
| replit-hosting | removed-marker | weak_or_ambiguous | weak_or_ambiguous | ✓ |
| conflicting | conflicting | strong_ai_evidence | strong_ai_evidence | ✓ |
| challenge-page | challenge-page | insufficient_evidence | insufficient_evidence | ✓ |
| empty-shell | empty | insufficient_evidence | insufficient_evidence | ✓ |

## Confusion matrix (rows = expected, columns = actual)

| expected \ actual | strong_ai_evidence | some_ai_indicators | weak_or_ambiguous | no_meaningful_evidence | insufficient_evidence |
|---|---|---|---|---|---|
| strong_ai_evidence | 3 | 0 | 0 | 0 | 0 |
| some_ai_indicators | 0 | 0 | 0 | 0 | 0 |
| weak_or_ambiguous | 0 | 0 | 2 | 0 | 0 |
| no_meaningful_evidence | 0 | 0 | 0 | 5 | 0 |
| insufficient_evidence | 0 | 0 | 0 | 0 | 2 |

## Binary view: AI-related evidence (strong or some) vs. not

- Exact category agreement on synthetic fixtures: 12/12
- TP 3 · FP 0 · FN 0 · TN 9
- On these synthetic fixtures only — not real-world performance: precision 1.000 · recall 1.000 · false-positive rate 0.000

With this few synthetic cases, these figures only show whether regressions occurred.
