export default function App() {
  return (
    <div className="flex h-screen flex-col bg-white dark:bg-zinc-900">
      <header className="border-b border-zinc-200 px-4 py-3 dark:border-zinc-700">
        <h1 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          Deepmarks
        </h1>
      </header>
      <main className="flex-1 overflow-hidden p-4">
        <p className="text-sm text-zinc-500">Loading bookmarks…</p>
      </main>
    </div>
  );
}
