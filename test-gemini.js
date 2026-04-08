import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

async function test_gemini() {
    console.log('Testing DMXAPI connection...');
    console.log('API Key:', process.env.DMXAPI_KEY ? '✅ Found' : '❌ Missing');
    console.log('Key starts with:', process.env.DMXAPI_KEY?.substring(0, 15) + '...');
    
    if (!process.env.DMXAPI_KEY) {
        console.log('Please add DMXAPI_KEY to .env file');
        return;
    }
    
    const dmxai = new OpenAI({
        baseURL: 'https://ssvip.dmxapi.com/v1',
        apiKey: process.env.DMXAPI_KEY,
    });
    
    try {
        // Test with a simple text request first
        const response = await dmxai.chat.completions.create({
            model: 'gpt-3.5-turbo',  // Try a standard model first
            messages: [
                {
                    role: 'user',
                    content: 'Say "Hello, Meme Maker!"'
                }
            ],
            max_tokens: 50,
        });
        
        console.log('✅ DMXAPI Working!');
        console.log('Response:', response.choices[0].message.content);
        
    } catch (error) {
        console.error('❌ DMXAPI Error:', error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        }
        
        console.log('\n💡 Possible issues:');
        console.log('1. Invalid API key');
        console.log('2. Wrong baseURL');
        console.log('3. Service is down');
        console.log('4. Model not available');
    }
}

test_gemini();