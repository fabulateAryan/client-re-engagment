# Signal Monitoring: User Stories (version 2)

Revised 17/11/2026 after review feedback. Updated 17/11/2026 with the client's answers on Phase 1 scope.

## Phase 1 scope (client decision, 17/11/2026)

The goal of Phase 1: **if we know the brand and its LinkedIn page, can the system give timely signals and engagement messages?**

- Brands are set up by hand (name and LinkedIn company page, website optional).
- Monitoring rules (15-day gap, what counts as a campaign, end date, timezone, sub-brands) are **not used in Phase 1**. Every brand that is added is watched.
- Phase 2 (HubSpot integration) is **out of scope**.
- Ownership and data (who fixes "Needs review" records, how long data is kept) is **out of scope** for now.

| Story                                      | In Phase 1?                    | Status in the app                                                                                |
| ------------------------------------------ | ------------------------------ | ------------------------------------------------------------------------------------------------ |
| 1 Add a brand to monitor                   | Yes (manual brand setup)       | Built                                                                                            |
| 2 Enter a campaign date by hand            | No (monitoring rules not used) | Not built                                                                                        |
| 3 See only clients ready to contact        | No (monitoring rules not used) | Removed from the screen; logic kept for later                                                    |
| 4 See signals with their source            | Yes                            | Built                                                                                            |
| 8a Combine cards about the same event      | Yes                            | Not built, waiting on question 9                                                                 |
| 8b Do not show skipped cards again         | Yes                            | Built (Skip, Skipped tab, Undo)                                                                  |
| 9a See a priority for each card            | Yes                            | Built with the suggested cut-offs (High 70+, Medium 50 to 69); sign-off still open (question 11) |
| 9b See why a card was chosen               | Yes                            | Built (one-line reason and "How it was scored")                                                  |
| 9c Get a draft message for a card          | Yes                            | Built (draft, edit, open in email, mark as sent)                                                 |
| 9d Approve a draft before it is sent       | Yes                            | Covered by the rep reviewing it and sending it from their own email; no separate Approve step    |
| 10a to 10c Import from the campaign system | No (Phase 2)                   | Not built                                                                                        |
| 11 Change the waiting period               | No (monitoring rules not used) | Not built                                                                                        |
| 12 Fix records that need review            | No (ownership and data)        | Not built                                                                                        |
| 13 See whether the system is working       | Yes                            | Runs page built; warning not built                                                               |
| 14 See what reps did with the cards        | Yes                            | Not built                                                                                        |

## What changed from version 1

1. Stories that held more than one feature are split (Stories 8, 9 and 10).
2. The monitoring rule from Story 3 is now acceptance criteria on a sales rep story, not a story of its own.
3. Acceptance criteria use Given / When / Then and define the terms that were vague ("campaign running", "worked with us before", "High").
4. The conflict between Story 2 (manual campaign date) and Story 10 (no manual entry) is resolved by tagging each story with a phase.
5. New stories cover the other people who use the system: sales manager, operations (data owner) and admin.

Assumption: I did not have the original wording of Stories 4, 9 and 10 to hand. I have rebuilt them from what the system does today. If any rebuilt story does not match what you meant, swap in your wording and keep the split and criteria pattern.

## Users

| User                    | What they need from the system                                                       |
| ----------------------- | ------------------------------------------------------------------------------------ |
| Sales rep               | A short list of past clients worth contacting now, with a reason and a draft message |
| Sales manager           | Confidence the system is working and that reps are acting on it                      |
| Operations (data owner) | A way to fix client and campaign records that are incomplete                         |
| Admin                   | Control over rules such as the 15-day wait                                           |

## Definitions used in the criteria

- **Finished campaign:** a campaign with an end date that is earlier than today.
- **Active campaign:** a campaign with a start date on or before today and either no end date or an end date on or after today. (Not used in Phase 1, see question 3.)
- **Worked with us before:** the client has at least one finished campaign.
- **Signal:** one item found about a client, for example a LinkedIn post or a news article.
- **Card:** how a signal is shown to the sales rep.
- **Source:** the public URL the signal came from.

## Phases

- **Phase 1:** campaign dates are entered by hand (Story 2).
- **Phase 2:** campaign dates come automatically from the campaign system and manual entry is removed (Stories 10a to 10c).

---

## Stories

### Story 1: Choose which clients to monitor (Phase 1)

As a sales rep, I want to add a past client's LinkedIn page and website to the system, so that the system can look for news about them.

- Given a client record with a LinkedIn company URL, when the monitoring run starts, then LinkedIn is checked for that client.
- Given a client record with a website domain or company name, when the monitoring run starts, then news is checked for that client.
- Given a client record with no LinkedIn URL and no website or name for news, when the monitoring run starts, then the client is skipped and shown as "Needs review: no handles".

### Story 2: Enter a campaign date by hand (Phase 1 only)

As a sales rep, I want to enter a client's last campaign end date by hand, so that the system knows when it is safe to contact them before automatic import exists.

- Given I enter a valid date in DD/MM/YYYY format, when I save, then the date is stored as the campaign end date.
- Given I enter a date in the future for a finished campaign, when I save, then I see an error and nothing is saved.
- Given Phase 2 is live, when I open a client, then the manual date field is not shown (see Story 10b).

### Story 3: See only clients who are ready to contact

As a sales rep, I want to see only clients who are ready to contact, so that I reach out at the right time.

- Given a client has at least one finished campaign, no active campaign, and their last campaign ended 15 or more days ago, when the system checks, then the status is "Monitored".
- Given a client has an active campaign, when the system checks, then the status is "Campaign running".
- Given a client's last campaign ended less than 15 days ago, when the system checks, then the status is "Too recent".
- Given a client has no campaign end date, when the system checks, then the status is "Needs review: missing end date".
- Given a client has no campaigns at all, when the system checks, then the status is "Not a past client" and they are not monitored.
- Given a client's status is anything other than "Monitored", when I open the signal list, then no cards for that client are shown.

### Story 4: See news about a client with its source

As a sales rep, I want to see each new post or article about a monitored client with a link to where it came from, so that I can check it is real before I use it.

- Given a monitored client posts on LinkedIn after the last check, when the monitoring run finishes, then a card appears showing the client name, platform, published date (DD/MM/YYYY), a short extract and a link to the original post.
- Given a news article about a monitored client is published after the last check, when the monitoring run finishes, then a card appears with the same fields and a link to the article.
- Given an item has no source URL, when the monitoring run finishes, then no card is shown and the item is counted as "Needs review: missing source" in the run summary.
- Given the same post is found twice on the same platform, when the monitoring run finishes, then only one card is shown.
- Given a card is shown, when I click the source link, then the original page opens in a new tab.
- Given a source fails during a run (for example LinkedIn is unavailable), when the run finishes, then the error is shown in the run history and the next run checks the same time window again, so no posts are missed.
- Given the client is not "Monitored" (Story 3), when the monitoring run starts, then no sources are checked for that client.

### Story 8a: Combine cards about the same event

As a sales rep, I want cards about the same event to appear as one card, so that I do not read the same news several times.

- Given two signals for the same client have the same source URL (ignoring tracking parameters such as `utm_`), when the cards are shown, then I see one card with both sources listed.
- Given a LinkedIn post and a news article about the same client are both linked to the same event (see question 9 for how "same event" is decided), when the cards are shown, then I see one card listing both sources, and the earliest published date is shown.
- Given two signals for different clients have the same source URL, when the cards are shown, then I see one card per client.
- Given a combined card, when I open it, then I can see every source that was combined into it.

### Story 8b: Do not show skipped cards again

As a sales rep, I want a card I have skipped to stay hidden, so that my list only shows things I have not dealt with.

- Given I click "Skip" on a card, when the list refreshes, then the card is no longer in my list and its status is "Skipped".
- Given a card is skipped, when the next monitoring run finds the same signal again, then the card does not reappear.
- Given a card is skipped, when a new, different signal for the same client is found, then the new card is shown.
- Given I filter the list by "Skipped", when the list loads, then I can see the skipped cards with the date they were skipped and who skipped them.
- Given I skipped a card by mistake, when I click "Undo" on it in the Skipped view, then it returns to my list with status "New". (See question 10.)

### Story 9a: See a priority for each card

As a sales rep, I want each card to show a priority of High, Medium or Low, so that I act on the most useful ones first.

- Given a card has a score of [X] or more out of 100, when the list loads, then it shows "High". (X to be confirmed, see question 11.)
- Given a card has a score from [Y] to [X minus 1], when the list loads, then it shows "Medium".
- Given a card has a score below [Y], when the list loads, then it shows "Low".
- Given the list loads, when no sort is chosen, then cards are sorted by score, highest first, and then by published date, newest first.

### Story 9b: See why a card was chosen

As a sales rep, I want each card to explain in one sentence why it matters, so that I can decide quickly whether to act.

- Given a card is shown, when I read it, then it includes a reason of no more than 200 characters.
- Given a reason refers to a fact (for example "launched a new product"), when I read it, then that fact is found in at least one of the card's sources.
- Given no reason can be produced, when the card is shown, then the reason reads "No reason available" and the card is marked "Needs review".

### Story 9c: Get a draft message for a card

As a sales rep, I want a draft re-engagement message for a card, so that I save time writing to the client.

- Given I click "Draft message" on a card, when the draft is ready, then it mentions the client's name and the event on the card.
- Given a draft mentions a past campaign, when I read it, then that campaign exists in the client's campaign history.
- Given a draft is ready, when I edit it, then my changes are kept when I leave and come back.

### Story 9d: Approve a draft before it is sent

As a sales rep, I want to approve each message before it is emailed, so that nothing goes to a client without a person checking it.

- Given a draft has status "New", when I click "Approve", then the status changes to "Approved".
- Given a draft has status "Approved", when it is emailed, then the status changes to "Sent" and the send date is recorded.
- Given a draft has not been approved, when anyone tries to send it, then it is not sent and an error is shown.

### Story 10a: Import campaign dates automatically (Phase 2)

As a sales rep, I want campaign dates to come from the campaign system, so that I do not have to type them and they are always up to date.

- Given a campaign is created or changed in the campaign system, when the next daily import runs, then the client's campaign start and end dates in this system match. (Phase 2, out of scope for now.)
- Given the import fails, when the run finishes, then the error is shown in the run history and existing dates are kept.

### Story 10b: Remove manual campaign date entry (Phase 2)

As a sales rep, I want the manual date field removed once import is live, so that there is only one source of truth.

- Given Phase 2 is live, when I open a client, then there is no field to type a campaign date.
- Given a date was entered by hand in Phase 1, when the first import runs, then the imported date replaces it and the old value is kept in the change history.

### Story 10c: Flag imported campaigns with missing dates (Phase 2)

As an operations user, I want imported campaigns with a missing date to be flagged, so that I know which records to fix.

- Given an imported campaign has no end date and is not active, when the import finishes, then the client's status is "Needs review: missing end date".

---

## New stories for other users

### Story 11: Change the waiting period (Admin)

As an admin, I want to change the number of days to wait after a campaign ends, so that the rule can be adjusted without a code change.

- Given I set the waiting period to a whole number from [min] to [max] days, when I save, then the next monitoring run uses the new value. (Range to be confirmed, see question 1.)
- Given I enter a value outside the allowed range, when I save, then I see an error and the old value is kept.
- Given I change the value, when I save, then the change, the old value, the new value, who changed it and when are recorded.

### Story 12: Fix records that need review (Operations)

As an operations user, I want a list of all clients marked "Needs review", so that I can fix their data and get them monitored.

- Given one or more clients have a "Needs review" status, when I open the Needs review list, then I see each client with the reason (missing end date, missing source, no handles).
- Given I fix the missing data, when the next check runs, then the client's status is recalculated using the Story 3 rules.

### Story 13: See whether the system is working (Sales manager)

As a sales manager, I want a summary of recent monitoring runs, so that I know the system is working and finding useful signals.

- Given a monitoring run has finished, when I open the overview, then I see the run date, the number of clients checked, the number of new cards and the number of errors.
- Given a run had errors, when I open it, then I see which client and source failed and the error message.
- Given no run has finished in the last [N] hours, when I open the overview, then I see a warning. (N to be confirmed, not yet asked.)

### Story 14: See what reps did with the cards (Sales manager)

As a sales manager, I want to see how many cards were skipped, drafted, approved and sent each week, so that I know whether the system is helping the team.

- Given cards have changed status during a week, when I open the weekly report, then I see a count for each status, per rep.

---

## Questions for the client

Sent 17/11/2026 with a suggested answer for each. Client reply: focus on Phase 1, ignore Phase 2, ignore Ownership and data, and do not apply the monitoring rules in Phase 1.

| #   | Question                                                                                          | Suggestion                                        | Decision                                              |
| --- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ----------------------------------------------------- |
| 1   | Is the 15-day gap fixed, or can an admin change it?                                               | One value for all clients, changeable by an admin | Not for Phase 1                                       |
| 2   | What counts as a campaign: signed, live or invoiced?                                              | Signed agreement                                  | Not for Phase 1                                       |
| 3   | Which date is the campaign end date?                                                              | Last day creator content went live                | Not for Phase 1                                       |
| 4   | Which timezone do we use to count days for AU, SG and NZ clients?                                 | Sydney time                                       | Not for Phase 1                                       |
| 5   | Does a sub-brand's campaign count for the parent brand?                                           | Yes                                               | Not for Phase 1                                       |
| 6   | What data does Monid provide, and is our use of its LinkedIn data allowed under LinkedIn's terms? | (none)                                            | **Open**                                              |
| 7   | Is Monid the only signal source in Phase 1, or do we also keep news sources?                      | Monid only                                        | **Open** (news is still on for brands with a website) |
| 8   | In Phase 2, if HubSpot and a manual entry disagree, which wins?                                   | HubSpot                                           | Out of scope (Phase 2)                                |
| 9   | How do we decide two updates are the same event?                                                  | Same client, same event type, within 14 days      | **Open** (blocks Story 8a)                            |
| 10  | Can a skipped card be undone, and by whom?                                                        | Yes, by the rep who skipped it                    | Undo is built; "by whom" needs user logins            |
| 11  | Who signs off the score cut-offs?                                                                 | High 70+, Medium 50 to 69, Low under 50           | **Open** (blocks Story 9a)                            |
| 12  | Who gets alerts for High cards, and how?                                                          | The client's owner, by email                      | **Open**                                              |
| 13  | Who fixes records marked "Needs review", and how quickly?                                         | Client's sales rep, within 5 working days         | Out of scope (ownership and data)                     |
| 14  | How long do we keep updates, cards and decisions?                                                 | 12 months                                         | Out of scope (ownership and data)                     |

## INVEST check

| Story      | I       | N   | V   | E      | S   | T      | Note                                               |
| ---------- | ------- | --- | --- | ------ | --- | ------ | -------------------------------------------------- |
| 3          | Yes     | Yes | Yes | Yes    | Yes | Yes    | Waiting period value not used in Phase 1           |
| 4          | Yes     | Yes | Yes | Yes    | Yes | Yes    |                                                    |
| 8a         | Needs 4 | Yes | Yes | No     | Yes | Partly | Cannot estimate or fully test until Q9 is answered |
| 8b         | Needs 4 | Yes | Yes | Yes    | Yes | Yes    |                                                    |
| 9a         | Needs 4 | Yes | Yes | No     | Yes | Partly | Thresholds depend on Q11                           |
| 9b to 9d   | Needs 4 | Yes | Yes | Yes    | Yes | Yes    |                                                    |
| 10a to 10c | Yes     | Yes | Yes | Partly | Yes | Yes    | Phase 2, out of scope                              |
| 11 to 14   | Yes     | Yes | Yes | Yes    | Yes | Yes    |                                                    |

Stories 8 and 9 depend on Story 4 because cards must exist first. This is a natural order, not a design problem, so Story 4 should be built first.
