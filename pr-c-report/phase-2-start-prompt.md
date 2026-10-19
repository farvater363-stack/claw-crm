Start phase 2 of the Claw CRM simplification from Task 0. Nothing of phase 2 is built yet. Phase 1 is finished, merged and on production.

Read first, before any code:
1. Plan (header, Global Constraints, Fixed identifiers, Shared names, the task table, then Task 0 onwards; the "Self-review notes" at the very end list every platform fact the authors could not confirm): ~/claw-private-docs/docs/superpowers/plans/2026-10-04-claw-simplification-phase-2.md
2. Spec (binding; §14 lists what planning found): ~/claw-private-docs/docs/superpowers/specs/2026-10-04-claw-simplification-phase-2-design.md
3. Design spec (wins on layout; on wording the phase 2 spec's §13 wins): ~/claw-private-docs/docs/superpowers/specs/2026-10-04-claw-ui-design.md
4. Code map of what exists today, with file and line: ~/claw-private-docs/docs/superpowers/plans/2026-10-04-claw-simplification-phase-2-code-map.md
5. The phase 1 ledger's last 40 lines, for the state of the local server and of production: /Users/mardon/CRM/.claude/worktrees/simplify-1b-prices/.superpowers/sdd/2026-10-04-claw-simplification-phase-1/progress.md

Where things stand:
- main is at f3118db1a0 (PRs #10, #11, #12, #13 merged). Production (app.clawcrm.net) runs it; its app functions are on (LOGIC_FUNCTION_TYPE=LOCAL).
- The plan has 26 tasks in four pull requests: D money (Tasks 0 to 7), E workers and pay (8 to 14), F screens (15 to 20), G contract (21 to 25). Each PR's branch starts from the previous one.
- The plan is 18 400 lines, written by four authors in parallel against the code map, and never executed. No test, typecheck, plan or browser run stands behind its code. Names that cross tasks were fixed and checked; inside a task, treat the code as a careful draft: when verbatim code fails its verbatim test, typecheck or lint, fix the smallest thing and say so in the report.
- The local server has main applied. Local data: 84 test orders, 14 grilles, 1 nameless material of mine. The local stack is down; check `uptime` and free memory before starting it. PR D changes Twenty's front (Task 1), so from PR D on the stack must run from a checkout that has that change, as Task 0 sets up.
- All existing orders, local and on production, are test data. They are deleted in Task 21, only after I confirm for that environment.

How to work:
- Execute the plan task by task with the superpowers:subagent-driven-development skill. Subagents run on Opus. Do Playwright debugging inline, not in a subagent. Follow the plan's Global Constraints exactly.
- Subagents start pinned to the session's worktree: tell each one to switch into the work worktree with EnterWorktree. One implementer at a time; never two writers in the same worktree. A hook refuses subagent writes into another worktree, so each implementer writes its report inside its own worktree's .superpowers folder and you copy it to the ledger folder.
- Tell each implementer to work in small steps and write files early. If one stalls or fails, check `git status` in the worktree before re-dispatching.
- Test first. After each task run unit tests, typecheck and lint, and do not move on while anything fails.
- A fix round that touches only tests, wording or layout needs no separate re-review agent if you verify it yourself (run the test, look in the browser). Money, data and permission changes keep the full review loop.
- Before every `yarn twenty apply`: run `yarn twenty plan` and read the destroy list. Apply only if every destroy is something the plan removes in that task, counting the dependents of a removed object or field (its view columns, form widgets, permissions). Anything else: stop and ask me.
- The typed API client is generated from the server. After a task that adds fields or objects, do the checkpoint the plan names (D0a, D0b, E0, G1): plan, apply, `yarn twenty dev:generate-client`, typecheck.
- `yarn test:integration` syncs the working tree to the server before it runs. Never run it, or an apply, while an implementer is editing the worktree.
- A select option keeps its id when it is relabelled (the fourth entry of its tuple). Never regenerate the option-id snapshot to make a relabel pass.
- The machine is fragile: heavy commands one at a time, never several test or typecheck runs in parallel. Give long browser scripts a time limit; they can hang at browser.close().
- You may use my API key from ~/.claw-api-key by shell substitution in the command. Never print it or put it in a file, report or commit. Test logins are in ~/.claw-test-users. There is no local user with the «Цех» role.
- In Playwright, anything inside a page widget needs `{ force: true }`, a select needs a change event (the `chooseOption` helper), and role names must be exact. Before running the specs of Task 23, reconcile its table "Accessible names this spec relies on" with what the screens of PR E and PR F really render.
- Before opening each PR run the requesting-code-review skill and fix what it finds. I merge PRs myself unless I tell you otherwise; give me the merge command (merge commit, not squash).
- No AI attribution in commits or PR text. Public repo: synthetic numbers and invented names only, no screenshots with local data in a PR.

Stop and ask me at these points, and nowhere else unless blocked:
- Before `MOVE=apply` of the delete-all-orders script (Task 21), on any environment.
- If a count in Task 22 Step 1 is not zero.
- If a plan's destroy list has anything that is not a removed thing or its dependent.
- If a platform fact from the plan's Self-review notes turns out false and its fallback changes what a user sees.
- If the permission classifier refuses an apply or a command you need.

Never touch production unless I ask in that conversation. Task 25 only writes the production runbook for me. Lessons from the phase 1 rollout that the runbook must carry: check the latest change time before each write step (somebody was editing during the window); `yarn twenty remote:add` makes the re-added remote the default, so run `yarn twenty remote:use claw-local` straight after; the CLI's saved production key can go invalid; test one app function after each deploy; compare production's destroy list item by item with the lists approved locally; the workspace schema on production is workspace_cim2ln854l4gmrlymgtj6tu03.

Open items of mine that are not part of the plan (remind me in the final report):
- On production nobody holds the roles Менеджер, Замерщик or Цех (two Admin, one Member who sees everything). Phase 2 needs them assigned and each worker's «Логин» linked.
- The production API key I pasted into a chat should be replaced.
- Three grilles were soft-deleted on production because they had no price («Маракконд 1», an unnamed one, «Маракконд 1 · Прут»).
- The eight items waiting for my decision in pr-b-report.md, and the wording lists of phase 1 and of each phase 2 task ("Wording not from the spec").
- Linear is not authorized in these sessions: no issue lookup or progress comment was made.

When each PR is ready, report: what was built, test results with the actual output, screenshots of the screens at 375 px and in dark theme (and at 1920 px for «В работе»), which fallbacks were taken, and what is not verified. Include every ledger line that contains "Ruling:" under "Rulings I made".
