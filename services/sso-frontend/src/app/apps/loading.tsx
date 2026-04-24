import { CardsPageLoading } from "@/components/PageLoading";

export default function Loading() {
  return (
    <CardsPageLoading
      title="Loading registered apps"
      description="Refreshing OIDC clients and back-channel configuration."
    />
  );
}
