import { PermissionGate } from "@/components/app/permission-gate";
import { RecordList } from "@/components/app/data-table/record-list";

export default function CompaniesPage() {
  return <PermissionGate entity="company"><RecordList entity="company" /></PermissionGate>;
}
