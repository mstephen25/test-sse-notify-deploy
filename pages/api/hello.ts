export const runtime = 'edge';

const encoder = new TextEncoder();

export default function handler(req: Request) {
    const stream = new TransformStream();

    const writer = stream.writable.getWriter();

    // 🔁 Keep-alive ping every 15 seconds
    const ping = setInterval(() => {
        writer.write(encoder.encode(`:\n\n`));
    }, 10_000);

    // Once the client disconnects, close the stream
    req.signal.addEventListener('abort', () => {
        writer.close();
        clearInterval(ping);
    });

    writer.write(encoder.encode(`id:\nevent:TEST\ndata:${process.env.NEXT_PUBLIC_TEST_VAR}\nretry:500\n\n`));

    return new Response(stream.readable, {
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'text/event-stream; charset=utf-8',
            Connection: 'keep-alive',
            'Cache-Control': 'no-cache, no-transform',
            'X-Accel-Buffering': 'no',
            'Content-Encoding': 'none',
        },
    });
}
