---
name: deliver-ticket
# Folded block scalar, NOT a plain scalar: the text contains ": " and "#".
description: >-
  Deliver a nuxtjs-template ticket end-to-end in one run: read the ticket
  (Kaneo), move it to In Progress, plan and interview, implement,
  run the project's quality gates, open a PR, run the multi-model review and
  address findings, merge, deploy, watch the deployment, and mark the ticket
  Done. EXPLICIT INVOCATION ONLY. Run it when the user invokes
  `/deliver-ticket` or names the skill. Do NOT trigger it from ticket-shaped
  phrasing alone ("pick up ABC-12", "work on the login bug"), which is
  ambiguous between reading, editing and shipping; this skill merges, deploys
  and closes with one human checkpoint. To view or update a ticket use the
  tracker's own CLI.
license: MIT
metadata:
  author: "foae"
  template: adopt-deliver-ticket
  template_version: "1.0"
  adopted: "2026-09-22"
---

# Deliver a ticket (end-to-end)

One invocation runs the whole delivery workflow. Project facts (tracker
commands, workspace layout, quality gates, PR conventions, deploy and watch
recipes, autonomy overrides) live in the sidecar
`.agents/skills/deliver-ticket/deliver-ticket.yaml`. **Read the sidecar first, in full, every run**, then every
file it lists under `project.agent_instructions`; those files outrank this
one wherever they disagree. This file is the workflow; the sidecar is the
configuration. Where this file says "per sidecar", the sidecar key is named
in parentheses.

The skill is harness-agnostic. "Ask the user" means your harness's question
mechanism with a recommended option listed first. "In the background" means a
background process, or a subagent when your harness has one. "Subtasks" means
your harness's task list.

**Capability states gate whole phases.** `tracker.state`, `gates.state`,
`pr.state` and `deploy.state` are each `adopted`, `substituted`, `skipped` or
`impossible`. Only `adopted` and `substituted` run the phases that use that
capability; `skipped` and `impossible` turn them into no-ops that the wrap-up
names. Tracker skipped: every ticket step is a no-op (as ticket-less mode).
Gates skipped: Phase 6 is skipped and the PR body says so. PR skipped
(personal repos only): Phases 7 to 10 collapse into "review the local range
against the base, then push to the base directly". Deploy skipped or
impossible: Phases 11 and 12 are skipped.

## Inputs

- **Ticket reference**: the argument after the skill name. Either a tracker
  ID (`ABC-123`, `#42`, `task-17`) or, when the sidecar allows ticket-less
  mode (`tracker.ticketless`), a quoted task description. If absent, ask
  before doing anything.
- Extra text after the reference is a constraint to fold into the plan.
- Per-run overrides in plain words are honoured: "pause before merge",
  "pause before deploy", "skip the panel", "panel pro".

## Hard rules

- **One mandatory human checkpoint: the plan interview (Phase 3).** Other
  stops are conditional and listed in the gate policy below. Never add a stop
  that the policy does not name, and never skip one it does.
- **Parallelise everything independent.** The parallel map below says what
  may overlap. The single constraint: **nothing mutates the working tree while
  a pinned review is reading it** — from the Phase 8 launch until every
  reviewer and bot has reported. Phase 9 then edits freely; that is its job.
- **Track a subtask per phase** and update it as you go. Record interview
  answers verbatim in the subtask list; Phase 8 is many tool calls later and
  an unrecorded panel choice gets silently replaced by a default.
- **Repo beats ticket.** When the ticket's verification text conflicts with
  the repo's CI or agent instructions, the repo is authoritative and the
  conflict goes in the delivery summary.
- **Pre-existing issues are yours.** A bug or smell in code you depend on is
  fixed inline when small and safe, or raised at the next checkpoint with
  file and line, never noted and stepped around.
- **Never read secret-bearing files at all.** The sidecar lists them
  (`project.secret_paths`). Not `cat`, and not `grep` either: `grep API_KEY
  .env` prints the whole line, value included, straight into your context and
  from there into a plan or a PR body. Check existence with `test -f`, and
  when you need to know which keys a file defines, read the repo's example
  file (`.env.example`) or its documentation instead.
- **Every sidecar key is load-bearing.** Beyond the keys named in the phases:
  `tracker.id_pattern` decides whether the argument is an ID or free text,
  `tracker.commands.auth_probe` runs once in Phase 0 before the first tracker
  call (a failed probe means tracker steps degrade to no-ops and the wrap-up
  says so), `gates.source` is the file to re-read when a gate looks stale,
  `deploy.target_class` goes in the Phase 3 deploy question and the wrap-up so
  the human knows what they authorised, and every `notes:` list is prose you
  must read before using that capability's commands. `project.languages`,
  `project.package_manager` and `project.monorepo` are descriptive: they tell
  you which conventions and toolchain apply when a phase leaves a choice
  open.
- **Capability checks, not assumptions.** Before Phases 5, 8 and 11 probe for
  the skill or tool you are about to use. Absent, apply the documented
  fallback and say so in the wrap-up. Never fail a phase because an optional
  skill is missing on this machine.
- **Run tools directly.** Ask the user only for genuinely interactive steps
  (a browser login, a hardware token).

## Forge commands

Every PR step below is written once, in `gh` form, with the `glab` equivalent
here. `pr.forge` picks the column. Rows marked **verify** were not exercised on
this template version; check `--help` before relying on them.

`<strategy>` is `pr.merge_strategy` (`squash`, `merge` or `rebase`), and the
branch-deletion flag appears only when `pr.delete_branch` is true. Neither is
hardcoded here; the table shows where they go.

| Step | `gh` (GitHub) | `glab` (GitLab) |
|---|---|---|
| Open | `gh pr create --base <base> --head <branch> --title <t> --body-file <f>` | `glab mr create --source-branch <branch> --target-branch <base> --title <t> --description-file <f>` **verify** |
| CI status on the head SHA | `gh pr checks <N>` | `glab ci status --branch <branch>` |
| Reviews and bot comments | `gh pr view <N> --json reviews`; `gh api repos/<o>/<r>/pulls/<N>/comments` | `glab mr view <N> --comments` |
| Protection and required approvals | `gh api repos/<o>/<r>/rules/branches/<base>` (never `/protection` alone) | `glab api projects/:id/protected_branches/<base>`; `glab api projects/:id/merge_requests/<N>/approvals` **verify** |
| Mergeability | `gh pr view <N> --json mergeable,mergeStateStatus,state` | `glab mr view <N>` (detailed merge status) **verify** |
| Merge | `gh pr merge <N> --<strategy> [--delete-branch] --match-head-commit <sha> --subject <s> --body <b>` | `glab mr merge <N> [--squash] [--remove-source-branch] --yes` |
| Verify merged | `gh pr view <N> --json state,mergeCommit` | `glab mr view <N>` shows `merged` |
| Revert PR | same as open, on a `revert/<ticket>` branch | same |

## Gate policy

| Gate | When it stops | Override |
|---|---|---|
| Plan interview (Phase 3) | Always | none |
| Second-opinion deltas (Phase 4) | Only when the panel's verdicts change the plan materially or your confidence is low | none |
| Review-fix direction (Phase 9) | Only when a valid finding contradicts the agreed plan or your confidence is low | none |
| Merge (Phase 10) | Stops when `policy.merge` is `pause`, or the user said "pause before merge". `pr.required_approvals` > 0 is a **wait**, not a stop | sidecar `policy.merge` |
| Deploy (Phase 11, or before merge when `deploy.merge_deploys`) | Stops unless `deploy.auto` is true or the user answered the Phase 3 deploy question with yes. That answer **is** the human authorisation this gate exists to obtain, for this run only; it never changes the sidecar | sidecar `deploy.auto` |
| Review without a panel (Phase 8) | Stops when `multi-llm-review` is absent and either `review.allow_harness_fallback` is false or the harness has no reviewer subagent; asks whether to proceed on the harness's single review, wait, or skip | sidecar `review.allow_harness_fallback` |
| Post-watch failure (Phase 12) | Never; the recovery procedure runs autonomously and reports. `policy.fix_forward` false skips the fix-forward round and rolls back at once | sidecar `policy.fix_forward` |

## Parallel map

| Phase | Runs in the background meanwhile |
|---|---|
| 0 Intake | Workspace creation and dependency install (Phase 1); the review roster precheck when `multi-llm-review` is installed: `python3 ~/.agents/skills/_lib/review roster --panel <review.default_panel> --caller-model <your model>` is offline and prints the seats that would run, the gateway state and your self-skip, so a thin roster is known before the Phase 3 panel question rather than 15 minutes after it. The live health check itself happens at launch in Phase 8 |
| 2 Pre-work | Second-opinion panel on the draft plan when warranted, pointed at a detached snapshot worktree of the base SHA so Phase 5 may edit the workspace meanwhile (result consumed in Phase 4) |
| 3 Interview | Second-opinion still running; nothing else |
| 5 Implement | The second opinion, on its own snapshot; nothing else that edits the workspace |
| 7 PR opened | Phase 8 review panel and the CI / PR-bot wait run **concurrently against the same pinned SHA** |
| 11 Deploy | Delivery summary drafted while the rollout progresses |
| 12 Watch | Delivery summary finalised; worktree cleanup prepared but not executed |

Anything not in this table runs sequentially.

---

## Phase 0: Intake

1. Resolve the ticket reference against `tracker.id_pattern`: a match is a
   ticket ID, anything else is free text for ticket-less mode. When the
   tracker is live, run `tracker.commands.auth_probe` first. If it fails and
   the invocation carried **only an ID**, stop: the ticket was the whole
   specification and you cannot invent it. Report the probe failure and ask
   for the task description or for the credential to be fixed. If it fails
   but the invocation also carried a task description, continue with every
   tracker step as a no-op and say so in the wrap-up. For a tracker ID, read the ticket with `tracker.commands.view` **in
   full**: description, every comment, and every linked document or spec.
   There is no marker convention; planning notes, heads-ups and constraints
   appear anywhere in the body or comments and all of them bind. Extract them
   into the subtask list under "Ticket constraints".
2. Ticket-less mode (`tracker.ticketless` true and the argument is text): the
   argument is the ticket; every status transition and ticket comment below
   becomes a no-op and the delivery summary goes to the local plan file only.
3. Create the subtasks, one per phase.
4. Move the ticket to in progress: `tracker.commands.set_state` with
   `tracker.states.in_progress`, substituting `<PREVIOUS>` with the state the
   ticket is leaving (label-based trackers need it to remove the old label;
   read it from the ticket you just viewed). **Repo-backed trackers**
   (`tracker.repo_backed`, Backlog.md): the state change is a file edit, so
   make it **inside the workspace after Phase 1**, never in the main
   checkout; it rides the PR. The done edit in Phase 13 is a separate commit
   on the base branch.
5. Start Phase 1 and the review roster precheck in the background.

## Phase 1: Workspace

Per sidecar (`workspace`):

- **worktree** mode: `git fetch <remote>` then create a worktree and branch
  off `workspace.base_ref` under `workspace.worktree_dir`, named by
  `workspace.branch_pattern`. Branch off the remote ref, never local `main`;
  local `main` is often behind. All edits, builds and tests happen inside the
  worktree. A fresh worktree has **no dependencies installed**; run
  `workspace.setup` before anything else.
- **in-place** mode: `git fetch`, then create the branch from
  `workspace.base_ref` in the main checkout. Require a clean tree first; if
  it is dirty, stop and ask.

## Phase 2: Pre-work and draft plan

1. Read the code the ticket touches until you can name files, approach and
   trade-offs. Probe running systems only through read-only commands.
2. Draft the plan: scope, files, approach, tests, docs, risks, what is out of
   scope. Note every decision you could not derive and every point where your
   confidence is low.
3. **Second opinion, optional.** If the plan is complex (cross-cutting,
   irreversible, security- or data-adjacent, or you hold two credible
   approaches), and the `second-opinion` skill is installed, choose its panel
   yourself in proportion to the risk and launch it **in the background now**,
   with the draft plan as the proposal. The reviewers read a tree, and Phase 5
   will edit the workspace before they finish, so give them their own
   snapshot: `TMP=$(mktemp -d) && git worktree add --detach "$TMP" <base SHA>`,
   and pass that path as the review root (the plan reviews existing code; no
   diff exists yet). Put it under `mktemp -d`, never inside the repo or the
   delivery worktree: a review root nested in the tree you are editing is the
   drift this snapshot exists to prevent. Record the path in the subtasks and
   remove the worktree in Phase 13. Do not wait for the panel. If the skill
   is absent, ask your harness for one independent reviewer subagent on the
   plan instead, also in the background and against the same snapshot.
   Record in the subtasks that it is running.

## Phase 3: Plan interview (the checkpoint)

1. Present the plan tightly. Then ask the genuine design decisions only,
   typically two or three, recommended option first and labelled. Decide the
   obvious ones yourself and state them.
2. If a second opinion is running, say so and continue; do not block on it.
3. **Ask the review panel last, always.** This question is never skipped:
   only the user knows what this change is worth. Offer the panels the
   installed `multi-llm-review` skill defines (`fast`, `default`, `pro`,
   `ultra` as of template 1.0) with your recommendation based on blast radius
   and reversibility, not diff size. The sidecar's `review.default_panel` is
   the recommendation when nothing argues otherwise. Say which seats will
   self-skip because they match your own model. If the skill is absent on
   this machine, say so and offer the fallback: independent reviewer
   subagents from the harness, ideally two with different models.
4. If the user said "pause before deploy" this run, record that: it forces a
   stop at the deploy gate no matter what `deploy.auto` says, and you skip the
   question below. Otherwise, if `deploy.auto` is false and deploy is live
   (`deploy.state` adopted or substituted, shape not `none`), ask now whether
   to deploy this run. This is
   the only deploy question: Phase 11 acts on the answer, and when
   `deploy.merge_deploys` is true so does Phase 10, because there the merge
   is the deploy. A "no" with `merge_deploys` means the PR stays open,
   approved and unmerged, and the report says why.
5. Record every answer verbatim in the subtask list.

## Phase 4: Final plan

1. Write the plan to the plan artifact, file named `<ticket>-<slug>.md`
   under `plan.local_dir`. Where that file lives follows `plan.commit`: true
   means inside the workspace, so it is committed in Phase 7 and ships with
   the PR; false means under the **main checkout** or `/tmp`, never inside a
   worktree that Phase 13 removes. Post the same plan as a ticket comment
   (`tracker.commands.comment`) unless ticket-less.
2. When the second opinion lands, validate each verdict against the code, not
   the reviewer's paraphrase. Fold the valid ones in. If a verdict changes
   the plan materially or your confidence stays low, run **one short
   follow-up interview covering only the deltas**; otherwise update the plan
   file and comment and continue.
3. If the second opinion has not landed by the end of Phase 5, read it then
   and treat any material verdict as a Phase 9 finding.

## Phase 5: Implement

- Work in the workspace. Match surrounding style, naming, comment density and
  idioms. Write tests that prove the behaviour, not tests that go through the
  motions; mirror the repo's pattern for skipping when a toolchain is absent.
- Update docs the change requires, respecting feature gating noted in
  `project_notes` below.
- Confirm `git status` shows only intended files before Phase 6.

## Phase 6: Quality gates

Skip this phase when `gates.state` is `skipped` or `impossible`; say so here
and again in the PR body, because the PR then carries no local evidence.
Otherwise run every command in `gates.commands`, in order, and make them green. Apply
the autofixers in `gates.autofix` first when a gate fails on formatting or
lint. Fix what the tooling surfaces; do not disable a check to pass it. If a
gate is impossible on this machine (missing toolchain), say so and rely on
CI for that gate, naming it in the PR body.

## Phase 7: Commit and open the PR

When `pr.state` is `skipped` or `impossible` there is no PR flow: commit, run
the Phase 8 review against the local range `<base>...HEAD`, address findings,
then push straight to `pr.base`. The wrap-up says the change landed without a
PR. **The gates do not disappear with the PR**: that push is the merge, so
apply Phase 10's `policy.merge` gate and, when `deploy.merge_deploys` is true,
Phase 10 step 0's deploy gate and previous-ref capture **before** pushing.
Recovery in Phase 12 reverts by pushing a revert commit rather than a revert
PR. Otherwise:

```bash
git add <explicit paths>                       # never add -A
git commit -m "<pr.title_pattern rendered>" -m "<body>"
git push -u <remote> <branch>
gh pr create --base <pr.base> --head <branch> --title "<title>" --body-file <file>
```

Use the repo's forge CLI (`pr.forge`: `gh` or `glab`). Write the PR body to a
file; heredocs are often blocked and files avoid escaping artifacts. Capture
the pushed SHA: `git rev-parse HEAD`. That SHA is what Phase 8 reviews.

## Phase 8: Review

**Pin the review to the pushed SHA and freeze the tree until findings are
synthesised.** Reviewers read the tree at their own execution time, so any
edit mid-run makes their findings drift.

1. If `multi-llm-review` is installed: run it with the panel recorded in
   Phase 3, following its SKILL.md exactly for the launch recipe of your
   harness, the review root (the worktree path, never the main checkout),
   the caller-model variable, and the mandatory prompt footer. Launch it in
   the background; it takes several minutes and a foreground call that dies
   loses every review.
2. If it is absent and `review.allow_harness_fallback` is true and the
   harness has reviewer subagents: launch at least one, preferably two,
   independent read-only reviewer subagents against the same SHA and range,
   with the same light prompt (what changed, why, files, design intent, focus
   on correctness). Name the degraded coverage in the wrap-up. If the flag is
   false, or the harness has no subagents, this is a conditional stop: ask
   whether to proceed on your own single review, wait for a machine with the
   panel, or skip review for this run, recommendation first.
3. **Concurrently**, wait for CI and PR bots on the same SHA:
   `gh pr checks <N>`, the PR reviews, and inline comments. Expect whatever
   `pr.bots` lists and gate on what `gh pr checks` actually reports; bot
   rosters drift.
4. Hold all edits until both the panel and the bots have reported.

## Phase 9: Address findings

1. Validate every finding against the actual code at HEAD. Categorise valid,
   invalid, acknowledged. Cross-referenced findings carry more weight;
   scrutinise singletons. Reason over the evidence, never the paraphrase.
2. Fix the valid ones, **re-run every gate in `gates.commands`** on the
   fixed tree (skip when `gates.state` is not live, as in Phase 6), then commit and push once. Acknowledge out-of-scope or
   infrastructure findings with a reason instead of expanding the PR. Capture
   the new head SHA; Phase 10 requires CI green on **that** SHA, not the
   reviewed one.
3. **Conditional stop**: if a valid finding contradicts the agreed plan or you
   are not confident whether it is valid, ask the user with your
   recommendation first. Otherwise do not stop.
4. Score the reviewers if the review skill asks for it (see its SKILL.md).
5. A blocking bot review you fix gets re-reviewed after the push; wait for
   the new review rather than overriding.

## Phase 10: Merge

0. **If `deploy.merge_deploys` is true, the merge is the deployment.** Apply
   the deploy gate now: a "pause before deploy" this run, or `deploy.auto`
   false with no yes in Phase 3, means **stop here with the PR open** — there
   is no way to merge without deploying. Phase 11 then has nothing to run and
   Phase 12 starts at the merge. The rollback ref and the log baseline are
   captured in step 4 below, not here: recorded now they would go stale while
   steps 1 to 3 wait on CI and approvals.
1. Capture the head SHA and confirm CI is green **on it**:
   `gh pr view <N> --json headRefOid` gives the SHA, `gh pr checks <N>`
   reports the runs (it does **not** print which SHA it checked, so compare
   deliberately rather than trusting the listing). A push in Phase 9
   invalidates earlier results. Pass that SHA to the merge as
   `--match-head-commit <sha>` so a concurrent push between the check and the
   merge aborts instead of merging unreviewed code. Then confirm
   mergeability: `gh pr view <N> --json mergeable,mergeStateStatus,state`.
   Check protection with the rulesets endpoint
   (`gh api repos/<o>/<r>/rules/branches/<base>`), never the legacy
   `/protection` endpoint alone, which 404s under rulesets. Repos without CI
   rely on the Phase 9 gate run; say so in the summary.
2. If `pr.required_approvals` > 0, request `pr.reviewers` and **wait**,
   polling; this is a wait, not a stop.
3. **Merge gate**: if `policy.merge` is `pause`, or the user said "pause
   before merge", stop here, present the merge command and the state you
   verified, and wait.
4. **Immediately before merging**, when `deploy.merge_deploys` is true: run
   `deploy.previous_ref_command` and record the result, and capture the log
   baseline (`deploy.watch.logs` over the last `duration_minutes`). Last thing
   before the merge, so neither goes stale in an approval wait. Label it the
   **pre-ticket** rollback target, distinct from any later capture.
5. Merge with `pr.merge_strategy` (squash by default), deleting the branch if
   `pr.delete_branch`. Subject follows `pr.title_pattern` plus the PR number.
6. Known quirk: from inside a worktree, `--delete-branch` fails its local
   cleanup with "main is already used by worktree" while the remote merge and
   branch delete succeed. Verify instead of retrying:
   `gh pr view <N> --json state,mergeCommit`, then
   `git ls-remote --heads <remote> <branch>` (empty means deleted).
7. Move the ticket to in review or the state the sidecar maps to "merged,
   not yet verified" (`tracker.states.in_review`). Skip if the tracker has no
   such state. **Repo-backed tracker**: this is a post-merge file edit, so
   make it in the main checkout on the updated base exactly as Phase 13
   describes for the done edit, never in the worktree Phase 13 removes.

## Phase 11: Deploy

Per sidecar (`deploy`). Shape `none`, or `deploy.state` skipped or
impossible: skip to Phase 13 and say so. `merge_deploys` true: the deploy
already happened in Phase 10; go straight to Phase 12.

- Gate: stop if the user said "pause before deploy". Otherwise proceed if
  `deploy.auto` is true or the user chose "deploy" in Phase 3; failing both,
  stop, present the exact deploy commands and wait.
- **Before** deploying, unless the shape is `pseudo-container`: run
  `deploy.previous_ref_command` and record the result so rollback has an
  explicit target. **Keep the first one**: label it the *pre-ticket* target
  and never overwrite it, because the Phase 12 fix-forward round comes back
  through this phase and a second capture would record the broken original as
  the thing to roll back to. Later captures are notes, not replacements.
  Then capture the log baseline by running
  `deploy.watch.logs` over the last `duration_minutes`. A baseline taken after
  the deploy would normalise a regression that starts at once.
  `pseudo-container` skips both: there is no previous revision, and the
  container the log command names does not exist until `deploy.commands`
  creates it. Its baseline is "no errors at all", which is the right bar for a
  container that just started.
- **Run from the merged base, not the feature branch.** After Phase 10 the
  deployable code is `pr.base` at the merge commit, which can also carry
  other work merged while this ticket ran. In the main checkout,
  `git fetch <remote> && git checkout <base> && git pull`, and run the deploy
  from there. A `docker build .` or a local chart apply from the worktree
  would ship the branch, not what actually merged.
- Run `deploy.commands` in order.
- Shape `pseudo-container` (no real deployment exists): build the artifact,
  run it locally as the sidecar describes, and treat the running container as
  the deployment for Phase 12.
- Draft the delivery summary while the rollout progresses.

## Phase 12: Watch

Watch for `deploy.watch.duration_minutes` (default 3). Pass criteria, all of
which must hold:

- `deploy.watch.health` succeeds (an HTTP check, a rollout status, a
  container staying up);
- `deploy.watch.logs` over the whole post-deploy window shows no error-level
  entries that were absent from the pre-deploy baseline and are attributable
  to the change;
- `deploy.watch.smoke`, when defined, exercises the delivered functionality
  and passes. If the ticket's feature is reachable and the sidecar has no
  smoke command, attempt a read-only check anyway and report what you did.

**On failure**, the recovery procedure runs autonomously:

1. Diagnose from the logs. If `policy.fix_forward` is false, skip to step 2.
   Otherwise attempt **one** fix-forward round through the shortened gate
   chain: `gates.commands`, one independent review (no panel), PR, merge when
   CI is green, deploy, watch again for the full duration. Note the panel
   review of the fix as a follow-up in the summary. The review here is a
   harness reviewer subagent when one exists; where Phase 8 established that
   this harness has none, it is your own careful re-read of the fix, and the
   report says which it was. A missing subagent never blocks recovery and
   never silently skips the fix-forward.
2. If the fix-forward fails, is skipped, or you cannot diagnose within the
   round, **roll back to the pre-ticket state**:
   - Run `deploy.rollback` naming the revision recorded **before the original
     deploy**. Never "the previous one": after a fix-forward that is the
     broken original, and rolling back to it restores the outage. When
     `deploy.rollback` is empty, that is the `pseudo-container` case and is
     not an omission: stopping and removing the verification container is the
     whole deployment rollback, and the code revert below does the rest.
   - Revert on `pr.base` **exactly what actually merged** — the original
     merge alone if the fix never merged (a fix that failed its gates, its
     review or CI merged nothing), both merges if it did — through a revert
     PR merged on green CI, so the tree matches the deployment. When both
     merged, revert them **newest first**: the fix, then the original.
     Reverting the original first conflicts with the fix that builds on it,
     and a partial revert leaves the broken original restored. Close an
     unmerged fix PR with a comment; it needs no revert.
   - **Do not revert twice.** When `deploy.merge_deploys` is true the rollback
     recipe *is* this revert PR plus a sync, so run it once: the revert lands,
     the controller reconciles, and there is no separate `deploy.rollback`
     step. Read `deploy.rollback` before acting and skip whichever half it
     already performs.
   - Stop the verification container if the shape is `pseudo-container`, and
     run the Phase 13 cleanup step: this branch never reaches Phase 13 on its
     own, and skipping it leaks a worktree and a container.
   - Move the ticket back to in progress with a comment stating what broke,
     what was tried, and the current state. Stop with a full report.
3. Never attempt a second fix-forward round.

**When `pr.state` is not live**, the same procedure runs without PRs: the
fix-forward round ends in a direct push to `pr.base` once the gates and the
review pass, and the rollback is a revert commit pushed to `pr.base` rather
than a revert PR. Nothing else changes.

## Phase 13: Done and wrap-up

1. Post the delivery summary as a ticket comment: what landed (PR, merge
   SHA), approach, review findings fixed and acknowledged, deploy and watch
   result, known limitations, follow-ups. **Repo-backed tracker**: the comment
   is a file edit too, so write it in the main checkout on the updated base
   and land it in the same one-file commit as the done state below. Write the same summary to the plan
   artifact when it lives outside the workspace; a committed plan file
   already shipped with the PR and the summary belongs in the ticket and the
   PR description.
2. Move the ticket to done: `tracker.commands.close` when the sidecar defines
   one (trackers where done is a distinct operation rather than another state,
   such as GitHub and GitLab issues), otherwise `tracker.commands.set_state`
   with `tracker.states.done`. **Repo-backed tracker**:
   this is a file edit on the base branch after the merge, and the only step
   that touches the user's main checkout. Check it first with
   `git -C <main> status --porcelain`. If it is clean, make the edit there on
   a fresh branch off the updated base and land it as a one-file commit:
   direct push when the base accepts it, otherwise a tiny PR merged on green
   CI. **If it is dirty, or another session holds it, do not touch it**: make
   the edit in a throwaway worktree off the updated base
   (`git -C <main> worktree add --detach $(mktemp -d) <base>`), push from
   there, and remove it. Never make the edit in the delivery worktree you are
   about to remove.
3. Clean up, **only after every record above is persisted** (ticket comment
   posted, done state landed, plan file outside the workspace). Per
   `workspace.mode`:
   - **worktree**: `git -C <main> worktree remove --force <path>`, then
     delete the branch with `-D` (a squash-merged branch is not an ancestor
     of the base).
   - **in-place**: there is no worktree to remove and the branch may still be
     checked out. `git checkout <base> && git pull`, then delete the branch
     with `-D`. Never run `worktree remove` here; it has nothing to remove.

   In both modes: remove the second-opinion snapshot worktree if one was
   created, and stop and remove any pseudo-container.
4. Report plainly: PR number and merge SHA, ticket state, gates run, deploy
   and watch outcome including `deploy.target_class` so the human sees what
   was touched, and what was cleaned up. **Name the review panel and its
   real coverage** as `N of <panel size>` reviewers that ran, or "harness
   fallback, N reviewers". Note if local `main` is behind the remote; do not
   pull for the user if their tree is dirty.
5. Surface friction: anything that fought you, with a concrete fix proposed
   to the sidecar, this skill, or the project docs. Sidecar corrections are
   yours to make now; skill and doc edits are proposals.

---

## Project notes

Prose facts about this project that have no sidecar key. Written at adoption
(2026-09-22) and maintained by hand. Local edits to this file are carried
across template upgrades by the `adopt-deliver-ticket` skill.

- **`AGENTS.md` is a symlink to `CLAUDE.md`.** Read one, not both. It is the
  map for this repo and it outranks this file wherever they disagree.
  `_vendor/nuxt/` is the pinned framework documentation — grep it on purpose,
  never by accident: it is 239 markdown files and `useFetch` has 153 hits
  there against single digits in source. Scope searches:
  `rg "useFetch" app server shared tests scripts`.

- **Resolving a Kaneo ticket key is a required first step, not a detail.**
  `NUXT-12` is a display label; `task get --id` wants the server's opaque id
  and there is no resolution command. Run `tracker.commands.resolve_id` with
  `<N>` = 12, substitute the result into every later `<TASK_ID>`. An empty
  result means the task does not exist — stop rather than guessing.

- **A task is required before touching `app/`, `server/`, `shared/`, the
  database schema, CI, dependencies or a documented rule in `CLAUDE.md`.** It
  is not required for a typo, a formatting fix or a comment-only edit — those
  are the only legitimate ticket-less invocations here. When in doubt, create
  the task: an unnecessary one costs a minute, an untracked schema change
  costs an afternoon.

- **`_vendor/` and `.agents/skills/nuxt-ui/` are generated. Editing them
  destroys your work silently** and fails `pnpm verify` via their
  `MANIFEST.sha256`. To change their content, change the script that writes it
  (`scripts/docs-sync.ts`, `scripts/skills-sync.ts`). `.agents/skills/kaneo-cli/`
  is different: a plain committed copy vendored from upstream v1.4.0 under its
  own MIT licence, exempt from that rule, updated by re-copying from the tag
  matching the installed CLI.

- **The non-guessable rules in `CLAUDE.md` are where delivery actually goes
  wrong.** The ones that bite hardest: never build an update schema with
  `createSchema.partial()` (rule 11 — a PATCH of `{title}` silently wipes
  `body` and `published`; this shipped once and passed every check in
  `verify`); return 404 not 403 for another user's draft (rule 10); `authorId`
  comes from the session, never the request body (rule 9);
  `no-floating-promises` needs `checkThenables: true` or it ignores every
  drizzle write (rule 14). Do not "fix" any of them back.

- **Changing the schema means generating a migration.** Editing
  `server/database/schema.ts` still typechecks — the types come from the schema
  file — so nothing complains until deploy. `pnpm db:generate` then
  `db:migrate`; the migration-freshness check in `verify` exists to catch the
  skip. Never hand-write the SQL.

- **Never read the secret-bearing paths**, not even with `grep`: `grep
  API_KEY .env` prints the value straight into context and from there into a
  plan or a PR body. `workspace.setup` copies `.env` into the worktree without
  reading it, which is the intended way to get it there. To learn which keys
  exist, read `.env.example`.

- **Server errors in dev land in `.logs/dev-errors.jsonl`**, one JSON object
  per line with method, path, status, validation details and a trimmed stack —
  read it instead of asking for a pasted trace (`tail -5
  .logs/dev-errors.jsonl | jq .`). Known secret shapes are redacted there, but
  the redaction is pattern-based and NOT exhaustive, and `.logs/dev.log` is
  raw process output with no redaction at all.

- **Do not add a dependency, switch the ORM/UI/auth library, or change the
  rendering mode without being asked.** The stack was chosen deliberately and
  `README.md` records what and why, including what is deliberately *not*
  installed (`@nuxt/image`, `@nuxtjs/seo`, `@vueuse/nuxt`, `nuxt-security`)
  and the package to reach for when the need becomes real. TypeScript stays on
  6.x — TS 7 breaks typescript-eslint, vue-tsc and Nuxt's generated `$fetch`
  types, with the evidence in `_docs/decisions/typescript-7.md`.

- **Better Auth owns sessions.** Never mint a cookie or add a parallel auth
  endpoint. Behavioural probes sign in through the standard endpoint with a
  cookie jar: `curl -s -c /tmp/jar -X POST localhost:3000/api/auth/sign-in/email
  -H 'content-type: application/json' -d '{"email":"…","password":"…"}'`, then
  `curl -s -b /tmp/jar localhost:3000/api/posts`.

- **This skill lives at `.agents/skills/deliver-ticket/`, and
  `.claude/skills/deliver-ticket/` is the same directory** seen through the
  repo-level `.claude/skills -> ../.agents/skills` symlink. That inverts what
  `adopt-deliver-ticket` normally renders (real files under `.claude/`, a
  per-skill symlink under `.agents/`), so **there is no per-skill symlink here
  and there must not be** — one would point at itself. `check-adoption.sh`
  fails its last assertion for this reason alone; that failure is expected and
  is not a broken adoption. Do not "fix" it by moving the files under
  `.claude/`: CLAUDE.md forbids that explicitly.

- **`.backlog/` is a stale empty tree** left by the file-based tracker Kaneo
  replaced in NUXT-1. It is untracked and harmless; ignore it, and do not
  resurrect it as a second source of truth.
