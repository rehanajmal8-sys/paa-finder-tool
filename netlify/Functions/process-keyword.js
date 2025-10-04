// This is your secure backend function.
// File: netlify/functions/process-keyword.js
const fetch = require('node-fetch');

// **IMPORTANT**: These API keys are NOT in your code. 
// You must set them as Environment Variables in your hosting provider's dashboard (e.g., Netlify).
const SERPER_API_KEY = process.env.SERPER_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

exports.handler = async (event) => {
    // Only allow POST requests
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ message: 'Method Not Allowed' }) };
    }

    try {
        const { keyword, country } = JSON.parse(event.body);
        if (!keyword || !country) {
            return { statusCode: 400, body: JSON.stringify({ message: 'Keyword and country are required.' }) };
        }

        // --- Step 1: Fetch "People Also Ask" questions from Google via Serper ---
        const serperResponse = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: { 'X-API-KEY': SERPER_API_KEY, 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: keyword, gl: country })
        });
        
        if (!serperResponse.ok) {
             throw new Error('Failed to fetch PAA results from Serper.');
        }
        
        const serperData = await serperResponse.json();
        const rawQuestions = serperData.peopleAlsoAsk?.map(item => item.question) || [];

        if (rawQuestions.length === 0) {
            // If no questions, return an empty object, which the frontend will handle.
            return { statusCode: 200, body: JSON.stringify({ clusters: {} }) };
        }

        // --- Step 2: Send the questions to Gemini AI for clustering ---
        const clusterPrompt = `You are an expert SEO and content strategist. Based on the keyword "${keyword}", take the following list of "People Also Ask" questions and group them into logical, thematic clusters. The cluster titles should be short and descriptive. Return ONLY a valid JSON object. Do not include any text before or after the JSON object. Do not use markdown like \`\`\`json. The format should be {"Cluster Title 1": ["Question 1", "Question 2"], "Cluster Title 2": ["Question 3", "Question 4"]}.\n\nQuestions:\n${JSON.stringify(rawQuestions)}`;
        
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${GEMINI_API_KEY}`;
        
        const geminiResponse = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: clusterPrompt }] }] })
        });

        if (!geminiResponse.ok) {
            throw new Error('Failed to get clusters from the Gemini API.');
        }

        const geminiData = await geminiResponse.json();
        // Extract the clean JSON text from the response
        const rawClusterText = geminiData.candidates[0].content.parts[0].text;
        const clusters = JSON.parse(rawClusterText);

        // --- Step 3: Return the final, clustered data to the frontend ---
        return {
            statusCode: 200,
            body: JSON.stringify({ clusters })
        };

    } catch (error) {
        console.error('Backend Error:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ message: error.message || 'An internal server error occurred.' })
        };
    }
};