import { PermissionGate } from "@/components/app/permission-gate";
import { RecordList } from "@/components/app/data-table/record-list";

export default function ContactsPage() {
  return <PermissionGate entity="contact"><RecordList entity="contact" /></PermissionGate>;
}
