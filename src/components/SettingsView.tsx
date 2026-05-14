/**
 * SettingsView — settings tab content for the sidepanel.
 *
 * Renders engine status, BYOK key management, and category editor in a
 * scrollable pane. Replaces the standalone options page for day-to-day use.
 */
import { ClassifyEngineStatus } from "./Settings/ClassifyEngineStatus";
import { BYOKInput } from "./Settings/BYOKInput";
import { CategoryEditor } from "./Settings/CategoryEditor";

export function SettingsView() {
    return (
        <div className="flex-1 overflow-y-auto px-4 py-6 space-y-8">
            <ClassifyEngineStatus />
            <hr className="border-zinc-200 dark:border-zinc-700" />
            <BYOKInput />
            <hr className="border-zinc-200 dark:border-zinc-700" />
            <CategoryEditor />
        </div>
    );
}
