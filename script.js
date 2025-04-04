document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References ---
    const chatLog = document.getElementById('chatLog');
    const textInput = document.getElementById('textInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    const saveButton = document.getElementById('saveButton');
    const loadButton = document.getElementById('loadButton');
    const statusBar = document.getElementById('statusBar');
    const aiVisualizer = document.getElementById('aiVisualizer');

    // --- State Variables ---
    let chatHistory = []; // Stores { role: 'user'/'model', parts: [{ text: '...' }] }
    let recognition;      // Speech Recognition instance
    let synth;            // Speech Synthesis instance
    let isRecording = false;
    let currentAssistantMessageDiv = null;
    let fileHandle = null; // For File System Access API

    // --- Constants & Configuration ---

    // !!! WARNING: EXTREMELY INSECURE !!!
    // Embedding your API key directly in client-side code is a MAJOR security risk.
    // Anyone viewing the source can steal your key. Use a backend proxy for safety.
    // Replace ONLY if you fully understand and accept this significant risk.
    const API_KEY = "AIzaSyDFNk9JTpq6QT4GUN_QNSVmfns07JBCCts"; // <<< PASTE KEY HERE AT YOUR OWN RISK

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const MODEL_NAME = "gemini-1.5-flash-latest"; // Or your preferred model

    // File System Access API Options
    const filePickerOptions = {
        types: [
            {
                description: 'Chat History Files',
                accept: { 'application/json': ['.json'] },
            },
        ],
        suggestedName: 'pa-core-chat.json',
    };

    // --- Core Functions ---

    function setStatus(message, isLoading = false) {
        statusBar.textContent = `Status: ${message}`;
        document.body.style.cursor = isLoading ? 'wait' : 'default';
        // Simple visual cue for loading state
        statusBar.style.backgroundColor = isLoading ? '#4a6a8a' : '#1f3040';
    }

    function disableInput(disabled) {
        textInput.disabled = disabled;
        sendButton.disabled = disabled;
        voiceButton.disabled = disabled;
        saveButton.disabled = disabled; // Disable save/load during processing
        loadButton.disabled = disabled;
    }

    function setVisualizerState(state) { // states: 'idle', 'thinking', 'speaking', 'listening' (optional)
        aiVisualizer.className = ''; // Clear previous states
        aiVisualizer.classList.add(state);
    }

    function scrollToBottom() {
        chatLog.scrollTop = chatLog.scrollHeight;
    }

    function addMessage(role, text, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message');
        const messageClass = isError ? 'error-message' : (role === 'user' ? 'user-message' : 'assistant-message');
        messageDiv.classList.add(messageClass);
        messageDiv.textContent = text; // Use textContent for safety
        chatLog.appendChild(messageDiv);
        scrollToBottom();
        return messageDiv;
    }

    // --- AI Interaction ---
    async function getAssistantResponse(prompt) {
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
             addMessage('assistant', "API Key not configured in script.js. Please add your key.", true);
             setStatus("Error: API Key missing");
             return;
        }

        setStatus('Assistant thinking...', true);
        disableInput(true);
        setVisualizerState('thinking');
        currentAssistantMessageDiv = addMessage('assistant', '...'); // Placeholder

        // Add user message to history (Gemini format)
        chatHistory.push({ role: 'user', parts: [{ text: prompt }] });

        const requestBody = {
            contents: chatHistory,
             // Optional: Add safetySettings, generationConfig etc. if needed
            // generationConfig: { temperature: 0.7 },
            // safetySettings: [ { category: "HARM_CATEGORY_...", threshold: "BLOCK_..." } ]
        };

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: { message: 'Unknown API error structure' } }));
                console.error("API Error Response:", errorData);
                throw new Error(`API Error (${response.status}): ${errorData.error?.message || response.statusText}`);
            }

            const data = await response.json();
            let replyText = "Error: Could not extract reply from response."; // Default error

            // Safely extract the reply text (adjust if API response structure changes)
            if (data.candidates && data.candidates.length > 0 &&
                data.candidates[0].content && data.candidates[0].content.parts &&
                data.candidates[0].content.parts.length > 0 && data.candidates[0].content.parts[0].text) {
                replyText = data.candidates[0].content.parts[0].text;
            } else {
                 console.warn("Unexpected API response structure:", data);
                 replyText = "Received response, but couldn't parse the content.";
            }

            // Update placeholder message and history
            currentAssistantMessageDiv.textContent = replyText;
            chatHistory.push({ role: 'model', parts: [{ text: replyText }] });

            // Save history automatically if a file handle exists
            await saveChatHistoryFile(false); // Save without prompting

            speakText(replyText); // Speak the final response (will set state to 'speaking')

        } catch (error) {
            console.error("Error calling AI:", error);
            const errorMsg = `Error: ${error.message}. Check console & API Key/URL.`;
            if (currentAssistantMessageDiv) {
                currentAssistantMessageDiv.textContent = errorMsg;
                currentAssistantMessageDiv.classList.add('error-message');
                currentAssistantMessageDiv.classList.remove('assistant-message');
            } else {
                addMessage('assistant', errorMsg, true);
            }
             setVisualizerState('idle'); // Revert to idle on error
             setStatus(`Error: ${error.message}`);
        } finally {
            // Don't re-enable input until speech is finished (handled in speakText onend)
            // disableInput(false); // Moved to speakText onend/onerror
            scrollToBottom();
            currentAssistantMessageDiv = null;
        }
    }

    // --- Text Input & Sending ---
    function handleSend() {
        const text = textInput.value.trim();
        if (text && !textInput.disabled) {
            addMessage('user', text);
            // Don't save user message immediately here, save full exchange after response
            textInput.value = '';
            getAssistantResponse(text);
        }
    }

    sendButton.addEventListener('click', handleSend);
    textInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            handleSend();
        }
    });

    // --- Voice Input (Web Speech API) ---
    function setupSpeechRecognition() {
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) {
            setStatus('Speech Recognition not supported');
            voiceButton.disabled = true;
            voiceButton.style.backgroundColor = '#555';
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.lang = 'en-US'; // Adjust if needed
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            const speechResult = event.results[0][0].transcript;
            textInput.value = speechResult;
            setStatus(`Recognized: "${speechResult}"`);
            setTimeout(handleSend, 100); // Send automatically
        };

        recognition.onspeechend = () => stopRecording('Processing...');
        recognition.onnomatch = () => stopRecording('No match');
        recognition.onerror = (event) => {
            setStatus(`Speech Error: ${event.error}`);
            console.error("Speech Recognition Error:", event);
            stopRecording('Speech Error');
        };
        recognition.onaudiostart = () => {
            setStatus('Listening...');
            voiceButton.classList.add('recording');
            voiceButton.textContent = '...';
            // setVisualizerState('listening'); // Optional: visual state for listening
        };
        recognition.onend = () => { // Ensure cleanup even if stopped unexpectedly
             if (isRecording) stopRecording('Stopped');
        };
        setStatus('Speech Ready');
    }

    function startRecording() {
        if (!recognition || isRecording) return;
        try {
            isRecording = true;
            recognition.start();
            // Visual state handled by onaudiostart
        } catch (e) {
            isRecording = false;
            setStatus(`Error starting recording: ${e.message}`);
            console.error("Error starting recognition:", e);
            voiceButton.classList.remove('recording');
            voiceButton.textContent = '🎙';
        }
    }

    function stopRecording(statusMsg = 'Idle') {
        if (!isRecording) return;
        try { recognition.stop(); } catch (e) { /* Ignore if already stopped */ }
        isRecording = false;
        voiceButton.classList.remove('recording');
        voiceButton.textContent = '🎙';
        setStatus(statusMsg);
        // If visualizer was in 'listening' state, set back to 'idle'
        // if (aiVisualizer.classList.contains('listening')) {
        //     setVisualizerState('idle');
        // }
    }

    voiceButton.addEventListener('click', () => {
        if (isRecording) {
            stopRecording('Stopped manually');
        } else if (!voiceButton.disabled) {
            startRecording();
        }
    });

    // --- Text-to-Speech (Web Speech API) ---
    function setupSpeechSynthesis() {
        if ('speechSynthesis' in window) {
            synth = window.speechSynthesis;
        } else {
            console.warn("Speech Synthesis not supported.");
            setStatus("Speech Synthesis not supported");
        }
    }

    function speakText(text) {
        if (!synth || !text) {
             setVisualizerState('idle'); // Ensure idle state if no speech
             disableInput(false);      // Re-enable input if no speech happens
             setStatus('Idle');        // Set status to idle
            return;
        }
        synth.cancel(); // Cancel previous speech

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US';
        utterance.rate = 1.0;
        utterance.pitch = 1.0;

        utterance.onstart = () => {
            setStatus('Assistant speaking...');
            setVisualizerState('speaking');
             disableInput(true); // Keep input disabled while speaking
        };
        utterance.onend = () => {
            setStatus('Idle');
            setVisualizerState('idle');
             disableInput(false); // Re-enable input AFTER speaking finishes
        };
        utterance.onerror = (event) => {
            console.error("Speech Synthesis Error:", event);
            setStatus(`Speech Synthesis Error: ${event.error}`);
            setVisualizerState('idle');
             disableInput(false); // Re-enable input on error too
        };

        synth.speak(utterance);
    }

    // --- File System Access API ---
    async function requestFileHandle(type = 'open') {
        try {
            if (type === 'save') {
                if ('showSaveFilePicker' in window) {
                    fileHandle = await window.showSaveFilePicker(filePickerOptions);
                } else {
                    throw new Error("File System Access API (Save) not supported by this browser.");
                }
            } else { // type === 'open'
                if ('showOpenFilePicker' in window) {
                    [fileHandle] = await window.showOpenFilePicker(filePickerOptions); // Note: returns an array
                } else {
                     throw new Error("File System Access API (Open) not supported by this browser.");
                }
            }
            setStatus(`File ${type === 'save' ? 'selected for saving' : 'opened'}: ${fileHandle.name}`);
            return true;
        } catch (error) {
            // Handle user cancellation gracefully (DOMException: AbortError)
            if (error.name !== 'AbortError') {
                console.error(`Error ${type === 'save' ? 'selecting save file' : 'opening file'}:`, error);
                setStatus(`Error: ${error.message}`);
                addMessage('assistant', `File System Error: ${error.message}`, true);
                fileHandle = null; // Reset handle on error
            } else {
                 setStatus("File selection cancelled.");
            }
            return false;
        }
    }

    async function saveChatHistoryFile(promptUser = true) {
        if (!promptUser && !fileHandle) {
            // console.log("Auto-save skipped: No file handle selected yet.");
            return; // Don't save automatically if no file is chosen
        }

        if (promptUser || !fileHandle) {
             setStatus("Requesting file location to save...");
             const success = await requestFileHandle('save');
             if (!success) return; // User cancelled or error occurred
        }

        if (!fileHandle) {
            setStatus("Error: No file handle available for saving.");
            return;
        }

        setStatus(`Saving to ${fileHandle.name}...`, true);
        try {
            // Create a FileSystemWritableFileStream to write to.
            const writableStream = await fileHandle.createWritable();

            // Write the contents of the file to the stream.
            await writableStream.write(JSON.stringify(chatHistory, null, 2)); // Pretty print JSON

            // Close the file and write the contents to disk.
            await writableStream.close();

            setStatus(`Chat history saved to ${fileHandle.name}`);
        } catch (error) {
            console.error("Error saving file:", error);
            setStatus(`Error saving file: ${error.message}`);
            addMessage('assistant', `File Saving Error: ${error.message}`, true);
            fileHandle = null; // Reset handle potentially? Or retry? For now, reset.
        } finally {
            disableInput(false); // Re-enable input if disabled for saving
        }
    }

    async function loadChatHistoryFile() {
         setStatus("Select chat history file to load...");
        const success = await requestFileHandle('open');
        if (!success || !fileHandle) {
             setStatus("File loading cancelled or failed.");
            return; // User cancelled or error
        }

        setStatus(`Loading from ${fileHandle.name}...`, true);
        disableInput(true);
        try {
            const file = await fileHandle.getFile();
            const content = await file.text();
            const loadedHistory = JSON.parse(content);

            // Basic validation (check if it's an array)
            if (!Array.isArray(loadedHistory)) {
                throw new Error("Invalid file format: Expected a JSON array.");
            }
            // Could add more validation (e.g., check for role/parts structure)

            chatHistory = loadedHistory;

            // Re-render chat log
            chatLog.innerHTML = ''; // Clear existing messages
            chatHistory.forEach(msg => {
                if (msg.role && msg.parts && msg.parts.length > 0) {
                    addMessage(msg.role === 'model' ? 'assistant' : msg.role, msg.parts[0].text);
                }
                 // Add handling for older formats if necessary
            });

            setStatus(`Chat history loaded from ${fileHandle.name}`);
            scrollToBottom(); // Scroll to latest message after loading
             // Add a confirmation message in chat
             addMessage('assistant', `--- Chat history loaded from ${fileHandle.name} ---`);

        } catch (error) {
            console.error("Error loading or parsing file:", error);
            setStatus(`Error loading file: ${error.message}`);
            addMessage('assistant', `File Loading Error: ${error.message}`, true);
            fileHandle = null; // Reset handle on load error
        } finally {
            disableInput(false);
        }
    }

    // Add event listeners for Save/Load buttons
    saveButton.addEventListener('click', () => saveChatHistoryFile(true)); // Prompt user when clicking save
    loadButton.addEventListener('click', loadChatHistoryFile);


    // --- Initialization ---
    function initializeApp() {
        setupSpeechRecognition();
        setupSpeechSynthesis();
        setVisualizerState('idle');
         // Don't load history automatically, user must click Load button
         addMessage('assistant', 'PA Core Initialized. Load existing chat or start typing.');
         setStatus('Ready');
    }

    // Run initialization when the DOM is fully loaded
    initializeApp();

}); // End DOMContentLoaded listener