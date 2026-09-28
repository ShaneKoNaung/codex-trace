import type { CodexTurn } from "../../shared/types";
import { formatDuration } from "../../shared/format";
import { analyzeTurn, type ActivityCategory } from "../lib/traceAnalysis";

interface TurnInsightsProps {
  turn: CodexTurn;
}

const CATEGORY_CLASS: Record<ActivityCategory, string> = {
  inspect: "inspect",
  edit: "edit",
  verify: "verify",
  package: "package",
  research: "research",
  collaborate: "collaborate",
  other: "other",
};

export function TurnInsights({ turn }: TurnInsightsProps) {
  const analysis = analyzeTurn(turn);
  if (turn.tool_calls.length === 0 && analysis.durationMs === 0) return null;
  const phaseTotal = Math.max(
    1,
    analysis.phases.reduce((sum, phase) => sum + phase.count, 0),
  );

  return (
    <section className="turn-insights" aria-label="Turn analysis">
      <div className="turn-insights__heading">
        <span>TURN ANALYSIS</span>
        <span>{turn.tool_calls.length} sequential tool calls</span>
      </div>
      <div className="turn-insights__metrics">
        <div>
          <strong>{formatDuration(analysis.durationMs)}</strong>
          <span>turn duration</span>
        </div>
        <div>
          <strong>
            {analysis.toolTimingComplete ? formatDuration(analysis.toolDurationMs) : "n/a"}
          </strong>
          <span>recorded tools</span>
        </div>
        <div>
          <strong>
            {analysis.toolTimingComplete ? formatDuration(analysis.orchestrationMs) : "n/a"}
          </strong>
          <span>model + orchestration</span>
        </div>
        <div className={analysis.failedToolCount > 0 ? "turn-insights__metric--error" : ""}>
          <strong>{analysis.failedToolCount}</strong>
          <span>detected failures</span>
        </div>
      </div>

      {analysis.durationMs > 0 && analysis.toolTimingComplete && (
        <div className="turn-insights__allocation">
          <div className="turn-insights__allocation-label">
            <span>Time attribution</span>
            <span>{analysis.toolSharePercent.toFixed(1)}% tools</span>
          </div>
          <div className="turn-insights__allocation-track">
            <span
              className="turn-insights__allocation-tools"
              style={{ width: `${Math.max(0.5, analysis.toolSharePercent)}%` }}
            />
            <span className="turn-insights__allocation-model" />
          </div>
        </div>
      )}

      {analysis.phases.length > 0 && (
        <div className="turn-insights__sequence">
          <div className="turn-insights__sequence-label">Tool sequence</div>
          <div className="turn-insights__sequence-track">
            {analysis.phases.map((phase, index) => (
              <span
                key={analysis.phases
                  .slice(0, index + 1)
                  .map((precedingPhase) => precedingPhase.category)
                  .join("-")}
                className={`turn-insights__phase turn-insights__phase--${CATEGORY_CLASS[phase.category]}`}
                style={{ width: `${(phase.count / phaseTotal) * 100}%` }}
                title={`${phase.label}: ${phase.count} call${phase.count === 1 ? "" : "s"}${
                  phase.timedCount === phase.count
                    ? `, ${formatDuration(phase.durationMs)}`
                    : ", timing unavailable"
                }`}
              />
            ))}
          </div>
          <div className="turn-insights__phase-legend">
            {[...new Map(analysis.phases.map((phase) => [phase.category, phase])).values()].map(
              (phase) => (
                <span key={phase.category}>
                  <i
                    className={`turn-insights__phase-key turn-insights__phase--${CATEGORY_CLASS[phase.category]}`}
                  />
                  {phase.label}
                </span>
              ),
            )}
          </div>
        </div>
      )}

      <div className="turn-insights__columns">
        <div>
          <div className="turn-insights__subheading">Top activities</div>
          <div className="turn-insights__activities">
            {analysis.groups.slice(0, 6).map((group) => (
              <div key={group.label} className="turn-insights__activity">
                <span>{group.label}</span>
                <span>
                  {group.count}× ·{" "}
                  {group.timedCount === group.count
                    ? formatDuration(group.durationMs)
                    : "timing unavailable"}
                  {group.failedCount > 0 ? ` · ${group.failedCount} failed` : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="turn-insights__subheading">What stands out</div>
          {analysis.findings.length > 0 ? (
            <ul className="turn-insights__findings">
              {analysis.findings.map((finding) => (
                <li key={finding}>{finding}</li>
              ))}
            </ul>
          ) : (
            <div className="turn-insights__quiet">No obvious bottleneck detected.</div>
          )}
        </div>
      </div>
    </section>
  );
}
