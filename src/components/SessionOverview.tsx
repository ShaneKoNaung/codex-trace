import type { TurnSummary } from "../../shared/types";
import { formatDuration, formatTokens } from "../../shared/format";
import { analyzeSession } from "../lib/traceAnalysis";

interface SessionOverviewProps {
  summaries: TurnSummary[];
  onSelectTurn: (index: number) => void;
}

interface TimelineSegment {
  kind: "turn" | "idle";
  durationMs: number;
  turnIndex?: number;
  label: string;
}

function timelineSegments(summaries: TurnSummary[]): TimelineSegment[] {
  const segments: TimelineSegment[] = [];
  let previousEnd: number | null = null;
  summaries.forEach((summary, index) => {
    const start = summary.started_at === null ? null : summary.started_at * 1000;
    const end =
      summary.completed_at !== null
        ? summary.completed_at * 1000
        : start !== null && summary.duration_ms !== null
          ? start + summary.duration_ms
          : null;
    if (start !== null && previousEnd !== null && start > previousEnd) {
      segments.push({
        kind: "idle",
        durationMs: start - previousEnd,
        turnIndex: index,
        label: "Waiting for user",
      });
    }
    const durationMs = summary.duration_ms ?? (start !== null && end !== null ? end - start : 0);
    if (durationMs > 0) {
      segments.push({ kind: "turn", durationMs, turnIndex: index, label: `Turn ${index + 1}` });
    }
    if (end !== null) previousEnd = Math.max(previousEnd ?? end, end);
  });
  return segments;
}

export function SessionOverview({ summaries, onSelectTurn }: SessionOverviewProps) {
  const analysis = analyzeSession(summaries);
  const segments = timelineSegments(summaries);
  const totalSegmentMs = segments.reduce((sum, segment) => sum + segment.durationMs, 0);

  return (
    <section className="session-overview" aria-label="Session overview">
      <div className="session-overview__heading">
        <span>SESSION AT A GLANCE</span>
        <span>{summaries.length} turns</span>
      </div>
      <div className="session-overview__metrics">
        <div>
          <strong>{formatDuration(analysis.wallClockMs)}</strong>
          <span>wall clock</span>
        </div>
        <div>
          <strong>{formatDuration(analysis.activeMs)}</strong>
          <span>agent active</span>
        </div>
        <div>
          <strong>{formatDuration(analysis.idleMs)}</strong>
          <span>between turns</span>
        </div>
        <div>
          <strong>{analysis.toolCallCount}</strong>
          <span>tool calls</span>
        </div>
        <div>
          <strong>{formatTokens(analysis.totalTokens)}</strong>
          <span>tokens</span>
        </div>
      </div>
      {totalSegmentMs > 0 && (
        <div className="session-overview__timeline" aria-label="Session time allocation">
          {segments.map((segment) => {
            const width = `${Math.max(0.5, (segment.durationMs / totalSegmentMs) * 100)}%`;
            if (segment.kind === "idle") {
              return (
                <span
                  key={`idle-before-${segment.turnIndex}`}
                  className="session-overview__segment session-overview__segment--idle"
                  style={{ width }}
                  title={`${segment.label}: ${formatDuration(segment.durationMs)}`}
                />
              );
            }
            return (
              <button
                key={`turn-${segment.turnIndex}`}
                className="session-overview__segment session-overview__segment--turn"
                style={{ width }}
                onClick={() => onSelectTurn(segment.turnIndex!)}
                title={`${segment.label}: ${formatDuration(segment.durationMs)}`}
                aria-label={`Open ${segment.label}, ${formatDuration(segment.durationMs)}`}
              >
                <span>{segment.label.replace("Turn ", "T")}</span>
              </button>
            );
          })}
        </div>
      )}
      <div className="session-overview__legend">
        <span>
          <i className="session-overview__key session-overview__key--active" />
          agent active
        </span>
        <span>
          <i className="session-overview__key session-overview__key--idle" />
          waiting for user
        </span>
        <span>{analysis.reasoningCount} reasoning events</span>
      </div>
    </section>
  );
}
