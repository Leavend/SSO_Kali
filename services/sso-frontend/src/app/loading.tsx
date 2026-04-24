import LoadingScreen from "@/components/LoadingScreen";

export default function Loading() {
  return (
    <LoadingScreen
      title="Preparing Secure Admin Sign-In"
      description="Checking the current admin session and loading the protected entry flow."
    />
  );
}
