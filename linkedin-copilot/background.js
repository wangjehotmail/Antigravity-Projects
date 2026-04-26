// background.js
chrome.runtime.onInstalled.addListener(() => {
  console.log("LinkedIn Copilot loaded.");
  
  // Initialize storage if needed
  chrome.storage.local.get(['linkedin_summaries'], (result) => {
    if (!result.linkedin_summaries) {
      chrome.storage.local.set({ linkedin_summaries: [] });
    }
  });
});

// We can listen for messages from content.js if we wanted to do background fetch calls
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetch_external_summary') {
    // Example of how we might call an external AI API using fetch
    // fetch('https://api.openai.com/...', { ... }).then(r => r.json()).then(sendResponse);
    sendResponse({ text: "Simulated AI response." });
    return true; // async response
  }
  
  if (request.action === 'reload_extension') {
    chrome.runtime.reload();
    return true;
  }
});
