/**
 * Deepmarks Companion Daemon — entry point
 *
 * Native Messaging host + MCP HTTP server on 127.0.0.1:6789
 */

import { startNativeMessagingReader } from "./native-host.ts";
import { createServer } from "./http-server.ts";

const port = Number(process.env["DEEPMARKS_PORT"] ?? "6789");

// Start the MCP HTTP server.
createServer(port);

// Start reading Native Messaging frames from stdin.
startNativeMessagingReader();
