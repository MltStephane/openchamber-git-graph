# Personas — Git Graph

> Reference document for the coding agent. The extension is personal: a single real user, seen in their two uses.

## Persona 1 — The developer driving agents

**Role:** PHP/Laravel and TypeScript developer, uses OpenChamber daily to run several agent sessions in parallel, often in worktrees.

### Context
- The Git Graph panel stays open on the rail while the agents work.
- Commits arrive without them typing them: an agent finishes its turn, another session rebases, they commit in a terminal themselves.
- They often switch project or worktree in OpenChamber.

### Goals
- See the history **up to date without thinking about it**: new commit, new branch, checkout, fetch.
- Spot the current branch at a glance, and whether the working copy is dirty.
- Open a commit's diff in one click.

### Frustrations
- A frozen graph that lies after an agent commit.
- A manual action to refresh.
- A tool that locks or slows down git while an agent is using it.

## Persona 2 — The same person, reviewing

**Context:** opens the full-screen page to review a day of agent work before pushing.

### Goals
- Browse a long history (pagination, filter by subject or author).
- Understand merges and parallel branches without ambiguity.
- Copy a hash for a `git cherry-pick` or a PR.

## Decision criteria for any change

1. Does the change keep the extension read-only?
2. Does the graph stay correct without user action?
3. Is it readable in a 300 px wide panel?
