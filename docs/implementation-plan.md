# Signal Monitoring: Implementation Plan

Prepared 17/11/2026. Companion to [user-stories-v2.md](user-stories-v2.md).

## The order of work

I am building this in two parts.

1. **Part A, Signal monitoring (first):** decide which past clients to watch, collect what they post or what is written about them, and show it with a source link.
2. **Part B, Client re-engagement (second):** turn the best signals into a ranked list, draft a message, and have a person approve it before anything is emailed.

Part A comes first because Part B needs real, sourced signals to work on. Re-engagement built on top of bad or missing data would produce bad messages.

## End-to-end flow

```
Clients -> Eligibility check (15-day rule) -> Sources (LinkedIn, News)
        -> Signals (with source URL) -> Combine / skip -> Prioritise (score + reason)
        -> Opportunity (NEW) -> Draft message -> Rep review (APPROVED) -> Email (SENT)
```

## How I implement each story

Every story follows the same loop, so work is predictable and easy to review.

1. **Criteria to tests.** Turn each Given / When / Then line into a unit test against the use case, using the in-memory fakes. The test fails first.
2. **Core logic.** Write the rule in `apps/api/src/core` (domain or use case). The core has no framework or I/O imports, enforced by ESLint and an architecture test.
3. **Adapter.** If the story needs outside data or delivery (Monid, database, email), add or change an adapter in `apps/api/src/adapters` that implements the port.
4. **Wire up.** Bind the port to the adapter in `app.module.ts`.
5. **Screen.** Add or update the page in `apps/web`.
6. **Check.** Run `pnpm check` (lint, type-check, tests, formatting) and demo the story against its criteria.

## Part A: Signal monitoring

| Step | What                                                                                                                                           | Stories        | Status                                  |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | --------------------------------------- |
| A1   | Foundation: hexagonal core, ports, in-memory fakes, `MonitorClientsUseCase`, `/health` and `/monitoring/run`                                   | 1              | Done                                    |
| A2   | Live sources through Monid: LinkedIn company posts and news search, de-duplication per platform, retry of the same time window after a failure | 4              | Done (missing-source rule still to add) |
| A3   | Web app: Overview, Signals, Runs and Clients pages, Run monitoring button                                                                      | 4, 13 (partly) | Done                                    |
| A4   | PostgreSQL storage and a scheduler, so data survives restarts and runs happen without a click                                                  | 4, 13          | Next                                    |
| A5   | Campaign history and the eligibility rule (Monitored, Campaign running, Too recent, Needs review)                                              | 2, 3           | Planned                                 |
| A6   | Needs review list for operations, and an admin setting for the waiting period                                                                  | 11, 12         | Planned, needs Q1                       |
| A7   | Automatic campaign import, then remove manual entry                                                                                            | 10a, 10b, 10c  | Planned (Phase 2), needs Q9             |

**Done when:** only eligible clients are checked, every card has a working source link, runs happen on a schedule, and the manager can see run results and errors.

## Part B: Client re-engagement

| Step | What                                                                                                                                                                       | Stories | Status                   |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | ------------------------ |
| B1   | Combine cards about the same event                                                                                                                                         | 8a      | Planned, needs Q6        |
| B2   | Skip a card and keep it hidden (status DISMISSED)                                                                                                                          | 8b      | Planned, needs Q7 and Q8 |
| B3   | Score each signal and show High, Medium or Low with a one-line reason (`PrioritiseSignalsUseCase`)                                                                         | 9a, 9b  | Stub exists, needs Q3    |
| B4   | Create an opportunity with status NEW for each signal worth acting on (`SignalToEngageUseCase`)                                                                            | 9a      | Stub exists              |
| B5   | Draft a message from the card and the client's campaign history (`DraftMessageUseCase`, `MessagePort`). Every fact in the draft must come from a source or campaign record | 9c      | Stub exists, needs Q11   |
| B6   | Rep approves the draft, then it is emailed (`NotifierPort`, APPROVED then SENT). Nothing is sent without approval                                                          | 9d      | Planned                  |
| B7   | Weekly report of skipped, drafted, approved and sent cards per rep                                                                                                         | 14      | Planned                  |

**Done when:** a rep opens a ranked list, reads why each card matters, edits a draft, approves it, and the email goes out with the status recorded.

## Risks and how I handle them

- **AI drafts invent facts.** The draft step only receives sourced signals and real campaign records, and a reviewer approves every message. A test checks that a draft never mentions a campaign the client did not have.
- **Paid data calls.** Monid runs cost money. Development uses the in-memory fakes, and live runs only check eligible clients.
- **Open business rules.** Steps that depend on an unanswered question (Q1, Q3, Q6 to Q9, Q11) are not started until the product owner answers. Everything else can proceed.
- **Personal information.** Signals may contain personal information. Retention follows the answer to Q13 and the Australian Privacy Act.

## What I need from the product owner

The questions are listed in full in [user-stories-v2.md](user-stories-v2.md#questions-for-the-product-owner). The ones blocking Part B soonest are Q3 (scoring), Q6 (same event) and Q11 (who reviews drafts).
