import { Badge } from "@/components/ui/badge";
import {
  Card, CardAction, CardDescription, CardHeader, CardPanel, CardTitle,
} from "@/components/ui/card";
import { CardTableEmpty } from "@/components/ui/card-table";
import { EmptyCellValue } from "@/components/ui/empty-cell";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "@/components/ui/link";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { DEAL_STAGES, type DealStage } from "@/lib/db/schema/constants";
import { DEFAULT_TABLE_QUERY, tableQueryUrl } from "../data-table/table-query";
import { stageLabel } from "../records/stage-change";

export interface PipelineBucket { stage: DealStage; count: number; value: string }

const CELL = "px-3 py-2.5 whitespace-normal";

export function PipelineSummary({ currency, pipeline, loading }: { currency: string; pipeline?: readonly PipelineBucket[]; loading: boolean }) {
  return <Card className="min-w-0">
    <CardHeader>
      <CardTitle><h2>Deal pipeline</h2></CardTitle>
      <CardDescription>Active deals in {currency}, including closed stages</CardDescription>
      <CardAction><Badge variant="outline">{currency}</Badge></CardAction>
    </CardHeader>
    <CardPanel className="h-auto">
      <Table
        aria-label="Deal pipeline"
        className="table-fixed"
        containerClassName="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"
      >
        <caption className="sr-only">Deal counts and exact values for all seven stages in {currency}. Select a stage to view matching deals.</caption>
        <TableHeader className="sticky top-0 z-10 bg-background">
          <TableRow className="hover:bg-transparent">
            <TableHead className="w-[42%] px-3 font-normal">Stage</TableHead>
            <TableHead className="w-[18%] px-3 text-right font-normal">Deals</TableHead>
            <TableHead className="w-[40%] px-3 text-right font-normal">Value ({currency})</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>{DEAL_STAGES.map(stage => {
          const bucket = pipeline?.find(item => item.stage === stage);
          return <TableRow key={stage} data-stage={stage} className="hover:bg-transparent">
            <TableHead scope="row" className={`${CELL} font-normal text-foreground`}>
              <Link variant="quiet" className="font-medium" href={tableQueryUrl("/deals", { ...DEFAULT_TABLE_QUERY, stage, currency })}>{stageLabel(stage)}</Link>
            </TableHead>
            <TableCell className={`${CELL} text-right tabular-nums`}>{bucket ? bucket.count : loading ? <Skeleton className="ml-auto h-4 w-10" /> : <EmptyCellValue />}</TableCell>
            <TableCell className={`${CELL} text-right tabular-nums [overflow-wrap:anywhere]`}>{bucket ? bucket.value : loading ? <Skeleton className="ml-auto h-4 w-16" /> : <EmptyCellValue />}</TableCell>
          </TableRow>;
        })}</TableBody>
      </Table>
      {pipeline?.every(bucket => bucket.count === 0) && <CardTableEmpty>No active deals in {currency} yet.</CardTableEmpty>}
    </CardPanel>
  </Card>;
}
