import { useEffect, useState } from "react";
import { fetchViewCount } from "../../scripts/api";

export default function ViewCounter() {
    const [count, setCount] = useState<number | null>(null);

    useEffect(() => {
        let cancelled = false;

        fetchViewCount()
            .then((value) => {
                if (!cancelled) setCount(value);
            })
            .catch((e) => console.warn("View counter fetch failed: ", e));

        return () => {
            cancelled = true;
        };
    }, []);

    return (
        <span className="text-3xl max-[1050px]:text-2xl text-[var(--txt-color)] font-semibold">
            You are visitor number:
            <br />
            {count === null ? (
                <>
                    <img
                        src="/media/loadingBlack.svg"
                        alt="loading circle"
                        className="animate-spin w-10 h-10 mx-auto mt-2 dark:hidden"
                    />
                    <img
                        src="/media/loadingWhite.svg"
                        alt="loading circle"
                        className="animate-spin w-10 h-10 mx-auto mt-2 hidden dark:block"
                    />
                </>
            ) : (
                count
            )}
        </span>
    );
}
