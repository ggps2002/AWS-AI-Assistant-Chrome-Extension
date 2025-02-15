import hljs from 'highlight.js/lib/core';
import python from 'highlight.js/lib/languages/python';
import bash from 'highlight.js/lib/languages/bash';
hljs.registerLanguage('python', python);
hljs.registerLanguage('bash', bash);

import markdownit from 'markdown-it';
// import { parseHTML } from 'linkedom';

import 'highlight.js/styles/rainbow.css'


// Actual default value
const md = markdownit({
    highlight: function (str, lang) {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return '<pre><div class="code-header"><p>' + md.utils.escapeHtml(lang) + '</p></div><code class="hljs">' +
                    hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
                    '</code></pre>';
            } catch (__) { }
        }

        return '<pre><code class="hljs">' + md.utils.escapeHtml(str) + '</code></pre>';
    }
});


document.addEventListener("DOMContentLoaded", function () {
    const chatHistory = document.getElementById("chat-history");
    const messageInput = document.getElementById("message-input");
    const sendButton = document.getElementById("send-button");

    function saveInstructionsToStorage(instructions) {
        // Send a message to the content script
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]) {
                chrome.tabs.sendMessage(tabs[0].id, { action: "updateInstructions", stepInstructions: instructions });
            }
        });
    }


    function parseMessage(message) {
        return md.render(message);
    }

    function addMessageToChat(message, isUser) {
        const botSpans = Array.from(chatHistory.querySelectorAll('.message.bot span'));
        const loadingBotSpan = botSpans.filter(span => span.innerHTML === '<span class="loader"></span>');

        if (loadingBotSpan.length > 0) {
            const parsedMessage = parseMessage(message);
            loadingBotSpan[0].innerHTML = parsedMessage;  // Replace the loader with the message
            return;
        }

        // Otherwise, create a new message element
        const messageDiv = document.createElement("div");
        messageDiv.className = `message ${isUser ? "user" : "bot"}`;
        const messageSpan = document.createElement("span");

        if (!isUser) {
            const messageImageDiv = document.createElement("div");
            messageImageDiv.className = "bot-logo";
            const messageImage = document.createElement("img");
            messageImage.src = "icons/icon128.png";
            messageImageDiv.appendChild(messageImage);
            messageDiv.appendChild(messageImageDiv);
        }
        // Parse and add the actual message after receiving response
        const parsedMessage = message.length > 0 ? parseMessage(message) : '<span class="loader"></span>';
        messageSpan.innerHTML = parsedMessage;
        messageDiv.appendChild(messageSpan);
        chatHistory.appendChild(messageDiv);

        // Highlight code blocks if any
        messageDiv.querySelectorAll('pre code').forEach((block) => {
            hljs.highlightBlock(block);
        });

        // Ensure the chat history scrolls to the bottom
        chatHistory.scrollTop = chatHistory.scrollHeight;
    }

    async function sendMessageToAI(message, retries = 8) {
        try {
            const response = await fetch('https://pradipto2002-aws-assistant.hf.space/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message })
            });

            const rawText = await response.text();
            console.log('Raw Response:', rawText);

            const data = JSON.parse(rawText);
            return data.response;
        } catch (error) {
            if (retries > 0) {
                console.error('Error, retrying...', error);
                return await sendMessageToAI(message, retries - 1);
            } else {
                console.error('Error sending message to AI:', error);
                return [];
            }
        }
    }

    sendButton.addEventListener('click', async () => {
        const message = messageInput.value.trim();
        if (message) {
            addMessageToChat(message, true);
            messageInput.value = '';
            addMessageToChat("", false);
            const instructions = await sendMessageToAI(message);
            if (instructions.length > 0 || typeof instructions === 'string') {
                if (typeof instructions === 'string') {
                    addMessageToChat(instructions, false);
                } else {
                    addMessageToChat(instructions[1], false);
                    saveInstructionsToStorage(instructions[0]);
                }
            } else {
                addMessageToChat('No response from the AI.', false);
            }
        }
    });

    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            sendButton.click();
        }
    });
});
