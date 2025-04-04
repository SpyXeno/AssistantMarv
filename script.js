document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References (unchanged) ---
    const chatLog = document.getElementById('chatLog');
    // ... (all other DOM refs remain the same) ...
    const textInput = document.getElementById('textInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    const statusBar = document.getElementById('statusBar');
    const aiVisualizer = document.getElementById('aiVisualizer');
    const settingsButton = document.getElementById('settingsButton');
    const settingsOverlay = document.getElementById('settingsOverlay');
    const closeSettingsButton = document.getElementById('closeSettingsButton');
    const voiceSelect = document.getElementById('voiceSelect');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');

    // --- State Variables (unchanged) ---
    let chatHistory = [];
    let recognition;
    let synth;
    let voices = [];
    let isRecording = false;
    let isSpeaking = false;
    let currentAssistantMessageDiv = null;
    let currentSettings = { voiceURI: null, rate: 1.0 };

    // --- Constants (unchanged) ---
    // !!! WARNING: EXTREMELY INSECURE !!!
    const API_KEY = "AIzaSyDFNk9JTpq6QT4GUN_QNSVmfns07JBCCts"; // <<< PASTE KEY HERE AT YOUR OWN RISK
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${API_KEY}`;
    const HISTORY_STORAGE_KEY = 'paCoreChatHistory_v2';
    const SETTINGS_STORAGE_KEY = 'paCoreSettings_v1';
    const AI_NAME = "Marv";
    const USER_NAME = "Yung Siq";

    // --- Core Functions ---
    function setStatus(message, isLoading = false) { /* ... unchanged ... */ statusBar.textContent = `Status: ${message}`; statusBar.style.backgroundColor = isLoading ? '#4a6a8a' : '#101a28'; }
    function disableInput(disabled) { /* ... unchanged ... */ textInput.disabled = disabled; sendButton.disabled = disabled; voiceButton.disabled = disabled; }
    function setVisualizerState(state) { /* ... unchanged ... */ if (aiVisualizer.classList.contains(state) && state !== 'idle') return; aiVisualizer.className = ''; aiVisualizer.classList.add(state); }
    function scrollToBottom() { /* ... unchanged ... */ chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' }); }
    function addMessage(role, text, isError = false) { /* ... unchanged ... */ const messageDiv = document.createElement('div'); messageDiv.classList.add('message'); const messageClass = isError ? 'error-message' : (role === 'user' ? 'user-message' : 'assistant-message'); messageDiv.classList.add(messageClass); messageDiv.textContent = text; chatLog.appendChild(messageDiv); scrollToBottom(); return messageDiv; }

    // --- NEW: Centralized State Reset ---
    function resetToIdleState(statusMessage = 'Idle') {
        console.log(`DEBUG: resetToIdleState called with status: "${statusMessage}"`);
        isSpeaking = false; // Ensure speaking flag is off
        setStatus(statusMessage);
        setVisualizerState('idle');
        disableInput(false); // Ensure input is enabled
        // Explicitly cancel any lingering speech synthesis just in case
        if (synth && synth.speaking) {
             console.log("DEBUG: resetToIdleState cancelling lingering speech.");
             synth.cancel();
        }
         // Explicitly stop speech recognition if it got stuck somehow (less common)
         if (recognition && isRecording) {
             console.warn("DEBUG: resetToIdleState stopping stuck speech recognition.");
             stopRecording('Stopped by Reset'); // Use the existing stop function
         }
    }


    // --- Settings Functions (unchanged) ---
    function saveSettings() { /* ... */ try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(currentSettings)); console.log("Settings saved:", currentSettings); } catch (e) { console.error("Error saving settings:", e); } }
    function loadSettings() { /* ... */ try { const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY); if (savedSettings) { currentSettings = JSON.parse(savedSettings); console.log("Settings loaded:", currentSettings); speedSlider.value = currentSettings.rate; speedValue.textContent = parseFloat(currentSettings.rate).toFixed(1); } } catch (e) { console.error("Error loading settings:", e); currentSettings = { voiceURI: null, rate: 1.0 }; } }
    function populateVoiceList() { /* ... */ voices = synth.getVoices(); const previouslySelectedURI = currentSettings.voiceURI; voiceSelect.innerHTML = ''; if (voices.length === 0) { /*...*/ return; } voices.forEach(voice => { const option = document.createElement('option'); option.textContent = `${voice.name} (${voice.lang})`; option.setAttribute('data-lang', voice.lang); option.setAttribute('data-name', voice.name); option.value = voice.voiceURI; if (voice.voiceURI === previouslySelectedURI) { option.selected = true; } else if (!previouslySelectedURI && voice.default) { option.selected = true; currentSettings.voiceURI = voice.voiceURI; } voiceSelect.appendChild(option); }); if (!voiceSelect.selectedOptions.length && voiceSelect.options.length > 0) { voiceSelect.options[0].selected = true; currentSettings.voiceURI = voiceSelect.options[0].value; } currentSettings.voiceURI = voiceSelect.value; console.log("Voice list populated. Current selection:", currentSettings.voiceURI); }
    function openSettings() { /* ... */ settingsOverlay.classList.remove('hidden'); populateVoiceList(); }
    function closeSettings() { /* ... */ settingsOverlay.classList.add('hidden'); }

    // --- Local Storage (History) (unchanged from previous refined version) ---
    function saveChatHistoryLocal() { /* ... unchanged ... */ try { if (!chatHistory || chatHistory.length === 0) { console.log("DEBUG: Attempted to save empty history. Skipping."); return; } localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(chatHistory)); console.log(`DEBUG: Chat history saved successfully (${chatHistory.length} items).`); } catch (e) { if (e.name === 'QuotaExceededError') { console.error("LocalStorage quota exceeded!"); addMessage('assistant', "Error: Storage limit reached.", true); setStatus("Storage full"); } else { console.error("Error saving chat history:", e); setStatus("Error saving history"); addMessage('assistant', 'Warning: Could not save chat history.', true); } } }
    function loadChatHistoryLocal() { /* ... unchanged ... */ try { const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY); if (savedHistory) { console.log("DEBUG: Found saved history."); chatHistory = JSON.parse(savedHistory); chatLog.innerHTML = ''; chatHistory.forEach(msg => { if (msg.role && msg.parts?.length) { addMessage(msg.role === 'model' ? 'assistant' : msg.role, msg.parts[0].text); } }); setStatus("Chat history loaded"); console.log(`DEBUG: Loaded ${chatHistory.length} history items.`); addMessage('assistant', `--- Session Resumed (${new Date().toLocaleTimeString()}) ---`); } else { console.log("DEBUG: No saved history. Initializing."); chatHistory = []; addMessage('assistant', `I am ${AI_NAME}. Your personal AI assistant. How may I help you, ${USER_NAME}?`); setStatus("Ready"); } } catch (e) { console.error("Error loading/parsing chat history:", e); localStorage.removeItem(HISTORY_STORAGE_KEY); chatHistory = []; addMessage('assistant', 'Error loading previous session. Starting fresh.', true); setStatus("Error loading history"); } scrollToBottom(); }


    // --- AI Interaction (Using resetToIdleState) ---
    async function getAssistantResponse(prompt) {
        console.log("DEBUG: getAssistantResponse initiated.");
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") { addMessage('assistant', "API Key missing.", true); setStatus("Error: API Key missing"); return; }
        if (isSpeaking || textInput.disabled) { console.log("DEBUG: Blocked request (speaking or disabled)."); return; }

        setStatus('Assistant thinking...', true);
        disableInput(true);
        setVisualizerState('thinking');
        currentAssistantMessageDiv = addMessage('assistant', '...');

        const currentUserTurn = { role: 'user', parts: [{ text: prompt }] };
        const personaInstruction = `(System Instructions: You are ${AI_NAME}, a helpful AI assistant for ${USER_NAME}.)`; // Simplified slightly
        const primingResponse = `Understood. I am ${AI_NAME}.`;

        const apiContentToSend = [
            { role: 'user', parts: [{ text: personaInstruction }] },
            { role: 'model', parts: [{ text: primingResponse }] },
            ...chatHistory,
            currentUserTurn
        ];
        const requestBody = { contents: apiContentToSend };

        try {
            console.log("DEBUG: Fetching AI response...");
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            console.log(`DEBUG: Fetch response status: ${response.status}`);

            if (!response.ok) { /* ... unchanged error creation ... */
                let errorText = response.statusText; try { const errorData = await response.json(); console.error("API Error Response Body:", errorData); errorText = errorData.error?.message || JSON.stringify(errorData); let blockReason = ""; const feedback = errorData?.promptFeedback; if (feedback?.blockReason) blockReason = ` (Reason: ${feedback.blockReason})`; throw new Error(`API Error (${response.status}): ${errorText}${blockReason}`); } catch (parseError) { console.error("Failed to parse API error response as JSON:", parseError); throw new Error(`API Error (${response.status}): ${response.statusText}`); }
            }

            const data = await response.json();
            console.log("DEBUG: API Response Data Received:", data);
            let replyText = "Error: Could not extract reply.";
            let isSafeReply = false;

             if (data.candidates && data.candidates.length > 0) { /* ... unchanged reply extraction & safety check ... */
                 const candidate = data.candidates[0];
                 const isBlocked = candidate.finishReason === "SAFETY" || candidate.safetyRatings?.some(rating => rating.probability !== "NEGLIGIBLE" && rating.blocked);
                 if (isBlocked) { replyText = "Response blocked due to safety settings."; console.warn("Safety block detected:", candidate.finishReason, candidate.safetyRatings); addMessage('assistant', replyText, true); }
                 else if (candidate.content?.parts?.[0]?.text) { replyText = candidate.content.parts[0].text; currentAssistantMessageDiv.textContent = replyText; isSafeReply = true; }
                 else { console.warn("Unexpected candidate structure or empty content:", candidate); replyText = "Received response, but content is missing or empty."; currentAssistantMessageDiv.textContent = replyText; }
             } else if (data?.promptFeedback?.blockReason) { /* ... unchanged prompt block handling ... */ replyText = `Request blocked due to safety settings (Reason: ${data.promptFeedback.blockReason}).`; console.warn("Prompt block:", data.promptFeedback); addMessage('assistant', replyText, true);
             } else { /* ... unchanged unexpected structure handling ... */ console.warn("Unexpected API response structure:", data); currentAssistantMessageDiv.textContent = replyText; }

            if (isSafeReply) {
                console.log("DEBUG: Valid reply. Updating history, saving, speaking.");
                chatHistory.push(currentUserTurn);
                chatHistory.push({ role: 'model', parts: [{ text: replyText }] });
                saveChatHistoryLocal(); // Save the updated history
                speakText(replyText); // Will handle state reset on finish/error
            } else {
                console.log("DEBUG: Unsafe/invalid reply. Resetting state.");
                resetToIdleState('Blocked/Invalid'); // Use centralized reset
            }

        } catch (error) {
            console.error("Error during AI interaction:", error);
            const errorMsg = `Error: ${error.message}`;
            if (currentAssistantMessageDiv) { currentAssistantMessageDiv.textContent = errorMsg; currentAssistantMessageDiv.classList.add('error-message'); }
            else { addMessage('assistant', errorMsg, true); }
            // --- Use centralized reset on error ---
            resetToIdleState('API Error');
        } finally {
            scrollToBottom();
            currentAssistantMessageDiv = null; // Clear ref to message div
            console.log("DEBUG: getAssistantResponse finally block finished.");
            // NOTE: resetToIdleState is called within the try/catch paths where needed now.
        }
    }

    // --- Text Input & Sending (unchanged) ---
    function handleSend() { /* ... */ const text = textInput.value.trim(); if (text && !textInput.disabled) { addMessage('user', text); textInput.value = ''; getAssistantResponse(text); } else { console.log(`DEBUG: Send blocked.`); } }
    sendButton.addEventListener('click', handleSend);
    textInput.addEventListener('keypress', (event) => { /* ... */ if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } });

    // --- Voice Input (Speech Recognition - More Logging for Mic Error) ---
    function setupSpeechRecognition() { /* ... unchanged setup checks ... */
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) { setStatus('Speech Recognition not supported'); voiceButton.disabled = true; voiceButton.style.opacity = '0.5'; return; }
        try {
            recognition = new SpeechRecognition();
            /* ... unchanged properties ... */
             recognition.continuous = false; recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;

            recognition.onresult = (event) => { /* ... unchanged ... */ const speechResult = event.results[0][0].transcript; textInput.value = speechResult; setStatus(`Recognized: "${speechResult}"`); setTimeout(handleSend, 100); };
            recognition.onspeechend = () => stopRecording('Processing...');
            recognition.onnomatch = () => stopRecording('No match');

            recognition.onerror = (event) => { /* ... Enhanced logging from previous step ... */
                let errorMsg = `Speech Error: ${event.error}`; if (event.message) errorMsg += ` - ${event.message}`;
                 console.error("!!! SPEECH RECOGNITION ERROR !!!:", event); // Make log prominent
                 // ... (switch case for mapping error codes - unchanged) ...
                 switch (event.error) {
                     case 'not-allowed': case 'service-not-allowed': errorMsg = "Mic permission denied. Check browser & OS settings."; addMessage('assistant', errorMsg, true); break;
                     case 'network': errorMsg = "Network error during speech recognition."; addMessage('assistant', errorMsg, true); break;
                     case 'no-speech': errorMsg = "No speech detected."; break;
                     case 'audio-capture': errorMsg = "Mic hardware error."; addMessage('assistant', errorMsg, true); break;
                     case 'language-not-supported': errorMsg = "Language not supported."; addMessage('assistant', errorMsg, true); break;
                     case 'aborted': errorMsg = "Speech input aborted."; console.warn("Speech recognition aborted."); break;
                     default: addMessage('assistant', `Speech Error: ${event.error}`, true);
                 }
                setStatus(errorMsg);
                stopRecording('Speech Error'); // Use stopRecording to reset UI/flags
            };
            recognition.onaudiostart = () => { /* ... */ setStatus('Listening...'); voiceButton.classList.add('recording'); };
            recognition.onend = () => { console.log("DEBUG: Speech recognition 'onend' fired."); if (isRecording) stopRecording('Stopped'); };
            setStatus('Speech Ready'); console.log("Speech Recognition initialized successfully.");
        } catch (initError) { /* ... unchanged init error handling ... */ console.error("Failed to initialize Speech Recognition:", initError); setStatus("Speech Rec init failed"); voiceButton.disabled = true; voiceButton.style.opacity = '0.5'; }
    }
    function startRecording() { /* ... unchanged (includes setTimeout 0) ... */
        if (!recognition) { console.error("Attempted startRecording: recognition not initialized."); setStatus("Speech Rec not ready"); return; }
        if (isRecording || textInput.disabled) { console.log("DEBUG: Blocked startRecording."); return; }
        setTimeout(() => { if (isRecording) return; try { console.log("DEBUG: Starting speech recognition (delayed)..."); isRecording = true; setStatus('Starting Mic...'); recognition.start(); } catch (e) { console.error("Error *during* recognition.start():", e); isRecording = false; setStatus(`Mic Start Error: ${e.message}`); voiceButton.classList.remove('recording'); addMessage('assistant', "Failed to activate mic. Permission issue?", true); } }, 0);
    }
    function stopRecording(statusMsg = 'Idle') { /* ... unchanged ... */
        console.log(`DEBUG: Stopping speech recognition (Status: ${statusMsg}).`);
        if (!recognition || !isRecording) { return; } // Check isRecording flag
        try { recognition.stop(); } catch (e) { console.warn("Error stopping recognition:", e); }
        finally { isRecording = false; voiceButton.classList.remove('recording'); /* Set status OUTSIDE finally if stopRecording called from resetToIdleState, otherwise handled by resetToIdleState */ if (statusMsg !== 'Stopped by Reset') setStatus(statusMsg); } // Avoid double status set
    }
    voiceButton.addEventListener('click', () => { /* ... unchanged ... */ if (isRecording) { stopRecording('Stopped manually'); } else if (!voiceButton.disabled) { startRecording(); } });


    // --- Text-to-Speech (Using resetToIdleState) ---
    function setupSpeechSynthesis() { /* ... unchanged ... */
         if ('speechSynthesis' in window) { synth = window.speechSynthesis; synth.onvoiceschanged = () => { console.log("DEBUG: Voices changed event fired."); populateVoiceList(); const selectedVoiceURI = currentSettings.voiceURI; if (selectedVoiceURI) { const selectedOption = Array.from(voiceSelect.options).find(opt => opt.value === selectedVoiceURI); if (selectedOption) { voiceSelect.value = selectedVoiceURI; } else { console.warn("Saved voice URI not found:", selectedVoiceURI); if (voiceSelect.options.length > 0) { voiceSelect.selectedIndex = 0; currentSettings.voiceURI = voiceSelect.value; saveSettings(); } } } }; populateVoiceList(); } else { console.warn("Speech Synthesis not supported."); setStatus("Speech Synthesis not supported"); }
    }

    function speakText(text) {
        console.log("DEBUG: speakText initiated.");
        if (!synth || !text) {
            console.warn("DEBUG: TTS skipped: No synth or no text.");
            resetToIdleState('Idle'); // Use centralized reset
            return;
        }

        // Force cancel before starting new utterance
        isSpeaking = false; // Reset flag before cancel/speak
        synth.cancel();
        console.log("DEBUG: synth.cancel() potentially called.");

        const utterance = new SpeechSynthesisUtterance(text);
        /* ... unchanged voice/rate application ... */
        utterance.rate = currentSettings.rate || 1.0;
        const selectedVoice = voices.find(voice => voice.voiceURI === currentSettings.voiceURI);
        if (selectedVoice) { utterance.voice = selectedVoice; utterance.lang = selectedVoice.lang; } else { utterance.rate = currentSettings.rate || 1.0; }

        utterance.onstart = () => {
            console.log("DEBUG: TTS onstart fired.");
            isSpeaking = true;
            setStatus('Assistant speaking...');
            setVisualizerState('speaking');
            disableInput(true); // Ensure disabled during speech
        };

        utterance.onend = () => {
            console.log("DEBUG: TTS onend fired.");
            resetToIdleState('Idle'); // Use centralized reset
        };

        utterance.onerror = (event) => {
            console.error("!!! SPEECH SYNTHESIS ERROR !!!:", event); // Prominent log
            resetToIdleState(`Speech Error: ${event.error}`); // Use centralized reset
        };

        // Minimal delay before speaking
        setTimeout(() => {
             if (isSpeaking) {
                 console.warn("DEBUG: speakText timeout - already speaking, cancelling speak.");
                 return; // Don't start if already speaking (e.g., rapid calls)
             }
            console.log("DEBUG: Calling synth.speak() after delay.");
            disableInput(true); // Ensure disabled just before call
            setVisualizerState('speaking'); // Assume it will start
            synth.speak(utterance);
        }, 50);
    }

    // --- Initialization (unchanged) ---
    function initializeApp() { /* ... unchanged ... */ console.log("Initializing App..."); loadSettings(); setupSpeechRecognition(); setupSpeechSynthesis(); loadChatHistoryLocal(); setVisualizerState('idle'); disableInput(false); settingsButton.addEventListener('click', openSettings); closeSettingsButton.addEventListener('click', closeSettings); voiceSelect.addEventListener('change', (e) => { currentSettings.voiceURI = e.target.value; saveSettings(); }); speedSlider.addEventListener('input', (e) => { currentSettings.rate = parseFloat(e.target.value); speedValue.textContent = currentSettings.rate.toFixed(1); }); speedSlider.addEventListener('change', () => { saveSettings(); }); console.log("Initialization complete."); }

    // Run initialization
    initializeApp();

});