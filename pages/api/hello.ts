export const runtime = 'edge';

const INTERVAL_TIME_MS = 5_000;

const encoder = new TextEncoder();

// ? What is the benefit of this?
// The server only polls the latest version.txt once, and fans the result out to multiple clients.
// ? As opposed to what?
// The alternative is for all of those multiple clients to be polling version.txt at the same time.
// ! That's bad for their network bandwidth, and for our server's health
// This approach:
// 1. Reduces server load
// 2. More importantly - reduces client load
const versionNotifier = () => {
    // HTTP for dev, HTTPS for everything else
    const protocol = process.env.NODE_ENV === 'development' ? 'http' : 'https';
    let host: string;

    // A list of writers, each being for a response stream to a client
    const writers = new Set<WritableStreamDefaultWriter<any>>();

    let timeout: NodeJS.Timeout | null = null;

    const start = async () => {
        try {
            // retrieve the latest version.txt
            const res = await fetch(`${protocol}://${host}/version.txt`, { cache: 'no-store' });
            const version = await res.text();

            // send the result to all subscribed clients
            writers.forEach((writer) => {
                writer.write(encoder.encode(`id:\nevent:version\ndata:${version}\nretry:500\n\n`));
            });

            timeout = setTimeout(start, INTERVAL_TIME_MS);
        } catch (err) {
            console.error((err as Error)?.message);

            timeout = setTimeout(start, INTERVAL_TIME_MS / 2);
        }
    };

    const stop = () => {
        clearTimeout(timeout!);
        timeout = null;
    };

    return {
        // In practice, this is only set once
        setHost: (str: string) => {
            if (host) return;
            host = str;
        },
        subscribe: (writer: WritableStreamDefaultWriter<any>) => {
            writers.add(writer);
            // If this is the first client, start polling version.txt
            if (writers.size === 1) start();
        },
        unsubscribe: (writer: WritableStreamDefaultWriter<any>) => {
            writers.delete(writer);
            // If there are no more clients, stop polling version.txt
            if (writers.size === 0) stop();
        },
    };
};

// Singleton for polling version
const versionFanOut = versionNotifier();

export default function handler(req: Request) {
    const host = req.headers.get('host')!;

    // Create a response stream
    const stream = new TransformStream();
    const writer = stream.writable.getWriter();

    versionFanOut.setHost(host);

    // Subscribe the client to notifications for changes in version.txt
    versionFanOut.subscribe(writer);

    // Stop streaming to the client once they disconnect
    req.signal.addEventListener('abort', () => {
        versionFanOut.unsubscribe(writer);
        writer.close();
    });

    return new Response(stream.readable, {
        headers: {
            // CORS
            'Access-Control-Allow-Origin': '*',
            // Required headers to stream to the client
            'Content-Type': 'text/event-stream; charset=utf-8',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache, no-transform',
            // https://nginx.org/en/docs/http/ngx_http_proxy_module.html
            'X-Accel-Buffering': 'no',
            'Content-Encoding': 'none',
        },
    });
}
