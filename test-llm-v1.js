const llm = require('./src/llm');

async function testModelV1(modelName) {
    console.log(`Testing model V1: ${modelName}...`);
    try {
        const url = `https://generativelanguage.googleapis.com/v1/models/${modelName}:generateContent?key=AIzaSyC3zf_iBPEEE3E-CDtoWp9GCTCCcl3DWWk`;
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: 'Hello' }] }] }),
        });
        const data = await res.json();
        if (res.ok) {
            console.log(`SUCCESS V1: ${modelName} works!`);
            return true;
        } else {
            console.log(`FAILED V1: ${modelName} returned ${res.status}: ${JSON.stringify(data.error)}`);
            return false;
        }
    } catch (err) {
        console.error(`ERROR V1: ${modelName} - ${err.message}`);
        return false;
    }
}

testModelV1('gemini-1.5-flash');
