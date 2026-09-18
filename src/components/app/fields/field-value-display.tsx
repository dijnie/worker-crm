import { Link } from "@/components/ui/link";
import { fieldValueText, safeFieldHref, type FieldDefinition } from "@/lib/field-form-values";
export function FieldValueDisplay({ definition, value, userLabel }: {
  definition: Pick<FieldDefinition, "type" | "options">; value: unknown; userLabel?: string;
}) {
  const text = fieldValueText(definition, value, userLabel);
  const href = typeof value === "string" ? safeFieldHref(definition.type, value) : undefined;
  return <span className="whitespace-pre-wrap break-words">{href ? <Link variant="inline" href={href} target={definition.type === "URL" ? "_blank" : undefined} rel="noopener noreferrer" onClick={event => event.stopPropagation()}>{text}</Link> : text}</span>;
}
