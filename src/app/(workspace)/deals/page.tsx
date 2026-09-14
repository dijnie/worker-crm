import { PermissionGate } from "@/components/app/permission-gate";
import { RecordList } from "@/components/app/data-table/record-list";

export default function DealsPage() {
  return <PermissionGate entity="deal"><RecordList entity="deal" /></PermissionGate>;
}
