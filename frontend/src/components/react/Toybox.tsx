import { useEffect, useRef, useState } from "react";
import Canvas from "./Canvas";
import { useCentrifuge } from "./useCentrifuge";
import { useChat } from "./useChat";

const MAX_USERS = 16;
const TILE = "bg-tile-gradient rounded-2xl hover:scale-102 duration-700";
const FOLLOW_TOLERANCE = 48;

export default function Toybox() {
    const { client, clientId, state, error } = useCentrifuge();
    const [session, setSession] = useState(() =>
        typeof window !== "undefined" && localStorage.getItem("toybox_chat_joined") === "true" ? 1 : 0,
    );
    const { username, users, messages, error: chatError, refused, send } = useChat(client, session);

    const [draft, setDraft] = useState("");
    const feedRef = useRef<HTMLDivElement>(null);
    const followRef = useRef(true);

    const inRoom = session > 0 && !refused;
    const full = !inRoom && users >= MAX_USERS;

    useEffect(() => {
        const feed = feedRef.current;
        if (feed && followRef.current) feed.scrollTop = feed.scrollHeight;
    }, [messages]);

    const submit = async () => {
        const message = draft.trim();
        if (!message || !username || state !== "connected") return;
        setDraft("");
        await send(message);
    };

    const status = () => {
        if (error) return error;
        if (chatError) return chatError;
        if (state === "connecting") {
            return (
                <>
                    connecting to server
                    <img
                        src="/media/loadingBlack.svg"
                        alt="loading circle"
                        className="animate-spin w-6 h-6 mx-auto mt-1 dark:hidden"
                    />
                    <img
                        src="/media/loadingWhite.svg"
                        alt="loading circle"
                        className="animate-spin w-6 h-6 mx-auto mt-1 hidden dark:block"
                    />
                </>
            );
        }
        if (state === "disconnected") return "disconnected";
        if (!inRoom) return "join the chatroom to be given a name";
        if (username) return <>you are connected as: {username}</>;

        return (
            <>
                claiming a name
                <img
                    src="/media/loadingBlack.svg"
                    alt="loading circle"
                    className="animate-spin w-6 h-6 mx-auto mt-1 dark:hidden"
                />
                <img
                    src="/media/loadingWhite.svg"
                    alt="loading circle"
                    className="animate-spin w-6 h-6 mx-auto mt-1 hidden dark:block"
                />
            </>
        );
    };

    return (
        <div
            id="toybox"
            className="relative grid grid-cols-2 grid-rows-5 gap-4 w-3/5 h-[85vh] mx-auto my-25 text-[var(--txt-color)] max-[1050px]:flex max-[1050px]:flex-col"
        >
            <div className={`${TILE} row-span-4 h-full p-4 move-r max-[1050px]:order-2 max-[1050px]:h-full`}>
                <div
                    ref={feedRef}
                    onScroll={(e) => {
                        const feed = e.currentTarget;
                        followRef.current =
                            feed.scrollHeight - feed.clientHeight - feed.scrollTop <= FOLLOW_TOLERANCE;
                    }}
                    className="relative flex flex-col h-[95%] bg-white/40 dark:bg-white/10 backdrop-blur-md border border-white/40 dark:border-white/15 rounded-xl p-3 tile-scroll shadow-inner"
                >
                    <div className="flex sticky top-0 z-10 self-start bg-white/60 dark:bg-white/15 backdrop-blur-md border border-white/50 dark:border-white/20 text-[var(--txt-color)] w-8 h-8 p-4 items-center justify-center rounded-full shadow-sm">
                        <span className="text-xs font-light px-1">
                            {users}/{MAX_USERS}
                        </span>
                    </div>
                    <div className="bg-white/50 dark:bg-white/10 backdrop-blur-sm border border-white/40 dark:border-white/15 text-[var(--txt-color)] text-xs p-2.5 mt-2 rounded-xl self-end shadow-sm">
                        Welcome to the chatroom! Feel free to draw and converse.
                    </div>
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            style={{ background: `color-mix(in srgb, var(--${msg.username}-color) 55%, transparent)` }}
                            className="text-sm px-3 py-2 mt-2 rounded-xl self-end backdrop-blur-sm border border-white/30 dark:border-white/15 shadow-sm motion-translate-x-in-[-25%] motion-blur-in-[4px] motion-duration-500"
                        >
                            [{msg.timestamp}] {msg.username}: {msg.message}
                        </div>
                    ))}
                </div>
            </div>

            <div
                className={`${TILE} col-start-1 row-start-5 flex flex-col items-center justify-center p-4 overflow-y-hidden move-u max-[1050px]:order-3`}
            >
                {inRoom ? (
                    <>
                        <input
                            type="text"
                            aria-label="Chat message"
                            placeholder={username ? "Send message here..." : "Waiting for a name..."}
                            value={draft}
                            disabled={!username || state !== "connected"}
                            onChange={(e) => setDraft(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") void submit();
                            }}
                            className="bg-white/40 dark:bg-white/10 backdrop-blur-sm border border-white/40 dark:border-white/15 px-3 py-1.5 rounded-xl w-[75%] disabled:opacity-50 text-[var(--txt-color)] placeholder:text-[var(--txt-color)]/50 focus:outline-none focus:ring-2 focus:ring-[var(--accent-color)]"
                        />
                        <div className="flex items-center gap-4 mt-4">
                            <button
                                type="button"
                                onClick={() => void submit()}
                                disabled={!username || state !== "connected"}
                                className="glass-button text-[var(--txt-color)] px-4 py-1.5 disabled:opacity-50"
                            >
                                Send
                            </button>
                        </div>
                    </>
                ) : (
                    <>
                        <button
                            type="button"
                            onClick={() => {
                                if (typeof window !== "undefined") {
                                    localStorage.setItem("toybox_chat_joined", "true");
                                }
                                setSession((n) => n + 1);
                            }}
                            disabled={!client || state !== "connected" || (full && !refused)}
                            className="glass-button text-[var(--txt-color)] px-4 py-1.5 disabled:opacity-50"
                        >
                            {refused ? "Try again" : "Join the chatroom"}
                        </button>
                        <span className="text-xs mt-4 text-center">
                            {full
                                ? "All sixteen names are taken right now."
                                : "A name is held only while you are in the room."}
                        </span>
                    </>
                )}
            </div>

            <div
                className={`${TILE} col-start-2 row-start-2 row-span-4 h-full flex flex-col items-center p-4 move-l max-[1050px]:hidden`}
            >
                <Canvas client={client} clientId={clientId} />
            </div>

            <div
                className={`${TILE} col-start-2 row-start-1 flex flex-col items-center justify-center tile-scroll move-d max-[1050px]:order-1`}
            >
                <span className="text-4xl font-medium mt-4">Toybox</span>
                <span className="text-sm mt-2 px-4 text-center">{status()}</span>
            </div>
        </div>
    );
}
