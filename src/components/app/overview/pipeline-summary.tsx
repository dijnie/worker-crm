import { DEAL_STAGES, type DealStage } from "@/lib/db/schema/constants";
import { DEFAULT_TABLE_QUERY, tableQueryUrl } from "../data-table/table-query";
import { stageLabel } from "../records/stage-change";

export interface PipelineBucket { stage: DealStage; count: number; value: string }
export function PipelineSummary({ currency, pipeline, loading }: { currency: string; pipeline?: readonly PipelineBucket[]; loading: boolean }) {
  return <section aria-labelledby="overview-pipeline-heading" className="min-w-0 space-y-4">
    <div>
      <h2 id="overview-pipeline-heading" className="text-lg font-semibold">Deal pipeline <span className="font-normal text-muted-foreground">· {currency}</span></h2>
      <p className="mt-1 text-sm text-muted-foreground">Active deals in {currency}, including closed stages.</p>
    </div>
    <div className="rounded-lg border bg-card p-4 sm:p-6">
      <table aria-label="Deal pipeline" className="w-full table-fixed text-sm">
        <caption className="sr-only">Deal counts and exact values for all seven stages in {currency}. Select a stage to view matching deals.</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="w-[42%] pb-3 font-medium">Stage</th>
            <th scope="col" className="w-[18%] pb-3 text-right font-medium">Deals</th>
            <th scope="col" className="w-[40%] pb-3 pl-3 text-right font-medium">Value ({currency})</th>
          </tr>
        </thead>
        <tbody>{DEAL_STAGES.map(stage => {
          const bucket = pipeline?.find(item => item.stage === stage);
          const unavailable = loading ? "Loading…" : "Unavailable";
          return <tr key={stage} data-stage={stage} className="border-b last:border-0">
            <th scope="row" className="py-2 pr-2 text-left font-normal">
              <a href={tableQueryUrl("/deals", { ...DEFAULT_TABLE_QUERY, stage, currency })} className="inline-flex min-h-11 items-center rounded-sm text-link underline-offset-4 hover:text-link-hover hover:underline active:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card">{stageLabel(stage)}</a>
            </th>
            <td className="py-3 text-right tabular-nums [overflow-wrap:anywhere]">{bucket?.count ?? <span className="text-xs text-muted-foreground">{unavailable}</span>}</td>
            <td className="py-3 pl-3 text-right tabular-nums [overflow-wrap:anywhere]">{bucket?.value ?? <span className="text-xs text-muted-foreground">{unavailable}</span>}</td>
          </tr>;
        })}</tbody>
      </table>
      {pipeline?.every(bucket => bucket.count === 0) && <p className="mt-4 text-sm text-muted-foreground">No active deals in {currency} yet.</p>}
    </div>
  </section>;
}
