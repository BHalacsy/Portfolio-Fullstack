import { useEffect, useState } from "react";
import type { Centrifuge } from "centrifuge";
import { WS_URL } from "../../scripts/api";

export type ConnectionState = "connecting" | "connected" | "disconnected";

export interface Connection {
    client: Centrifuge | null;
    clientId: string;
    state: ConnectionState;
    error: string | null;
}

export function useCentrifuge(): Connection {
    const [client, setClient] = useState<Centrifuge | null>(null);
    const [clientId, setClientId] = useState("");
    const [state, setState] = useState<ConnectionState>("connecting");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        let instance: Centrifuge | null = null;

        import("centrifuge")
            .then(({ Centrifuge }) => {
                if (cancelled) return;

                instance = new Centrifuge(WS_URL);

                instance.on("connected", (ctx) => {
                    if (cancelled) return;
                    setClientId(ctx.client);
                    setState("connected");
                    setError(null);
                });

                instance.on("connecting", () => {
                    if (cancelled) return;
                    setClientId("");
                    setState("connecting");
                });

                instance.on("disconnected", (ctx) => {
                    if (cancelled) return;
                    setClientId("");
                    setState("disconnected");
                    if (ctx.reason) {
                        setError(ctx.reason);
                    }
                });

                instance.on("error", (ctx) => {
                    console.warn("Centrifuge error: ", ctx.error);
                    if (cancelled) return;
                    const message = ctx.error?.message;
                    setError(
                        message === "transport closed" || message === "connection closed"
                            ? "Toybox is offline right now."
                            : message || "Toybox is offline right now."
                    );
                });

                instance.connect();
                setClient(instance);
            })
            .catch((e) => {
                console.error("Centrifuge failed to load: ", e);
                if (!cancelled) {
                    setState("disconnected");
                    setError("Toybox is offline right now.");
                }
            });

        return () => {
            cancelled = true;
            instance?.disconnect();
        };
    }, []);

    return { client, clientId, state, error };
}
