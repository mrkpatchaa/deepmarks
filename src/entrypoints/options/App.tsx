import React from "react";
import ReactDOM from "react-dom/client";
import "../../assets/tailwind.css";

function OptionsApp() {
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
        Deepmarks Settings
      </h1>
      <p className="mt-2 text-sm text-zinc-500">
        Configure your bookmark classification engine and categories.
      </p>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("Root element not found");

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>,
);
