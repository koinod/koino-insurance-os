# Stale Branch Cleanup — 2026-06-14

**Operator:** Ian (bigbacon61)
**Run by:** Claude Code session (audit-docs + branch-deletes lane)
**Repo:** `koinod/koino-insurance-os`
**origin/main HEAD at audit time:** `aeaa00319c1f0cc461e6d6a34cb23e8b47412f40`

## Methodology

```bash
git fetch origin --prune
git branch -r --merged origin/main | grep -v "main\|HEAD" | sort
git for-each-ref --format='%(refname:short)|%(committerdate:iso8601)|%(committerdate:relative)' refs/remotes/origin
gh pr list --state open --json headRefName    # → (empty: no open PRs)
```

Categorization rules:
- **MERGED into main** → safe to delete remotely
- **>30 days idle AND no open PR** → safe to delete remotely
- **<30 days OR has open PR** → leave alone

## Remote branch inventory

Total remote refs: **3** (`origin/HEAD`, `origin/main`, one feature branch).

| Branch | Last commit | Age | Merged? | Ahead/Behind main | Open PR? | Decision |
|---|---|---|---|---|---|---|
| `origin/main` | 2026-06-13 | — | — | — | — | keep (trunk) |
| `origin/claude/beautiful-agnesi-94775d` | 2026-05-26 | ~18 days | **No** | +1 / −207 | No | **LEAVE ALONE** |

## Decisions

- **`claude/beautiful-agnesi-94775d`** — NOT merged into main (carries 1 unique commit), last activity 2026-05-26 (~18 days, **under the 30-day threshold**), no open PR. Per the rules, <30 days → leave alone. The single unmerged commit is not yet captured anywhere on main, so deleting now would lose it. Re-evaluate after 2026-06-25 (30-day mark); if still unmerged and no PR, it becomes a delete candidate.

## Result

**Branches deleted: 0.**

Nothing met the safe-delete criteria (no merged branches; the only feature branch is <30 days old with an unmerged commit).

- Remote branch count **before** prune+cleanup: **3**
- Remote branch count **after**: **3** (no deletions executed)

No `git push origin --delete` commands were run.
