import { useToastStore } from "@/stores/toasts";

const colorMap: Record<string, string> = {
  success: "bg-green-500",
  error: "bg-red-500",
  info: "bg-blue-500",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);

  return (
    <div
      className="pointer-events-none fixed bottom-4 right-4 z-50 flex flex-col gap-2"
      data-testid="toast-container"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast"
          className={`pointer-events-auto rounded-lg px-4 py-2 text-sm font-medium text-white shadow-lg ${colorMap[toast.type] ?? "bg-blue-500"}`}
        >
          {toast.message}
        </div>
      ))}
    </div>
  );
}
