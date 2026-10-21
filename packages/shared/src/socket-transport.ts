// Narrow adapter over the SDK's public Connection.transport interface. Native
// 0.18 reconnect adds its credential to the URL; carry it in the WebSocket
// subprotocol header instead. Supabase bearer tokens never enter this adapter.
type Events = { onopen?: ((event: Event) => unknown) | null; onmessage?: ((event: MessageEvent) => unknown) | null;
  onclose?: ((event: CloseEvent) => unknown) | null; onerror?: ((event: Event) => unknown) | null };
type Transport = { readonly isOpen: boolean; send(data: Buffer | Uint8Array): void; sendUnreliable(data: Buffer | Uint8Array): void;
  connect(url: string, options?: unknown): void; close(code?: number, reason?: string): void };
type Connection = { transport: Transport; events: Events };
export function protectReconnectUrl(connection: Connection, makeSocket: (url: string, protocol: string) => WebSocket = (url, protocol) => new WebSocket(url, protocol)) {
  const original = connection.transport;
  let socket: WebSocket | undefined;
  let disposed = false;
  connection.transport = {
    get isOpen() { return socket ? socket.readyState === 1 : original.isOpen; },
    send(data) { if (socket) socket.send(data); else original.send(data); },
    sendUnreliable(data) { this.send(data); },
    connect(address) {
      if (disposed) throw new Error("Office connection is closed.");
      const url = new URL(address);
      const proof = url.searchParams.get("reconnectionToken");
      url.searchParams.delete("reconnectionToken"); url.searchParams.delete("_authToken");
      if (!proof || !/^[A-Za-z0-9_-]{1,128}$/.test(proof)) throw new Error("Invalid reconnection proof.");
      socket = makeSocket(url.toString(), `office-resume.${proof}`);
      socket.binaryType = "arraybuffer";
      socket.onopen = (event) => connection.events.onopen?.(event);
      socket.onmessage = (event) => connection.events.onmessage?.(event);
      socket.onerror = (event) => connection.events.onerror?.(event);
      socket.onclose = (event) => connection.events.onclose?.(event);
    },
    close(code, reason) {
      if (code === 4000 || code === 1000) disposed = true;
      if (!socket) { original.close(code, reason); return; }
      if (code === 4010) {
        socket.onclose = null;
        connection.events.onclose?.({ code, reason } as CloseEvent);
      }
      socket.close(code, reason);
    },
  };
  return () => { disposed = true; socket?.close(4000); };
}
