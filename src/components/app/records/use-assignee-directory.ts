"use client";
import { useAppData, useAppQuery } from "../app-data-provider";

/** One session-scoped safe directory for historical attribution and owner display. */
export function useAssigneeDirectory() {
  const { api } = useAppData();
  return useAppQuery("assignees", { directory: true }, async signal => {
    const first = await api.assignees.list({ page: 1, limit: 100 }, { signal });
    const items = [...first.items];
    for (let page = 2; (page - 1) * first.limit < first.total; page++) {
      const next = await api.assignees.list({ page, limit: 100 }, { signal });
      items.push(...next.items);
    }
    return items;
  });
}
