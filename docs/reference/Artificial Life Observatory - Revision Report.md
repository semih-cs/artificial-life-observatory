# Artificial Life Observatory — Specification Revision Report

**Revision:** 2 (Implementation-Ready Edition)
**Scope of this pass:** structural cleanup, renumbering, Phase 0A/long-term separation, Phase 0A Implementation Contract, empirical/design classification of open items. No simulation design was invented or changed. Word count grew from ~82,300 to ~84,600 (net addition only — the new §15, a title page/TOC, a few editorial notes, and inline tags); nothing was deleted.

---

## 1. Major structural changes

- **Fixed section numbering.** The source document reused top-level numbers "9" and "10" twice each (Organism Model / Brain, Perception & Actions; Morphological Genome / Energy, Food, Death & Reproduction), and was missing the top-level heading paragraph for two sections (Inheritance/Mutation/Founder/Bootstrap, and System Architecture — both existed only as a stray bold fragment glued onto the end of the preceding section's paragraph, e.g. `"\n\n11. Inheritance, Mutation & Founder Bootstrap"`). The document now runs 1–26 with no reused numbers and no missing headings. Every subsection keeps its original position in the document; only the numbers changed.
- **Added a Part structure** (five parts, not separately numbered, used only for navigation): Part I – Vision, Goals & Philosophy (§1–§6); Part II – Core Simulation Design (§7–§13); Part III – Immediate Implementation Scope / Phase 0 (§14–§24); Part IV – Long-Term / Post-Phase-0 Roadmap, appendix (§25); Part V – Specification Closure (§26).
- **Split the former §21** ("Long-Term Roadmap, Governance & Implementation Handoff") into three pieces, since it mixed genuinely future material with material needed right now:
  - §21.1 (Purpose) + §21.29–§21.74 (Decision Governance, Implementation Handoff, Recommended Build Order steps 1–19, Implementation Rules, Definition of Done, Portfolio material) → new **§24 Implementation Governance, Build Order & Handoff**, kept in Part III since it's operative for finishing Phase 0.
  - §21.2–§21.28 (Phase 1–6 roadmap: Evolution/Ecology/Memory & Learning/Social Signaling/Species & Analytics/Advanced Research expansion) → new **§25 Long-Term Research Roadmap**, moved to the new Part IV appendix.
  - §21.75–§21.81 (Final Open Questions, Final Baseline Snapshot, Final Locked Principles, Final Implementation Contract, Final Completion Criteria, Final Decision Summary, Specification Closure) → new **§26 Specification Closure & Final Decision Summary**, made the document's closing section.
  - A short revision-editorial note was added at the top of §24 explaining the split, since §21.1's original "Purpose" text (kept verbatim as §24.1) described the combined section and would otherwise misdescribe §24 alone.
- **New §15 Phase 0A Implementation Contract** inserted between §14 (Phase 0 Scope & Milestones) and what is now §16 (Calibration & Experimental Design). Twelve subsections plus a checklist; entirely derived/cross-referenced from existing content (source mapping below) — no new design.
- **Scattered forward-looking subsections tagged in place** rather than physically relocated: 22 subsections whose original titles already said "Future ..." (or similar) got a `(Post-Phase-0)` suffix appended to the heading, e.g. `9.50 Future Health Model` → `9.50 Future Health Model (Post-Phase-0)`. These were left where they are (next to the mechanism they extend — Organism Model, Genome, Brain, Energy, Determinism, Architecture, Observatory UX) rather than moved to the §25 appendix, because moving them would sever them from the exact mechanism they describe extending. §25's introduction cross-references all of them by number so they're still discoverable from the roadmap.
- Observatory UX & Visual Direction (now §22) was **not** moved to the appendix — nearly all of it is explicitly Phase 0D scope (it has its own "Phase 0D Scope" / "Phase 0D Non-Goals" / "Phase 0D Acceptance Criteria" subsections). Only its three subsections already marked "— Future" were tagged `(Post-Phase-0)`.
- One cosmetic fix: §25.1's heading was renamed from "Long-Term Research Roadmap" to "Roadmap Overview" to avoid it literally repeating the parent section's own title (§25 "Long-Term Research Roadmap" → §25.1 "Long-Term Research Roadmap"); body text is untouched.

## 2. Section renumbering map (old → new)

| Old | New | Title |
|---|---|---|
| 1–8 | 1–8 | unchanged |
| 9 (1st) | 9 | Organism Model — unchanged |
| 10 (1st) | 10 | Morphological Genome — unchanged |
| 9 (2nd, duplicate) | **11** | Brain, Perception & Actions |
| 10 (2nd, duplicate) | **12** | Energy, Food, Death & Reproduction |
| 11 (heading was missing) | **13** | Inheritance, Mutation & Founder/Bootstrap Population |
| 12 | **14** | Phase 0 Scope & Milestones |
| — | **15** | *(new)* Phase 0A Implementation Contract |
| 13 | **16** | Calibration & Experimental Design |
| 14 | **17** | Validation Gates & Acceptance Criteria |
| 15 | **18** | Determinism, RNG & Reproducibility |
| 16 | **19** | Persistence, Snapshots & Recovery |
| 17 (heading was missing) | **20** | System Architecture |
| 18 | **21** | Performance & Scalability |
| 19 | **22** | Observatory UX & Visual Direction |
| 20 | **23** | Risks & Failure Modes |
| 21.1, 21.29–21.74 | **24** | Implementation Governance, Build Order & Handoff |
| 21.2–21.28 | **25** | Long-Term Research Roadmap |
| 21.75–21.81 | **26** | Specification Closure & Final Decision Summary |

Every subsection kept its original suffix number where the section only moved as a whole (e.g. old §9.50 → new §9.50 unchanged; old §9.50-of-Brain → new §11.50). §24–§26 subsections were renumbered sequentially since they're reassembled from non-contiguous pieces of old §21. I verified programmatically that every one of the 26 sections' subsections runs 1..N with no gaps and no duplicates, and that all 26 top-level numbers appear exactly once, in order.

Almost no internal cross-references existed in the source text to begin with (a full-text search for "Section N", "see N.N" style references found exactly one hit, itself a minor mislabel — "Section 1 Decision Summary" — which is cosmetic and unrelated to the renumbering), so there was very little risk of leaving a stale reference behind. The handful of cross-references that do exist are the ones this revision itself added, in the new §15 and in the §25 appendix intro; every one of those was checked against the actual renumbered target before being written in, not hand-guessed.

## 3. Genuine duplicate content merged or removed

**None.** On inspection, the two "9"s and two "10"s were not duplicate content reused under the same number — they were four genuinely distinct sections (Organism Model, Morphological Genome, Brain/Perception/Actions, Energy/Food/Death/Reproduction) that happened to collide numerically. Nothing was merged; everything kept its own subsection range. No other repeated blocks of substantial content were found elsewhere in the document.

## 4. Contradictions resolved

- The document's own tick-pipeline description (old §17.11, now §20.11) explicitly says "the exact order remains subject to implementation validation," while several `[LOCKED]` statements elsewhere establish the *shape* of the pipeline (explicit phases, sense/decide/resolve separation, buffered action intents, no direct mutation during decision). These were not in conflict — they operate at different levels of precision — so §15.4 states the `[LOCKED]` shape as locked and explicitly carries forward the fine-grained ordering as unresolved (see §5 below), rather than inventing a resolution.
- No other outright contradictions were found between sections; the "9"/"10" duplication and missing headings were a numbering/formatting defect, not a content disagreement — the two "9" sections and two "10" sections describe non-overlapping subject matter.

## 5. Contradictions / ambiguities that could NOT be safely resolved and remain `[OPEN]`

The exact same-tick resolution order is the one place where the specification is internally consistent but genuinely incomplete, and it is load-bearing for Phase 0A coding. It shows up in at least four places, all still `[OPEN]`:

- §12.16 Food Competition — same-tick food-competition resolution rule
- §12.32 (context of Death Resolution) — same-tick precedence between feeding / reproduction / energy depletion / death
- §18.12 Canonical RNG Consumption Order — same-tick RNG draw ordering
- §26's Final Open Questions — "Exact tick-resolution order" and "Exact same-tick resource conflict rule," carried over unchanged

This revision did not invent an ordering to make the document look more finished. §15.4 flags it explicitly as the highest-priority decision to make before writing resolution code — see item 7 below.

## 6. `[OPEN]` items reclassified as `[OPEN — EMPIRICAL]`

I reviewed all ~278 individual `[OPEN]` items in the document (79 standalone single-sentence items, plus 199 items inside 24 end-of-section "Decision Summary" lists; one more apparent list occurrence turned out to be meta-discussion of the LOCKED/BASELINE/OPEN system itself in §5 illustrating the tag syntax, not a real open item, and was left untouched). The rule applied: an item is **empirical** if its correct value can only be discovered by running the simulation (calibration campaigns, pilot data, statistical analysis of runs) — magnitudes, thresholds, rates, tolerances, effect-size/statistical criteria, "after pilot calibration/testing/analysis" items. An item stays **design-open** if it requires a human to pick an approach, representation, schema, algorithm, library, protocol, policy, or feature-inclusion — including tick-order/conflict-resolution *mechanism* choices, since *which* fix to adopt is a design decision even when the *need* for a fix is discovered empirically (e.g., "final boundary-handling mechanism if clamping saturates" stayed design-open; "whether clamping creates unacceptable boundary saturation" became empirical, because the first is a choice and the second is a measurement).

- 16 standalone `[OPEN]` sentences were retagged `[OPEN — EMPIRICAL]` in place (e.g., near §12.25, "Final initial food count and whether canonical launch starts at ecological equilibrium"; near §16.66, "Final confirmatory statistical method after pilot distribution inspection").
- 58 items inside block-style "Decision Summary" `[OPEN]` lists were marked with an inline `[EMPIRICAL]` suffix rather than moved into a separate list, to avoid restructuring/reordering risk inside lists that also contain design-open items (e.g. §16-family lists mixing "final foodEnergy value" [EMPIRICAL] next to "exact food spawn algorithm" [not tagged, design]).
- No numeric value was invented for any of these items, per instruction. Everything that was `[OPEN]` and stayed `[OPEN]` is a design decision someone still has to make on paper, not a number this revision could have supplied.

This is a judgment call, not a mechanical one — a few items are genuinely borderline (e.g. whether "final primary reproductive-success metric" counts as a methodology choice or an empirically-selected metric; I classified metric-selection items inside the Validation Gates section as empirical, since the document's own framing there ties them to pilot-data inspection). If you disagree with specific calls, they're easy to flip individually — the tagging is additive text, not a structural change.

## 7. Must be decided before Phase 0A coding begins

1. **Same-tick resolution order** (see item 5) — this blocks writing the resolution phase of the tick pipeline at all. Recommend deciding this first, before Step 1 of the build order (§24.14).
2. **Final Phase 0 neural input vector** (§11 area) — dimensionality/contents of the sensory vector must be fixed before the neural controller and perception code can be written together (§15.9's "correct sensor calculations" / "correct feedforward evaluation" tests need a concrete vector to test against).
3. **Hidden-layer activation function and action thresholds** — needed to make the neural controller testable in isolation (build Step 5, §24.18).
4. **Canonical/bootstrap seed-selection procedure and Founder Neural Genome generation method** — needed before "deterministic initialization" (§15.9's first minimum test) can be implemented at all.
5. **Minimal wall-sensing representation and nearest-food vs. sector-based perception** — needed for Step 6 (§24.19).

All five are `[OPEN]` design-open items already present in the source document; this revision did not add new ones. They're listed here because they sit directly on the Phase 0A critical path (build order Steps 1–6), unlike most of the other ~140 open items, which affect Phase 0B–0D or later.

## 8. Can safely remain undecided until Phase 0B calibration or later

Essentially all 74 items now tagged `[OPEN — EMPIRICAL]` — energy/food/metabolism coefficients, mutation magnitudes and per-gene mutation questions, ecological viability thresholds, effect-size and statistical criteria, extinction/runaway/birth-death frequency tolerances, confirmatory seed counts — by definition. These cannot be resolved by more specification writing regardless of when you look at them; Phase 0A should proceed with `[BASELINE]` placeholder values (already present in the document, e.g. ~25 initial organisms, ~20,000-tick validation runs, ~250-probe functional evaluation) and let Phase 0B calibration settle them.

Most remaining design-open items are Phase 0C/0D/production concerns with no Phase 0A dependency: snapshot storage vendor/format, database schema, WebSocket message schema, admin authentication, cloud hosting provider, frontend state-management library, soak-test duration, worker concurrency defaults, and most of the Observatory UX design-open items (mobile layout, "While You Were Away" implementation, ambient audio, research-data export scope). None of these block writing or testing simulation-core code.

---

## Files produced

- `Artificial Life Observatory - Spec v2 (Implementation-Ready).docx` — the revised specification (this report's subject). Same filename pattern as the original, versioned; the original file was not modified.
- This revision report.

The original document was left untouched in your Artificial Life Observatory folder.
