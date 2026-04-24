import { TablePageLoading } from "@/components/PageLoading";

export default function Loading() {
  return (
    <TablePageLoading
      title="Loading users"
      description="Refreshing user directory and last-login activity."
    />
  );
}
