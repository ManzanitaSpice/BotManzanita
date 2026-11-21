# `/ban` by nickname or Discord ID Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guild-only `/ban objetivo` command that resolves current members by nickname and accepts a Discord ID directly.

**Architecture:** Keep command metadata and ban execution in a focused moderation command module. Route its autocomplete through the existing interaction handler, use REST member search for nicknames, and call Discord's guild ban API with an optional audit reason.

**Tech Stack:** TypeScript, discord.js 14.28.0, existing slash-command registry and interaction handler.

**Spec:** `docs/superpowers/specs/2026-11-20-ban-by-nickname-or-discord-id-design.md`

## Global Constraints

- `/ban objetivo` only works inside the current server.
- The command requires `BanMembers`; the bot also requires `BanMembers` and a role above a member target.
- The invoking moderator is authorized by `BanMembers`; the bot's role hierarchy is checked separately.
- A nickname is chosen from autocomplete results for current members; a Discord ID can target someone outside the server.
- Include an optional reason in Discord's audit log.
- Do not enable the privileged `GuildMembers` gateway intent solely for this feature.

## Review Focus

- Valid ID of a current member below the bot role: ban succeeds and confirms privately.
- Valid ID of a non-member: attempt the ban directly by ID.
- Non-ID text without a selected autocomplete result: reject it without banning anyone.
- Duplicate or similar nicknames: each result carries its own ID; never choose one arbitrarily.
- Missing user or bot `BanMembers` permission, or a target at/above the bot role: refuse with a private explanation.

## Files

- Create `src/commands/moderation.ts` for `/ban`, autocomplete results, permission checks, and ban execution.
- Modify `src/commands/registry.ts` to register the command.
- Modify `src/events/interaction-create.ts` to dispatch `/ban` autocomplete.

## Implementation Task

### Task 1: Add `/ban` moderation command

**Interfaces:**

- Export `banCommand: BotCommand` from `src/commands/moderation.ts`.
- Export `banAutocomplete(guild: Guild, query: string)` returning Discord autocomplete choices whose `value` is the target user ID.

- [x] Define `/ban objetivo` as a guild-context slash command with `BanMembers` default permission, autocomplete enabled on the required target string, and an optional reason.
- [x] Implement autocomplete: return the typed value as a selectable choice for a valid Discord snowflake; otherwise use `guild.members.search({ query, limit: 25 })` and map each member to a display label plus its ID value.
- [x] Implement execution: accept only a valid snowflake value; confirm the invoking moderator and bot have `BanMembers`; fetch the bot member; reject the guild owner, the bot itself, and current members whose highest role is not below the bot's; ban by ID with the optional reason; respond privately with success or a clear failure.
- [x] Defer the private interaction response before REST calls and edit it afterward, with success delivery outside the ban request's error handler.
- [x] Register `banCommand` in `src/commands/registry.ts` and dispatch its autocomplete in `src/events/interaction-create.ts`, responding with no choices when there is no guild or search fails.
- [x] Run `npm run build` and confirm TypeScript compilation succeeds.
