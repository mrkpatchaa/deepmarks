import React from "react";
import ReactDOM from "react-dom/client";
import "../../assets/tailwind.css";

function PopupApp() {
  return (
    <div className="min-w-[280px] bg-white p-4 dark:bg-zinc-900">
      <h1 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
        Deepmarks
      </h1>
      <p className="mt-1 text-sm text-zinc-500">Loading…</p>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>,
);
