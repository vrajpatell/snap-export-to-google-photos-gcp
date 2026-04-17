import { Toaster as HotToaster } from "react-hot-toast";

export function Toaster() {
  return (
    <HotToaster
      position="top-right"
      gutter={10}
      toastOptions={{
        duration: 4000,
        className:
          "!rounded-xl !border !border-border !bg-surface-raised !text-ink !shadow-card !px-4 !py-3 !text-sm",
        success: {
          iconTheme: {
            primary: "rgb(var(--success))",
            secondary: "rgb(var(--surface-raised))",
          },
        },
        error: {
          iconTheme: {
            primary: "rgb(var(--danger))",
            secondary: "rgb(var(--surface-raised))",
          },
        },
      }}
    />
  );
}
