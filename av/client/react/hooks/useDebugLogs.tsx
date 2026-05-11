// import { useState, useEffect, useRef, useCallback, createContext, useContext } from "react";
// import type { LogEntry } from "@server/pms/tools/telemetry/exporters";
// 
// export function DebuggerProvider({ url, children }: { url: string; children: React.ReactNode }) {
//   const asdf = useDebugWs({ url });
// 
//   return <DebuggerContext.Provider value={asdf}>{children}</DebuggerContext.Provider>;
// }
// 
// export function useDebugger() {
//   const context = useContext(DebuggerContext);
//   if (!context) {
//     throw new Error("useDebugger must be used within a DebuggerProvider");
//   }
//   return context;
// }
// 
// const DebuggerContext = createContext<ReturnType<typeof useDebugWs> | null>(null);
// 
// const MAX_ENTRIES = 500;
// 
// function useDebugWs({ url }: { url: string }) {
//   const [logs, setLogs] = useState<LogEntry[]>([]);
//   const [isConnected, setIsConnected] = useState(false);
//   const wsRef = useRef<WebSocket | null>(null);
//   const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// 
//   const connect = useCallback(() => {
//     const state = wsRef.current?.readyState;
//     console.log({ name: "DEBUG_WS_ALREADY_CONNECTED" });
//     if (state === WebSocket.OPEN || state === WebSocket.CONNECTING) return;
// 
//     console.log({ name: "DEBUG_WS_NEW_OBJ" });
//     const ws = new WebSocket(url);
// 
//     ws.onopen = () => {
//       setIsConnected(true);
//     };
// 
//     ws.onclose = () => {
//       console.error({ name: "DEBUG_WS_ONCLOSE" });
//       setIsConnected(false);
//       // Reconnect after 2 seconds
//       reconnectTimeoutRef.current = setTimeout(() => {
//         console.error({ name: "DEBUG_WS_RECONNECT" });
//         connect();
//       }, 2000);
//     };
// 
//     ws.onerror = () => {
//       ws.close();
//     };
// 
//     ws.onmessage = (event) => {
//       let data: LogEntry;
//       try {
//         data = JSON.parse(event.data);
//       } catch (error) {
//         data = {
//           name: "UNABLE_TO_JSON_PARSE_LOG",
//           context: { traceName: "CLIENT_INTERNAL", traceId: undefined, spanId: undefined },
//           data: JSON.stringify(event.data),
//           time: new Date().toISOString().slice(11, 23),
//           severity: { id: 50, text: "ERROR" },
//         };
//         console.error(error);
//       }
//       setLogs((prev) => {
//         const next = [data, ...prev];
//         return next.slice(0, MAX_ENTRIES);
//       });
//     };
// 
//     wsRef.current = ws;
//   }, [MAX_ENTRIES]);
// 
//   useEffect(() => {
//     console.log({ name: "DEBUG_WS_USEEFFECT_FIRST_RENDER" });
//     connect();
// 
//     return () => {
//       if (reconnectTimeoutRef.current) {
//         clearTimeout(reconnectTimeoutRef.current);
//       }
//       // Only close if fully connected, otherwise let it finish or fail naturally
//       if (wsRef.current?.readyState === WebSocket.OPEN) {
//         wsRef.current.close();
//       }
//     };
//   }, [connect]);
// 
//   const clearLogs = useCallback(() => {
//     setLogs([]);
//   }, []);
// 
//   return { logs, isConnected, clearLogs };
// }
