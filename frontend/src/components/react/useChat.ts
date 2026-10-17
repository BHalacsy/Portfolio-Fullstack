import { useCallback, useEffect, useRef, useState } from "react";
import type { Centrifuge, PublicationContext, Subscription } from "centrifuge";
import { fetchChatUsers } from "../../scripts/api";

const CHANNEL = "chat";

const USERS_POLL_MS = 15_000;

const SESSION_TOKEN_KEY = "toybox_session_token";
const USERNAME_KEY = "toybox_chat_username";
const JOINED_KEY = "toybox_chat_joined";

function getSessionToken(): string {
    if (typeof window === "undefined") return "";
    let token = localStorage.getItem(SESSION_TOKEN_KEY);
    if (!token) {
        token =
            typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
                ? crypto.randomUUID()
                : "tok_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
        localStorage.setItem(SESSION_TOKEN_KEY, token);
    }
    return token;
}

function getCachedUsername(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(USERNAME_KEY);
}

const ROOM_FULL = 1001;
const PERMISSION_DENIED = 103;
const BAD_REQUEST = 107;
const INTERNAL = 100;

function describe(code: number, message: string): string {
    switch (code) {
        case ROOM_FULL:
            return "The chatroom is full — every name is taken. Try again later.";
        case PERMISSION_DENIED:
            return "You need a name before you can say anything.";
        case BAD_REQUEST:
            return "That message was rejected.";
        case INTERNAL:
            return "The chatroom is unavailable right now.";
        default:
            return message || "The chatroom ran into a problem.";
    }
}

export interface ChatMessage {
    id: number;
    username: string;
    message: string;
    timestamp: string;
}

export interface Chat {
    username: string | null;
    users: number;
    messages: ChatMessage[];
    error: string | null;
    refused: boolean;
    send: (message: string) => Promise<void>;
}

export function useChat(client: Centrifuge | null, session: number): Chat {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [username, setUsername] = useState<string | null>(getCachedUsername);
    const [users, setUsers] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [refused, setRefused] = useState(false);
    const subRef = useRef<Subscription | null>(null);
    const nextId = useRef(0);

    const usernameRef = useRef<string | null>(username);
    usernameRef.current = username;

    const refreshUsers = useCallback(() => {
        fetchChatUsers()
            .then(setUsers)
            .catch((e) => console.warn("Chatter count fetch failed: ", e));
    }, []);

    useEffect(() => {
        if (!client) return;
        refreshUsers();
        const timer = setInterval(refreshUsers, USERS_POLL_MS);
        return () => clearInterval(timer);
    }, [client, refreshUsers]);

    useEffect(() => {
        if (!client || session === 0) return;

        setRefused(false);
        setError(null);

        const token = getSessionToken();
        const cached = getCachedUsername();
        const sub = client.newSubscription(CHANNEL, {
            data: { token, username: cached },
        });
        subRef.current = sub;

        const append = (ctx: PublicationContext) => {
            const id = nextId.current++;
            setMessages((prev) => [...prev, { id, ...(ctx.data as Omit<ChatMessage, "id">) }]);
        };

        sub.on("subscribed", (ctx) => {
            const assigned = ctx.data?.username ?? cached ?? null;
            setUsername(assigned);
            if (assigned && typeof window !== "undefined") {
                localStorage.setItem(USERNAME_KEY, assigned);
                localStorage.setItem(JOINED_KEY, "true");
            }
            setError(null);
            refreshUsers();
        });

        sub.on("subscribing", () => {
            // Keep cached username displayed during reconnection
        });

        sub.on("unsubscribed", (ctx) => {
            if (ctx.code === 0) return;
            setUsername(null);
            if (typeof window !== "undefined") {
                localStorage.removeItem(JOINED_KEY);
                localStorage.removeItem(USERNAME_KEY);
            }
            setError(describe(ctx.code, ctx.reason));
            setRefused(true);
        });

        sub.on("publication", append);

        sub.on("error", (ctx) => {
            console.warn("Chat subscription error: ", ctx.error);
            setError(describe(ctx.error.code, ctx.error.message));
        });

        sub.subscribe();

        return () => {
            sub.unsubscribe();
            client.removeSubscription(sub);
            subRef.current = null;
        };
    }, [client, session, refreshUsers]);

    const send = useCallback(async (message: string) => {
        const sub = subRef.current;
        if (!sub || !usernameRef.current) {
            console.warn("Chat subscription not ready");
            return;
        }

        try {
            await sub.publish({ message });
            setError(null);
        } catch (e) {
            console.error("Message sending failed: ", e);
            const { code, message: reason } = e as { code?: number; message?: string };
            setError(describe(code ?? -1, reason ?? ""));
        }
    }, []);

    return { username, users, messages, error, refused, send };
}
