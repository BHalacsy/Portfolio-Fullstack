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
    // Centrifuge disabled for now
    return {
        client: null,
        clientId: "",
        state: "disconnected",
        error: null,
    };
}
