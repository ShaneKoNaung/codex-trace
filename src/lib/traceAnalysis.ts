import type { CodexToolCall, CodexTurn, TurnSummary } from "../../shared/types";

export type ActivityCategory =
  | "inspect"
  | "edit"
  | "verify"
  | "package"
  | "research"
  | "collaborate"
  | "other";

export interface SemanticToolInfo {
  label: string;
  detail: string | null;
  category: ActivityCategory;
}

export interface ActivityGroup extends SemanticToolInfo {
  count: number;
  timedCount: number;
  durationMs: number;
  failedCount: number;
}

export interface ActivityPhase {
  category: ActivityCategory;
  label: string;
  count: number;
  timedCount: number;
  durationMs: number;
}

export interface TurnAnalysis {
  durationMs: number;
  toolDurationMs: number;
  orchestrationMs: number;
  toolSharePercent: number;
  toolTimingComplete: boolean;
  failedToolCount: number;
  groups: ActivityGroup[];
  phases: ActivityPhase[];
  findings: string[];
}

export interface SessionAnalysis {
  wallClockMs: number;
  activeMs: number;
  idleMs: number;
  toolCallCount: number;
  reasoningCount: number;
  totalTokens: number;
}

const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  inspect: "Inspect",
  edit: "Edit",
  verify: "Verify",
  package: "Package",
  research: "Research",
  collaborate: "Collaborate",
  other: "Other",
};

function commandText(tool: CodexToolCall): string {
  if (tool.command?.length) return tool.command.join(" ");
  const cmd = tool.arguments?.cmd;
  return typeof cmd === "string" ? cmd : "";
}

function humanize(name: string): string {
  return name
    .replace(/^mcp__[^_]+__/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function fileSummary(tool: CodexToolCall): string | null {
  const paths = tool.patch_changes ? Object.keys(tool.patch_changes) : [];
  if (paths.length === 0) return null;
  if (paths.length === 1) return paths[0];
  return `${paths.length} files`;
}

export function semanticToolInfo(tool: CodexToolCall): SemanticToolInfo {
  if (tool.kind === "patch_apply") {
    return { label: "Edit files", detail: fileSummary(tool), category: "edit" };
  }
  if (tool.kind === "web_search") {
    return { label: "Search web", detail: tool.web_query, category: "research" };
  }
  if (tool.kind === "image_generation") {
    return { label: "Generate image", detail: tool.image_prompt, category: "package" };
  }
  if (tool.kind === "spawn_agent") {
    return { label: "Start worker", detail: tool.subagent_name, category: "collaborate" };
  }
  if (tool.kind === "wait_agent") {
    return { label: "Wait for worker", detail: tool.subagent_name, category: "collaborate" };
  }
  if (tool.kind === "interrupt_agent") {
    return { label: "Stop worker", detail: tool.subagent_name, category: "collaborate" };
  }
  if (tool.kind === "followup_task") {
    return { label: "Message worker", detail: tool.subagent_name, category: "collaborate" };
  }
  if (tool.kind === "shell_hook") {
    return { label: tool.name, detail: null, category: "other" };
  }
  if (tool.kind === "mcp_tool") {
    const name = tool.mcp_tool ?? tool.name;
    const lower = name.toLowerCase();
    let category: ActivityCategory = "other";
    if (/search|find|list|get|read|view|open|screenshot/.test(lower)) category = "inspect";
    if (/create|update|write|send|post|delete|remove/.test(lower)) category = "edit";
    if (/test|check|validate|verify/.test(lower)) category = "verify";
    return {
      label: humanize(name),
      detail: tool.mcp_server ? `MCP ${tool.mcp_server}` : null,
      category,
    };
  }

  const command = commandText(tool).trim();
  const lower = command.toLowerCase();
  const detail = command || null;

  if (/kicad-cli(?:-nightly)?\s+pcb\s+drc/.test(lower))
    return { label: "Run KiCad DRC", detail, category: "verify" };
  if (/kicad-cli(?:-nightly)?\s+pcb\s+export\s+gerbers?/.test(lower))
    return { label: "Export Gerbers", detail, category: "package" };
  if (/kicad-cli(?:-nightly)?\s+pcb\s+export\s+drill/.test(lower))
    return { label: "Export drill files", detail, category: "package" };
  if (/kicad-cli(?:-nightly)?\s+pcb\s+(render|export\s+(svg|png|stl))/.test(lower))
    return { label: "Render PCB", detail, category: "package" };
  if (/\b(vitest|jest|pytest|cargo\s+test|go\s+test|npm\s+(run\s+)?test)\b/.test(lower))
    return { label: "Run tests", detail, category: "verify" };
  if (/\b(tsc|cargo\s+(build|check|clippy)|npm\s+run\s+(build|check|lint)|oxlint)\b/.test(lower))
    return { label: "Check build", detail, category: "verify" };
  if (/\b(zip|tar|sha256sum|checksum)\b/.test(lower))
    return { label: "Package artifacts", detail, category: "package" };
  if (/\b(git\s+(status|diff|log|show|branch)|gh\s+(pr|issue))\b/.test(lower))
    return { label: "Inspect repository", detail, category: "inspect" };
  if (/\b(rg|grep|find|sed|cat|head|tail|ls|jq)\b/.test(lower))
    return { label: "Inspect files", detail, category: "inspect" };
  if (/\b(apply_patch|perl\s+-pi|sed\s+-i)\b/.test(lower))
    return { label: "Edit files", detail, category: "edit" };
  if (/\b(curl|wget)\b/.test(lower))
    return { label: "Fetch remote data", detail, category: "research" };
  if (/\b(python|python3|node|ruby)\b/.test(lower))
    return { label: "Run analysis script", detail, category: "inspect" };

  return {
    label: tool.name === "shell" || tool.name === "exec" ? "Run command" : tool.name,
    detail,
    category: "other",
  };
}

export function isEffectiveToolFailure(tool: CodexToolCall): boolean {
  if ((tool.exit_code !== null && tool.exit_code !== 0) || tool.patch_success === false)
    return true;
  if (tool.status === "failed" || tool.status === "error") return true;
  const output = tool.output?.toLowerCase() ?? "";
  return /script failed|verification failed|traceback|command failed|process exited with code [1-9]/.test(
    output,
  );
}

export function analyzeTurn(turn: CodexTurn): TurnAnalysis {
  const durationMs = turn.duration_ms ?? 0;
  const toolTimingComplete =
    turn.tool_calls.length > 0 && turn.tool_calls.every((tool) => tool.duration_secs != null);
  const toolDurationMs = Math.round(
    turn.tool_calls.reduce((sum, tool) => sum + (tool.duration_secs ?? 0) * 1000, 0),
  );
  const orchestrationMs = Math.max(0, durationMs - toolDurationMs);
  const toolSharePercent = durationMs > 0 ? (toolDurationMs / durationMs) * 100 : 0;
  const failedToolCount = turn.tool_calls.filter(isEffectiveToolFailure).length;

  const groupsByLabel = new Map<string, ActivityGroup>();
  const phases: ActivityPhase[] = [];
  for (const tool of turn.tool_calls) {
    const info = semanticToolInfo(tool);
    const duration = Math.round((tool.duration_secs ?? 0) * 1000);
    const failed = isEffectiveToolFailure(tool);
    const group = groupsByLabel.get(info.label) ?? {
      ...info,
      count: 0,
      timedCount: 0,
      durationMs: 0,
      failedCount: 0,
    };
    group.count += 1;
    if (tool.duration_secs != null) group.timedCount += 1;
    group.durationMs += duration;
    if (failed) group.failedCount += 1;
    groupsByLabel.set(info.label, group);

    const previous = phases.at(-1);
    if (previous?.category === info.category) {
      previous.count += 1;
      if (tool.duration_secs != null) previous.timedCount += 1;
      previous.durationMs += duration;
    } else {
      phases.push({
        category: info.category,
        label: CATEGORY_LABELS[info.category],
        count: 1,
        timedCount: tool.duration_secs != null ? 1 : 0,
        durationMs: duration,
      });
    }
  }

  const groups = [...groupsByLabel.values()].toSorted(
    (a, b) => b.count - a.count || b.durationMs - a.durationMs,
  );
  const findings: string[] = [];
  if (toolTimingComplete && durationMs >= 60_000 && toolSharePercent < 20)
    findings.push(
      `Only ${toolSharePercent.toFixed(1)}% of this turn was recorded tool runtime; the rest was model generation and orchestration.`,
    );
  if (turn.tool_calls.length >= 25)
    findings.push(
      `${turn.tool_calls.length} sequential tool calls created a long inspect/edit/verify loop.`,
    );
  if (failedToolCount > 0)
    findings.push(
      `${failedToolCount} tool ${failedToolCount === 1 ? "failure was" : "failures were"} detected, including failures reported only inside tool output.`,
    );
  const repeated = groups.find((group) => group.count >= 5);
  if (repeated) findings.push(`${repeated.label} repeated ${repeated.count} times.`);

  return {
    durationMs,
    toolDurationMs,
    orchestrationMs,
    toolSharePercent,
    toolTimingComplete,
    failedToolCount,
    groups,
    phases,
    findings,
  };
}

export function analyzeSession(summaries: TurnSummary[]): SessionAnalysis {
  const starts = summaries.flatMap((summary) =>
    summary.started_at === null ? [] : [summary.started_at * 1000],
  );
  const ends = summaries.flatMap((summary) => {
    if (summary.completed_at !== null) return [summary.completed_at * 1000];
    if (summary.started_at !== null && summary.duration_ms !== null)
      return [summary.started_at * 1000 + summary.duration_ms];
    return [];
  });
  const wallClockMs = starts.length && ends.length ? Math.max(...ends) - Math.min(...starts) : 0;
  const activeMs = summaries.reduce((sum, summary) => sum + (summary.duration_ms ?? 0), 0);
  return {
    wallClockMs,
    activeMs,
    idleMs: Math.max(0, wallClockMs - activeMs),
    toolCallCount: summaries.reduce((sum, summary) => sum + summary.tool_call_count, 0),
    reasoningCount: summaries.reduce((sum, summary) => sum + summary.reasoning_count, 0),
    // Turn token totals are cumulative session usage, so the latest reported value is the
    // session total. Summing them substantially overcounts multi-turn sessions.
    totalTokens: summaries.reduce((latest, summary) => summary.total_tokens ?? latest, 0),
  };
}
