import { NextApiRequest, NextApiResponse } from 'next';

const INTERVAL_TIME_MS = 5_000;

// const encoder = new TextEncoder();

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
    const writers = new Set<NextApiResponse>();

    let timeout: NodeJS.Timeout | null = null;

    //
    const start = async () => {
        try {
            // retrieve the latest version.txt
            const res = await fetch(`${protocol}://${host}/version.txt`, { cache: 'no-store' });
            const version = await res.text();

            if (res.status !== 200) throw new Error(`Non-200 response received. Does version.txt exist?`);

            // send the result to all subscribed clients
            writers.forEach((writer) => {
                writer.write(`id:\nevent:version\ndata:${version}\nretry:500\n\n`);
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
        subscribe: (writer: NextApiResponse) => {
            writers.add(writer);
            // If this is the first client, start polling version.txt
            if (writers.size === 1) start();
        },
        unsubscribe: (writer: NextApiResponse) => {
            writers.delete(writer);
            // If there are no more clients, stop polling version.txt
            if (writers.size === 0) stop();
        },
    };
};

// Singleton for polling version
const versionFanOut = versionNotifier();

export default function handler(req: NextApiRequest, res: NextApiResponse) {
    // Set the necessary headers for Server-Sent Events (SSE)
    res.setHeader('Access-Control-Allow-Origin', '*'); // CORS
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no'); // Important for Nginx to not buffer SSE
    res.setHeader('Content-Encoding', 'none'); // Prevents gzip/deflate which can interfere with SSE

    res.writeHead(200);

    const host = req.headers['host']!;
    versionFanOut.setHost(host);

    versionFanOut.subscribe(res);

    // // Create a response stream
    // const stream = new TransformStream();
    // const writer = stream.writable.getWriter();

    // // Subscribe the client to notifications for changes in version.txt

    // Stop streaming to the client once they disconnect
    req.once('close', () => {
        versionFanOut.unsubscribe(res);
        res.end();
    });
}
