// /**
//  * useDevices Hook
//  *
//  * Provides access to pre-initialized device data.
//  * All devices are guaranteed to be loaded and ready.
//  * This hook does not perform any async initialization - that happens before React renders.
//  */
// import { useContext, createContext, useEffect, useRef, useState } from "react";
// import { useWebsocket } from "../websocket";
// import { RPCClient } from "../client";
// 
// // Create context for sharing devices across the app
// const DevicesContext = createContext<{
//   rpc: RPCClient;
// } | null>(null);
// 
// export function useRpc() {
//   const context = useContext(DevicesContext);
//   if (!context) {
//     throw new Error("useDevices must be used within DevicesProvider");
//   }
//   return context.rpc;
// }
// 
// export function DevicesProvider({ children }: { children: React.ReactNode }) {
//   const { client, initialized } = useDeviceRPC();
// 
//   // Don't render children until initialization is complete
//   if (!initialized) {
//     return null;
//   }
// 
//   return <DevicesContext.Provider value={{ rpc: client }}>{children}</DevicesContext.Provider>;
// }
// 
// /**
//  * React Hook for RPC Client
//  *
//  * Thin wrapper around the vanilla JS RPCClient that wires it to the WebSocket.
//  *
//  * Hook for making RPC calls to device APIs
//  *
//  * Usage:
//  * ```tsx
//  * const rpc = useDeviceRPC();
//  * const result = await rpc.call("rewq", "setPower", [true]);
//  * const device = rpc.device("rewq");
//  * await device.methodName(arg);
//  * ```
//  */
// function useDeviceRPC() {
//   const { sendMessage, lastMessage, isConnected } = useWebsocket();
//   const clientRef = useRef<RPCClient | null>(null);
//   const [, forceUpdate] = useState(false);
//   const [initialized, setInitialized] = useState(false);
// 
//   // Initialize client on first render with update callback
//   if (!clientRef.current) {
//     clientRef.current = new RPCClient({
//       sendMessage,
//       onUpdate: () => forceUpdate((n) => !n),
//     });
//   }
// 
//   // Initialize every time WebSocket is connected
//   useEffect(() => {
//     if (clientRef.current && isConnected) {
//       clientRef.current
//         .init()
//         .then(() => {
//           setInitialized(true);
//         })
//         .catch((err) => {
//           console.error("Failed to initialize RPC client:", err);
//         });
//     }
//   }, [isConnected]);
// 
//   // Handle incoming messages
//   useEffect(() => {
//     if (!clientRef.current) return;
// 
//     if (lastMessage && isConnected) {
//       try {
//         const data = JSON.parse(lastMessage.data);
//         clientRef.current.onMessage(data);
//       } catch (e) {
//         console.error("Failed to parse RPC message:", e);
//       }
//     }
//   }, [lastMessage, isConnected]);
// 
//   // Cleanup on unmount
//   useEffect(() => {
//     return () => {
//       clientRef.current?.cleanup();
//     };
//   }, []);
// 
//   return { client: clientRef.current!, initialized };
// }
