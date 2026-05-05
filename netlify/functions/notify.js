exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const apiKey = process.env.ONESIGNAL_API_KEY || 'os_v2_app_tvpwbj5wqzgplgfw4bcpovjghtfqkmh3qyaeneer3bgtdfijfgtty55u7wwo7i6kbwsclyt4cpq43qypstqvs6wyrhlpmf7mnybuq2a';

    let body;
    try { body = JSON.parse(event.body); } catch {
        return { statusCode: 400, body: 'Invalid JSON' };
    }

    const { title, message, senderEmail, view } = body;
    if (!title || !message) {
        return { statusCode: 400, body: 'Missing title or message' };
    }

    const baseUrl = 'https://torreserenalogistic26.netlify.app';
    const targetUrl = view ? `${baseUrl}/#view=${view}` : baseUrl;

    const payload = {
        app_id: '9d5f60a7-b686-4cf5-98b6-e044f755263c',
        included_segments: ['All'],
        contents: { it: message, en: message },
        headings: { it: title, en: title },
        url: targetUrl,
        data: view ? { view } : undefined
    };

    try {
        const res = await fetch('https://api.onesignal.com/notifications', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Key ${apiKey}`
            },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        return { statusCode: 200, body: JSON.stringify(data) };
    } catch (err) {
        return { statusCode: 500, body: err.message };
    }
};
