document.addEventListener('DOMContentLoaded', () => {
    // --- DOM References (unchanged) ---
    const chatLog = document.getElementById('chatLog');
    const textInput = document.getElementById('textInput');
    const sendButton = document.getElementById('sendButton');
    const voiceButton = document.getElementById('voiceButton');
    const statusBar = document.getElementById('statusBar');
    const aiVisualizer = document.getElementById('aiVisualizer');
    const settingsButton = document.getElementById('settingsButton');
    // ... other settings elements (unchanged) ...
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

    // --- Core Functions (setStatus, setVisualizerState, scrollToBottom, addMessage - unchanged) ---
    function setStatus(message, isLoading = false) { /* ... */ statusBar.textContent = `Status: ${message}`; statusBar.style.backgroundColor = isLoading ? '#4a6a8a' : '#101a28'; }
    function disableInput(disabled) { /* ... */ textInput.disabled = disabled; sendButton.disabled = disabled; voiceButton.disabled = disabled; }
    function setVisualizerState(state) { /* ... */ if (aiVisualizer.classList.contains(state) && state !== 'idle') return; aiVisualizer.className = ''; aiVisualizer.classList.add(state); }
    function scrollToBottom() { /* ... */ chatLog.scrollTo({ top: chatLog.scrollHeight, behavior: 'smooth' }); }
    function addMessage(role, text, isError = false) { /* ... */ const messageDiv = document.createElement('div'); messageDiv.classList.add('message'); const messageClass = isError ? 'error-message' : (role === 'user' ? 'user-message' : 'assistant-message'); messageDiv.classList.add(messageClass); messageDiv.textContent = text; chatLog.appendChild(messageDiv); scrollToBottom(); return messageDiv; }


    // --- Settings Functions (unchanged) ---
    function saveSettings() { /* ... unchanged ... */ try { localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(currentSettings)); console.log("Settings saved:", currentSettings); } catch (e) { console.error("Error saving settings:", e); } }
    function loadSettings() { /* ... unchanged ... */ try { const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY); if (savedSettings) { currentSettings = JSON.parse(savedSettings); console.log("Settings loaded:", currentSettings); speedSlider.value = currentSettings.rate; speedValue.textContent = parseFloat(currentSettings.rate).toFixed(1); } } catch (e) { console.error("Error loading settings:", e); currentSettings = { voiceURI: null, rate: 1.0 }; } }
    function populateVoiceList() { /* ... unchanged ... */ voices = synth.getVoices(); const previouslySelectedURI = currentSettings.voiceURI; voiceSelect.innerHTML = ''; if (voices.length === 0) { console.warn("No voices available yet."); const option = document.createElement('option'); option.textContent = 'No voices loaded'; option.disabled = true; voiceSelect.appendChild(option); return; } voices.forEach(voice => { const option = document.createElement('option'); option.textContent = `${voice.name} (${voice.lang})`; option.setAttribute('data-lang', voice.lang); option.setAttribute('data-name', voice.name); option.value = voice.voiceURI; if (voice.voiceURI === previouslySelectedURI) { option.selected = true; } else if (!previouslySelectedURI && voice.default) { option.selected = true; currentSettings.voiceURI = voice.voiceURI; } voiceSelect.appendChild(option); }); if (!voiceSelect.selectedOptions.length && voiceSelect.options.length > 0) { voiceSelect.options[0].selected = true; currentSettings.voiceURI = voiceSelect.options[0].value; } currentSettings.voiceURI = voiceSelect.value; console.log("Voice list populated. Current selection:", currentSettings.voiceURI); }
    function openSettings() { /* ... unchanged ... */ settingsOverlay.classList.remove('hidden'); populateVoiceList(); }
    function closeSettings() { /* ... unchanged ... */ settingsOverlay.classList.add('hidden'); }


    // --- Local Storage (History) ---
    // --- MODIFIED: Added specific logging inside save function ---
    function saveChatHistoryLocal() {
        try {
            if (!chatHistory || chatHistory.length === 0) {
                console.log("DEBUG: Attempted to save empty history. Skipping.");
                return;
            }
            localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(chatHistory));
            console.log(`DEBUG: Chat history saved successfully (${chatHistory.length} items).`); // Log success
        } catch (e) {
             if (e.name === 'QuotaExceededError') {
                 console.error("LocalStorage quota exceeded! Cannot save history.");
                 addMessage('assistant', "Error: Storage limit reached. Cannot save chat history.", true);
                 setStatus("Storage full");
             } else {
                console.error("Error saving chat history to localStorage:", e);
                setStatus("Error saving history");
                addMessage('assistant', 'Warning: Could not save chat history.', true);
             }
        }
    }
    // --- MODIFIED: Added more logging in load function ---
    function loadChatHistoryLocal() {
        try {
            const savedHistory = localStorage.getItem(HISTORY_STORAGE_KEY);
            if (savedHistory) {
                 console.log("DEBUG: Found saved history in localStorage.");
                chatHistory = JSON.parse(savedHistory);
                chatLog.innerHTML = ''; // Clear default greeting/previous logs
                chatHistory.forEach(msg => {
                    if (msg.role && msg.parts && msg.parts.length > 0) {
                        addMessage(msg.role === 'model' ? 'assistant' : msg.role, msg.parts[0].text);
                    }
                });
                setStatus("Chat history loaded");
                 console.log(`DEBUG: Parsed and loaded ${chatHistory.length} history items.`);
                addMessage('assistant', `--- Session Resumed (${new Date().toLocaleTimeString()}) ---`);
            } else {
                 console.log("DEBUG: No saved history found. Initializing.");
                 // Initialize with empty history FIRST
                 chatHistory = [];
                // Add the initial greeting AFTER initializing history
                addMessage('assistant', `I am ${AI_NAME}. Your personal AI assistant. How may I help you, ${USER_NAME}?`);
                setStatus("Ready");
            }
        } catch (e) {
            console.error("Error loading/parsing chat history:", e);
            localStorage.removeItem(HISTORY_STORAGE_KEY); // Clear potentially corrupted data
            chatHistory = []; // Reset to empty array
             addMessage('assistant', 'Error loading previous session. Starting fresh.', true);
             setStatus("Error loading history");
        }
         scrollToBottom();
    }

    // --- AI Interaction (Refined History/Persona Handling & Saving) ---
    async function getAssistantResponse(prompt) {
        console.log("DEBUG: getAssistantResponse initiated.");
        if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") { /* ... */ return; }
        if (isSpeaking || textInput.disabled) { /* ... */ console.log("DEBUG: Blocked request (speaking or disabled)."); return; }

        setStatus('Assistant thinking...', true);
        disableInput(true);
        setVisualizerState('thinking');
        currentAssistantMessageDiv = addMessage('assistant', '...');

        // --- REVISED: History & Persona Handling ---
        // 1. Create the user message object for the *current* turn
        const currentUserTurn = { role: 'user', parts: [{ text: prompt }] };

        // 2. Construct the content to SEND to the API
        const personaInstruction = `(System Instructions: You are ${AI_NAME}, a helpful, concise, and friendly AI assistant created to serve a user named ${USER_NAME}. Respond naturally as ${AI_NAME}.)`;
        const primingResponse = `Understood. I am ${AI_NAME}, ready to assist ${USER_NAME}.`;

        const apiContentToSend = [
            { role: 'user', parts: [{ text: personaInstruction }] },
            { role: 'model', parts: [{ text: primingResponse }] },
            // Include previous history *before* the current turn
            ...chatHistory,
            // Add the *current* user turn at the end for the API context
            currentUserTurn
        ];

        const requestBody = { contents: apiContentToSend };
        // console.log("DEBUG: Sending API Request Body:", JSON.stringify(requestBody, null, 2)); // DEBUG: Verbose log

        try {
            console.log("DEBUG: Fetching AI response...");
            const response = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody) });
            console.log(`DEBUG: Fetch response status: ${response.status}`);

            if (!response.ok) {
                // Try to get error text for better debugging
                let errorText = response.statusText;
                try {
                    const errorData = await response.json();
                    console.error("API Error Response Body:", errorData);
                    errorText = errorData.error?.message || JSON.stringify(errorData);
                     let blockReason = ""; const feedback = errorData?.promptFeedback; if (feedback?.blockReason) blockReason = ` (Reason: ${feedback.blockReason})`;
                     throw new Error(`API Error (${response.status}): ${errorText}${blockReason}`);
                } catch (parseError) {
                    console.error("Failed to parse API error response as JSON:", parseError);
                    // Fallback to status text if JSON parsing fails
                     throw new Error(`API Error (${response.status}): ${response.statusText}`);
                }
            }

            const data = await response.json();
            console.log("DEBUG: API Response Data Received:", data);
            let replyText = "Error: Could not extract reply.";
            let isSafeReply = false;

            // --- Refined Reply Extraction ---
             if (data.candidates && data.candidates.length > 0) {
                 const candidate = data.candidates[0];
                 // Check safety ratings if available (more granular than just finishReason)
                 const isBlocked = candidate.finishReason === "SAFETY" || candidate.safetyRatings?.some(rating => rating.probability !== "NEGLIGIBLE" && rating.blocked); // Adjust probability check if needed

                 if (isBlocked) {
                     replyText = "Response blocked due to safety settings.";
                     console.warn("Safety block detected:", candidate.finishReason, candidate.safetyRatings);
                     addMessage('assistant', replyText, true);
                 } else if (candidate.content?.parts?.[0]?.text) {
                     replyText = candidate.content.parts[0].text;
                     currentAssistantMessageDiv.textContent = replyText;
                     isSafeReply = true; // Mark as valid for history/speech
                 } else {
                     console.warn("Unexpected candidate structure or empty content:", candidate);
                     replyText = "Received response, but content is missing or empty.";
                     currentAssistantMessageDiv.textContent = replyText;
                 }
             } else if (data?.promptFeedback?.blockReason) { // Check prompt feedback separately
                 replyText = `Request blocked due to safety settings (Reason: ${data.promptFeedback.blockReason}).`;
                 console.warn("Prompt block:", data.promptFeedback);
                 addMessage('assistant', replyText, true);
             } else { // General unexpected response
                 console.warn("Unexpected API response structure:", data);
                 currentAssistantMessageDiv.textContent = replyText;
             }


            // --- REVISED: Update History and Save ---
            if (isSafeReply) {
                console.log("DEBUG: Valid reply received. Updating history and saving.");
                // 3. Add the successful turn (user + model) to the main history array
                chatHistory.push(currentUserTurn); // Add the user turn
                chatHistory.push({ role: 'model', parts: [{ text: replyText }] }); // Add the AI turn

                // 4. Save the updated history
                saveChatHistoryLocal();

                // 5. Speak the response
                speakText(replyText);
            } else {
                console.log("DEBUG: Reply was unsafe or invalid, resetting state. History not saved for this turn.");
                setVisualizerState('idle');
                setStatus('Blocked/Invalid');
                disableInput(false);
                // Do NOT add currentUserTurn or the model response to chatHistory
                // Do NOT call saveChatHistoryLocal
            }

        } catch (error) {
            console.error("Error during AI interaction:", error); // Log the actual error object
            const errorMsg = `Error: ${error.message}`; // Display the specific error
            if (currentAssistantMessageDiv) { currentAssistantMessageDiv.textContent = errorMsg; currentAssistantMessageDiv.classList.add('error-message'); }
            else { addMessage('assistant', errorMsg, true); }
            setVisualizerState('idle'); setStatus(`Error`); disableInput(false);
        } finally {
            scrollToBottom(); currentAssistantMessageDiv = null;
            console.log("DEBUG: getAssistantResponse finally block finished.");
        }
    }

    // --- Text Input & Sending (unchanged) ---
    function handleSend() { /* ... unchanged ... */
        const text = textInput.value.trim();
        if (text && !textInput.disabled) { addMessage('user', text); textInput.value = ''; getAssistantResponse(text); }
        else { console.log(`DEBUG: Send blocked. Text: "${text}", Disabled: ${textInput.disabled}`); }
     }
    sendButton.addEventListener('click', handleSend);
    textInput.addEventListener('keypress', (event) => { /* ... */ if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); handleSend(); } });

    // --- Voice Input (Speech Recognition - Enhanced Error Handling) ---
    function setupSpeechRecognition() { /* ... unchanged setup checks ... */
        window.SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!window.SpeechRecognition) { setStatus('Speech Recognition not supported'); voiceButton.disabled = true; voiceButton.style.opacity = '0.5'; return; }
        try {
            recognition = new SpeechRecognition();
            /* ... unchanged properties (continuous, lang, interim, maxAlternatives) ... */
            recognition.continuous = false; recognition.lang = 'en-US'; recognition.interimResults = false; recognition.maxAlternatives = 1;

            recognition.onresult = (event) => { /* ... unchanged ... */ const speechResult = event.results[0][0].transcript; textInput.value = speechResult; setStatus(`Recognized: "${speechResult}"`); setTimeout(handleSend, 100); };
            recognition.onspeechend = () => stopRecording('Processing...');
            recognition.onnomatch = () => stopRecording('No match');

            // --- MODIFIED: onerror with more detail ---
            recognition.onerror = (event) => {
                let errorMsg = `Speech Error: ${event.error}`;
                if (event.message) errorMsg += ` - ${event.message}`; // Append browser message if available
                 console.error("Speech Recognition Error Event:", event); // Log the full event object

                // Provide more specific feedback based on the error type
                switch (event.error) {
                    case 'not-allowed':
                    case 'service-not-allowed':
                        errorMsg = "Mic permission denied. Check browser & OS settings.";
                        addMessage('assistant', errorMsg, true);
                        break;
                    case 'network':
                        errorMsg = "Network error during speech recognition.";
                        addMessage('assistant', errorMsg, true);
                        break;
                    case 'no-speech':
                        errorMsg = "No speech detected.";
                        // Don't necessarily add to chat for this one
                        break;
                    case 'audio-capture':
                        errorMsg = "Mic hardware error.";
                        addMessage('assistant', errorMsg, true);
                        break;
                    case 'language-not-supported':
                         errorMsg = "Language not supported for speech rec.";
                         addMessage('assistant', errorMsg, true);
                         break;
                     case 'aborted':
                         errorMsg = "Speech input aborted."; // Often happens if stopped quickly or by browser
                         console.warn("Speech recognition aborted.");
                         break;
                    default:
                         addMessage('assistant', `Speech Error: ${event.error}`, true);
                }
                 setStatus(errorMsg); // Display detailed or mapped error
                stopRecording('Speech Error'); // Ensure UI resets
            };
            recognition.onaudiostart = () => { /* ... unchanged ... */ setStatus('Listening...'); voiceButton.classList.add('recording'); };
            recognition.onend = () => { console.log("DEBUG: Speech recognition 'onend' fired."); if (isRecording) stopRecording('Stopped'); };
            setStatus('Speech Ready'); console.log("Speech Recognition initialized successfully.");
        } catch (initError) { /* ... unchanged init error handling ... */ console.error("Failed to initialize Speech Recognition:", initError); setStatus("Speech Rec init failed"); voiceButton.disabled = true; voiceButton.style.opacity = '0.5'; }
    }

    // --- MODIFIED: startRecording with setTimeout workaround ---
    function startRecording() {
        if (!recognition) { console.error("Attempted to start recording but recognition not initialized."); setStatus("Speech Rec not ready"); return; }
        if (isRecording || textInput.disabled) { console.log("DEBUG: Blocked startRecording (already recording or input disabled)."); return; }

        // Try starting with a minimal delay - sometimes helps with permission/gesture timing
        setTimeout(() => {
             if (isRecording) return; // Check again in case state changed during timeout

             try {
                console.log("DEBUG: Starting speech recognition (delayed)...");
                isRecording = true; // Set flag before starting
                 setStatus('Starting Mic...'); // Indicate attempt
                recognition.start(); // This is where the permission error might happen
                 // Visual state (recording class) handled by onaudiostart if successful
            } catch (e) {
                console.error("Error *during* recognition.start():", e);
                isRecording = false; // Reset flag on error
                setStatus(`Mic Start Error: ${e.message}`);
                voiceButton.classList.remove('recording');
                 // Add specific message if it's the start() call failing
                 addMessage('assistant', "Failed to activate microphone. Permission issue?", true);
            }
        }, 0); // Use setTimeout with 0 delay
    }
    function stopRecording(statusMsg = 'Idle') { /* ... unchanged ... */ console.log(`DEBUG: Stopping speech recognition (Status: ${statusMsg}).`); if (!recognition || !isRecording) { return; } try { recognition.stop(); } catch (e) { console.warn("Error stopping recognition (might be harmless):", e); } finally { isRecording = false; voiceButton.classList.remove('recording'); setStatus(statusMsg); } }
    voiceButton.addEventListener('click', () => { /* ... unchanged ... */ if (isRecording) { stopRecording('Stopped manually'); } else if (!voiceButton.disabled) { startRecording(); } });


    // --- Text-to-Speech (Apply Settings - unchanged) ---
    function setupSpeechSynthesis() { /* ... unchanged ... */ if ('speechSynthesis' in window) { synth = window.speechSynthesis; synth.onvoiceschanged = () => { console.log("DEBUG: Voices changed event fired."); populateVoiceList(); const selectedVoiceURI = currentSettings.voiceURI; if (selectedVoiceURI) { const selectedOption = Array.from(voiceSelect.options).find(opt => opt.value === selectedVoiceURI); if (selectedOption) { voiceSelect.value = selectedVoiceURI; } else { console.warn("Saved voice URI not found:", selectedVoiceURI); if (voiceSelect.options.length > 0) { voiceSelect.selectedIndex = 0; currentSettings.voiceURI = voiceSelect.value; saveSettings(); } } } }; populateVoiceList(); } else { console.warn("Speech Synthesis not supported."); setStatus("Speech Synthesis not supported"); } }
    function speakText(text) { /* ... unchanged ... */ console.log("DEBUG: speakText called."); if (!synth || !text) { /*...*/ console.warn("DEBUG: TTS skipped."); setVisualizerState('idle'); setStatus('Idle'); disableInput(false); return; } isSpeaking = false; synth.cancel(); console.log("DEBUG: synth.cancel() called."); const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'en-US'; utterance.rate = currentSettings.rate || 1.0; const selectedVoice = voices.find(voice => voice.voiceURI === currentSettings.voiceURI); if (selectedVoice) { utterance.voice = selectedVoice; utterance.lang = selectedVoice.lang; console.log(`DEBUG: Using voice: ${selectedVoice.name} (${selectedVoice.lang}) Rate: ${utterance.rate}`); } else { console.warn("DEBUG: Selected voice not found, using default. URI:", currentSettings.voiceURI); utterance.rate = currentSettings.rate || 1.0; } utterance.onstart = () => { /*...*/ isSpeaking = true; setStatus('Assistant speaking...'); setVisualizerState('speaking'); disableInput(true); console.log("DEBUG: TTS onstart fired."); }; utterance.onend = () => { /*...*/ console.log("DEBUG: TTS onend fired."); isSpeaking = false; setStatus('Idle'); setVisualizerState('idle'); disableInput(false); }; utterance.onerror = (event) => { /*...*/ console.error("Speech Synthesis Error:", event); isSpeaking = false; setStatus(`Speech Error: ${event.error}`); setVisualizerState('idle'); disableInput(false); }; setTimeout(() => { console.log("DEBUG: Calling synth.speak()."); disableInput(true); setVisualizerState('speaking'); synth.speak(utterance); }, 50); }


    // --- Initialization (unchanged) ---
    function initializeApp() { /* ... unchanged ... */ console.log("Initializing App..."); loadSettings(); setupSpeechRecognition(); setupSpeechSynthesis(); loadChatHistoryLocal(); setVisualizerState('idle'); disableInput(false); settingsButton.addEventListener('click', openSettings); closeSettingsButton.addEventListener('click', closeSettings); voiceSelect.addEventListener('change', (e) => { currentSettings.voiceURI = e.target.value; saveSettings(); }); speedSlider.addEventListener('input', (e) => { currentSettings.rate = parseFloat(e.target.value); speedValue.textContent = currentSettings.rate.toFixed(1); }); speedSlider.addEventListener('change', () => { saveSettings(); }); console.log("Initialization complete."); }

    // Run initialization
    initializeApp();

}); // End DOMContentLoaded listener