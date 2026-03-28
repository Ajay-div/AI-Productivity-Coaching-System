const llm = require('./src/llm');

async function testModel(modelName) {
    console.log(`Testing model: ${modelName}...`);
    try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=AIzaSyC3zf_iBPEEE3E-CDtoWp9GCTCCcl3DWWk`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] }),
        });
        const data = await res.json();
        if (res.ok) {
            console.log(`SUCCESS: ${modelName} works!`);
            return true;
        } else {
            console.log(`FAILED: ${modelName} returned ${res.status}: ${JSON.stringify(data.error)}`);
            return false;
        }
    } catch (err) {
        console.error(`ERROR: ${modelName} - ${err.message}`);
        return false;
    }
}

async function runTests() {
    const models = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash', 'gemini-2.0-flash-exp', 'gemini-1.0-pro'];
    for (const m of models) {
        if (await testModel(m)) break;
    }
}

runTests();
