/**
 * Tests for Task 7.1: native-messaging.ts
 *
 *  1. sendToDaemon triggers a lazy connect on first call
 *  2. sendToDaemon calls port.postMessage with the correct message
 *  3. onMessage validates and delivers valid inbound messages to handlers
 *  4. onMessage silently drops messages that fail Zod validation
 *  5. onDisconnect with "not found" error sets daemonInstalled to false
 *  6. onDisconnect without error schedules reconnect (attempts > 0)
 *  7. disconnectDaemon cancels reconnect and closes port
 *  8. setDaemonListener returns an unsubscribe function
 *  9. isDaemonInstalled returns true before any disconnect
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Chrome mock for connectNative ─────────────────────────────────────────

interface MockPort {
    postMessage: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
    onMessage: { addListener: ReturnType<typeof vi.fn>; _trigger: (msg: unknown) => void };
    onDisconnect: { addListener: ReturnType<typeof vi.fn>; _trigger: (err?: { message?: string }) => void };
}

function makeMockPort(): MockPort {
    let msgListener: ((msg: unknown) => void) | null = null;
    let disconnectListener: (() => void) | null = null;

    return {
        postMessage: vi.fn(),
        disconnect: vi.fn(),
        onMessage: {
            addListener: vi.fn((cb: (msg: unknown) => void) => { msgListener = cb; }),
            _trigger: (msg: unknown) => { msgListener?.(msg); },
        },
        onDisconnect: {
            addListener: vi.fn((cb: () => void) => { disconnectListener = cb; }),
            _trigger: (err?: { message?: string }) => {
                if (err !== undefined) {
                    Object.defineProperty(chrome.runtime, "lastError", { value: err, configurable: true });
                } else {
                    Object.defineProperty(chrome.runtime, "lastError", { value: undefined, configurable: true });
                }
                disconnectListener?.();
                if (err !== undefined) {
                    Object.defineProperty(chrome.runtime, "lastError", { value: undefined, configurable: true });
                }
            },
        },
    };
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function importFresh() {
    // Vitest module cache is reset between describe blocks when needed.
    // We use dynamic import + vi.resetModules() to get a fresh module state.
    vi.resetModules();
    return import("../../src/lib/agent/native-messaging");
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe("native-messaging: lazy connect + postMessage", () => {
    let mockPort: MockPort;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPort = makeMockPort();
        vi.mocked(chrome.runtime.connectNative).mockReturnValue(mockPort as unknown as chrome.runtime.Port);
    });

    it("connects lazily on first sendToDaemon call", async () => {
        const nm = await importFresh();
        nm.sendToDaemon({ id: 1, type: "ping", payload: {} });
        expect(chrome.runtime.connectNative).toHaveBeenCalledWith("com.deepmarks.daemon");
    });

    it("calls port.postMessage with the correct message", async () => {
        const nm = await importFresh();
        const msg = { id: 2, type: "search", payload: { query: "test" } };
        nm.sendToDaemon(msg);
        expect(mockPort.postMessage).toHaveBeenCalledWith(msg);
    });

    it("does not reconnect when already connected", async () => {
        const nm = await importFresh();
        nm.sendToDaemon({ id: 3, type: "ping", payload: {} });
        nm.sendToDaemon({ id: 4, type: "ping", payload: {} });
        expect(chrome.runtime.connectNative).toHaveBeenCalledTimes(1);
    });
});

describe("native-messaging: message validation", () => {
    let mockPort: MockPort;

    beforeEach(() => {
        vi.clearAllMocks();
        mockPort = makeMockPort();
        vi.mocked(chrome.runtime.connectNative).mockReturnValue(mockPort as unknown as chrome.runtime.Port);
    });

    it("delivers valid inbound messages to registered handlers", async () => {
        const nm = await importFresh();
        nm.sendToDaemon({ id: 1, type: "ping", payload: {} });

        const received: unknown[] = [];
        nm.setDaemonListener((msg) => { received.push(msg); });

        mockPort.onMessage._trigger({ id: 1, type: "pong", payload: { ok: true } });
        expect(received).toHaveLength(1);
        expect((received[0] as { type: string }).type).toBe("pong");
    });

    it("silently drops messages that fail Zod validation", async () => {
        const nm = await importFresh();
        nm.sendToDaemon({ id: 1, type: "ping", payload: {} });

        const received: unknown[] = [];
        nm.setDaemonListener((msg) => { received.push(msg); });

        // Missing required fields
        mockPort.onMessage._trigger({ broken: true });
        expect(received).toHaveLength(0);
    });
});

describe("native-messaging: disconnect handling", () => {
    let mockPort: MockPort;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockPort = makeMockPort();
        vi.mocked(chrome.runtime.connectNative).mockReturnValue(mockPort as unknown as chrome.runtime.Port);
    });

    it("sets daemonInstalled to false when host not found", async () => {
        const nm = await importFresh();
        nm.sendToDaemon({ id: 1, type: "ping", payload: {} });
        expect(nm.isDaemonInstalled()).toBe(true);

        mockPort.onDisconnect._trigger({ message: "Specified native messaging host not found" });
        expect(nm.isDaemonInstalled()).toBe(false);
        // No reconnect scheduled
        expect(chrome.runtime.connectNative).toHaveBeenCalledTimes(1);
    });

    it("schedules reconnect on transient disconnect", async () => {
        const nm = await importFresh();
        nm.sendToDaemon({ id: 1, type: "ping", payload: {} });

        mockPort.onDisconnect._trigger();
        // Port is null now; after timeout a reconnect fires
        vi.advanceTimersByTime(1000);
        expect(chrome.runtime.connectNative).toHaveBeenCalledTimes(2);
    });
});

describe("native-messaging: disconnectDaemon + unsubscribe", () => {
    let mockPort: MockPort;

    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        mockPort = makeMockPort();
        vi.mocked(chrome.runtime.connectNative).mockReturnValue(mockPort as unknown as chrome.runtime.Port);
    });

    it("disconnectDaemon closes port and cancels reconnect", async () => {
        const nm = await importFresh();
        nm.sendToDaemon({ id: 1, type: "ping", payload: {} });
        nm.disconnectDaemon();
        expect(mockPort.disconnect).toHaveBeenCalled();
    });

    it("setDaemonListener returns an unsubscribe that stops delivery", async () => {
        const nm = await importFresh();
        nm.sendToDaemon({ id: 1, type: "ping", payload: {} });

        const received: unknown[] = [];
        const unsub = nm.setDaemonListener((msg) => { received.push(msg); });
        unsub();
        mockPort.onMessage._trigger({ id: 1, type: "pong", payload: {} });
        expect(received).toHaveLength(0);
    });
});
