# AI-origin analysis: methodology

## The problem

Whether a website was built with AI assistance cannot, in general, be determined from its public frontend. Human developers use AI tools; AI tools produce conventional code; humans build sites that look "generated"; and any marker can be removed or copied. WebDNA therefore reports **observable evidence and its limits**, not verdicts.

## Three separate questions

|     | Question                                                              | Typical evidence                                                                                                                                          | Never sufficient on its own                              |
| --- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| A   | Which platform built or hosts the site?                               | generator meta, `/wp-content/`, `/_next/static/`, `x-vercel-id`, `ng-version`                                                                             | — (this is platform information, not AI evidence)        |
| B   | Is there evidence potentially associated with AI-assisted generation? | AI-builder editor script (`cdn.gpteng.co/gptengineer.js`), AI-builder hosting domain (`*.lovable.app`), generator tag or source comment naming an AI tool | framework use, visual style, stock/AI images, repetition |
| C   | Are there signs of template reuse or incomplete customisation?        | starter text, lorem ipsum, `{{vars}}`, `/vite.svg`, many `href="#"`                                                                                       | — (reuse is not AI involvement)                          |

A platform finding for an AI-first builder produces a **separate** B finding through the signature's `aiAssociation`. That B finding is always marked `indirect` and its strength can never exceed the platform evidence or the association's `maxStrength` (e.g. Replit hosting → at most weak, because Replit hosts many hand-written projects).

## Evidence strength

| Strength     | Meaning                                                                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------- |
| strong       | A specific, hard-to-produce-by-accident marker, or two independent moderate markers of the same platform |
| moderate     | A specific marker that is commonly left in defaults but easy to copy                                     |
| weak         | A pattern that is consistent with the subject but common elsewhere                                       |
| inconclusive | Reserved for findings that could not be evaluated                                                        |

Corroboration (two different matcher types at ≥ moderate) can raise a **platform** identification to strong. It never applies to weak matchers, and the conclusion engine never combines multiple AI findings.

## Conclusion categories

The category is the strength of the single strongest AI-related (B) finding:

- strong → **Strong AI-related evidence found**
- moderate → **Some AI-related indicators found**
- weak/inconclusive → **Weak or ambiguous indicators found**
- none, with adequate coverage → **No meaningful AI-origin evidence found**
- none, with inadequate coverage (bot-challenge page, empty shell, nothing inspectable) → **Insufficient evidence to determine origin**

These are not calibrated probabilities and are never shown as percentages.

## Coverage

Each report states what was available: original HTML, rendered DOM, how many scripts/stylesheets were inspected out of how many loaded, visible text sampled (not stored), headers, and whether a blocking page was suspected.

## Conflicts

The report lists conflicts such as markers from two AI builders, multiple CMS fingerprints, or an AI builder alongside a conventional CMS. Conflicts are shown, not resolved.

## False-positive protection

| Case                                                        | How WebDNA handles it                                                                |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Human site with AI-generated images                         | Image names/alt text are not inspected by AI rules (regression fixture `ai-article`) |
| Human site using Next.js/React/Tailwind/shadcn-like classes | Platform findings only (fixture `framework-only`)                                    |
| AI-assisted site later edited heavily                       | Markers may persist → the finding lists this as an alternative explanation           |
| Builder template customised manually                        | Template signals are reported separately and never change the AI category            |
| Generic landing-page layouts, polish, repetition            | Not used as evidence by any rule                                                     |
| Placeholder content not produced by AI                      | Template category only                                                               |
| Article that discusses or links to AI tools                 | Visible text and `<a href>` targets are excluded from AI and platform matchers       |
| Evidence unavailable                                        | Coverage notes + "insufficient evidence"                                             |

## Same-site attribution

Path-only signatures (`/_next/static/`, `/wp-content/`, …) and AI-marker comments in scripts are only attributed to the site when the resource is **same-site**. Same-site is approximated as "same hostname or same last two labels" — WebDNA does not ship the Public Suffix List. Consequences: subdomains of shared hosts (e.g. `a.github.io` and `b.github.io`) are treated as the same site, and ccTLD registrations such as `example.co.uk` group with all `*.co.uk` hosts. The approximation errs towards treating unrelated hosts on shared suffixes as first-party for path-only patterns; host-anchored signatures are unaffected.

## What WebDNA will not do

- Identify a model or provider (it can only quote an explicit claim the page makes).
- Bypass authentication, access private repositories, or download source beyond what the page loads publicly.
- Claim accuracy on real websites. The evaluation set is synthetic ([results](evaluation-results.md)).

## Building a real evaluation dataset

A meaningful real-world evaluation needs sites whose origin is known through consent or public, verifiable statements, collected under terms that permit analysis, with a documented labelling protocol and a held-out split. Do not label sites as AI-generated based on appearance. Contributions of such datasets (or protocols) are welcome; see `CONTRIBUTING.md`.
