// import useReactWebsocket from "react-use-websocket";
// import { useCallback, useRef, useEffect, createContext, useContext } from "react";
// 
// type PropsWebsocketProvider = {
//   url: string;
//   onMessage?: (data: any) => void;
//   children: React.ReactNode;
// };
// 
// type WebSocketContextType = {
//   sendMessage: (message: string | ArrayBufferLike) => void;
//   lastMessage: MessageEvent<any> | null;
//   isConnected: boolean;
// };
// const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);
// 
// const maxRetries = 9999;
// const retryDelay = 5;
// 
// export function WebSocketProvider({url, onMessage, children }: PropsWebsocketProvider) {
//   const retryCountRef = useRef(0);
//   const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
// 
//   const { sendMessage, lastMessage, readyState } = useReactWebsocket(url, {
//     onOpen: () => {
//       retryCountRef.current = 0;
//     },
//     onError: (event) => {
//       console.error(event);
//       handleRetry();
//     },
//     onClose: () => {
//       if (retryCountRef.current < maxRetries) {
//         handleRetry();
//       }
//     },
//     shouldReconnect: () => retryCountRef.current < maxRetries,
//     reconnectInterval: retryDelay * Math.pow(2, retryCountRef.current),
//   });
// 
//   const handleRetry = useCallback(() => {
//     if (retryCountRef.current < maxRetries) {
//       retryCountRef.current += 1;
//     }
//   }, [maxRetries]);
// 
//   useEffect(() => {
//     if (lastMessage) {
//       try {
//         const data = JSON.parse(lastMessage.data);
//         onMessage?.(data);
//       } catch (e) {
//         console.error("Failed to parse WebSocket message:", e);
//       }
//     }
//   }, [lastMessage, onMessage]);
// 
//   useEffect(() => {
//     return () => {
//       if (retryTimeoutRef.current) {
//         clearTimeout(retryTimeoutRef.current);
//       }
//     };
//   }, []);
// 
//   const v: WebSocketContextType = {
//     sendMessage,
//     lastMessage,
//     isConnected: readyState === WebSocket.OPEN,
//   };
// 
//   return <WebSocketContext.Provider value={v}>{children}</WebSocketContext.Provider>;
// }
// 
// export function useWebsocket() {
//   const context = useContext(WebSocketContext);
//   if (!context) {
//     throw new Error("useWebSocket must be used within WebSocketProvider");
//   }
//   return context;
// }
