// content.js
console.log("LinkedIn Copilot loaded");

function injectPanel() {
  if (document.getElementById('linkedin-copilot-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'linkedin-copilot-panel';
  if (document.body.classList.contains('theme--dark')) {
      panel.classList.add('dark-mode');
  }

  panel.innerHTML = `
    <div id="linkedin-copilot-toggle">🤖</div>
    <div class="copilot-header" style="display:flex;justify-content:space-between;align-items:center;">
      <span>LinkedIn Copilot</span>
      <button id="btn-dev-reload" title="Reload Extension & Extract" style="background:rgba(10,102,194,0.1);border:1px solid rgba(10,102,194,0.3);border-radius:4px;cursor:pointer;font-size:1rem;padding:4px 8px;display:flex;align-items:center;color:#0a66c2;">🔄</button>
    </div>
    <div class="copilot-controls" style="padding: 16px 16px 0 16px; background:rgba(0,0,0,0.02)">
        <input type="number" id="min-salary-input" placeholder="Min Salary Required (e.g. 150000)" style="width:100%; border:1px solid #ccc; padding:6px; border-radius:4px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; gap:4px; font-size:0.75rem;">
          <button id="btn-new-file" style="flex:1; cursor:pointer;" title="Change timestamp suffix">New Target File</button>
          <button id="btn-open-folder" style="flex:1; cursor:pointer;">Open Folder</button>
          <button id="btn-rotate-files" style="flex:1; cursor:pointer;" title="Keep last 3 CSV logs">Keep Last 3</button>
        </div>
        <label style="font-size:0.75rem; display:flex; align-items:center; gap:4px; margin-top:8px; padding-bottom:8px;">
          <input type="checkbox" id="feature-debug-toggle" style="appearance:auto !important; opacity:1 !important; visibility:visible !important; pointer-events:auto !important; position:static !important; width:14px; height:14px; margin:0;"> Enable Debug Dump
        </label>
    </div>
    <div class="copilot-body">
      <div class="copilot-actions">
        <button class="copilot-btn" id="btn-auto-extract">Auto-Extract All Jobs</button>
        <button class="copilot-btn btn-debug" id="btn-debug-dump" style="margin-top:8px;font-size:0.85rem;padding:8px;">Export Debug Logs</button>
      </div>
      <div id="copilot-results"></div>
    </div>
  `;
  document.body.appendChild(panel);

  const toggleBtn = document.getElementById('linkedin-copilot-toggle');
  toggleBtn.addEventListener('click', () => {
    panel.classList.toggle('open');
  });

  const autoExtractBtn = document.getElementById('btn-auto-extract');
  if (autoExtractBtn) autoExtractBtn.addEventListener('click', handleAutoExtract);

  const debugDumpBtn = document.getElementById('btn-debug-dump');
  if (debugDumpBtn) debugDumpBtn.addEventListener('click', handleDebugDump);

  // File system and config state
  function getCurrentDateString() {
      const d = new Date();
      const pad = n => n.toString().padStart(2, '0');
      return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }
  let currentFileDate = localStorage.getItem('copilot_file_date') || getCurrentDateString();
  localStorage.setItem('copilot_file_date', currentFileDate);

  document.getElementById('btn-new-file')?.addEventListener('click', () => {
      currentFileDate = getCurrentDateString();
      localStorage.setItem('copilot_file_date', currentFileDate);
      const b = document.getElementById('btn-new-file'); b.innerText = "Started!"; setTimeout(()=>b.innerText="New Target File", 1500);
  });
  document.getElementById('btn-open-folder')?.addEventListener('click', () => {
      fetch('http://127.0.0.1:5005/open_folder').catch(e => alert("Server not running"));
  });
  document.getElementById('btn-rotate-files')?.addEventListener('click', () => {
      fetch('http://127.0.0.1:5005/rotate_files', {
        method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({file_prefix: "linkedin_jobs"})
      }).then(() => { const b = document.getElementById('btn-rotate-files'); b.innerText = "Rotated!"; setTimeout(()=>b.innerText="Keep Last 3", 1500); } ).catch(e => alert("Server not running"));
  });

  const reloadBtn = document.getElementById('btn-dev-reload');
  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      // 1. Set session flag
      sessionStorage.setItem('copilot_auto_extract', 'true');
      
      // 2. Tell background script to reload the extension entirely
      try {
        if (chrome.runtime && chrome.runtime.sendMessage) {
            chrome.runtime.sendMessage({ action: 'reload_extension' });
        } else {
            console.warn("Extension context detached. Hard reloading page.");
        }
      } catch (e) {
          console.warn("Could not send message to background script", e);
      }
      
      // 3. Reload current page
      window.location.reload();
    });
  }

  // Load previous summaries on init
  loadSummaries();

  // If coming from a dev reload, open panel
  if (sessionStorage.getItem('copilot_auto_extract') === 'true') {
    sessionStorage.removeItem('copilot_auto_extract');
    panel.classList.add('open');
  }
}

function getCanonicalJobUrl() {
  const urlParams = new URLSearchParams(window.location.search);
  const currentJobId = urlParams.get('currentJobId');
  if (currentJobId) {
    return `https://www.linkedin.com/jobs/view/${currentJobId}`;
  }
  
  const match = window.location.pathname.match(/\/jobs\/view\/(\d+)/);
  if (match) {
    return `https://www.linkedin.com/jobs/view/${match[1]}`;
  }
  
  return window.location.href.split('?')[0];
}

function extractTargetJobInfo() {
  const data = {
    company: "Not Found",
    jobTitle: "Not Found",
    maxComp: "Not Found (or not listed)",
    maxCompNum: 0,
    url: getCanonicalJobUrl()
  };
  
  try {
    const activePane = document.querySelector('.jobs-search__job-details--container') || document.querySelector('.jobs-details') || document.querySelector('.job-view-layout') || document;

    // 1. Job Title
    const jobTitleEl = activePane.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-search__job-details--container h1, .job-view-layout-jobs-top-card h1, h1');
    if (jobTitleEl) data.jobTitle = jobTitleEl.innerText.trim();

    // 2. Company Name
    const companyEl = activePane.querySelector('.job-details-jobs-unified-top-card__company-name, .job-details-jobs-unified-top-card__primary-description a, .jobs-company__name');
    if (companyEl) data.company = companyEl.innerText.trim();

    // 3. Compensation Parsing Engine
    const parseSalaryString = (textStr) => {
       // Allows trailing period, trailing USD/year, comma separation without trailing elements, and $ formats
       const regex = /(?:\$[\d,]+(?:\.\d+)?|[\d]{1,3}(?:,\d{3})+(?:\.\d+)?)(?:[kKmM])?(?:\s*(?:USD|per annum|per year|\/yr|\/hr|a year|yr))?/gi;
       const matches = textStr.match(regex);
       if (!matches) return { val: 0, str: "", debugMatchContext: "No matches" };
       
       let maxVal = 0;
       let maxStr = matches[matches.length - 1]; 
        
       matches.forEach(m => {
          let clean = m.replace(/[^\d.kKmM]/gi, '').toLowerCase();
          let multiplier = 1;
          if (clean.includes('k')) multiplier = 1000;
          if (clean.includes('m')) multiplier = 1000000;
          
          clean = clean.replace(/[km]/g, '');
          let val = parseFloat(clean) * multiplier;
          
          if (val > maxVal) { maxVal = val; maxStr = m; }
       });
       return { val: maxVal, str: maxStr.trim(), debugMatchContext: matches };
    };

    let compFound = false;
    data._debugData = { parseSteps: [] };

    // TIER 1: Check structured Top Card
    const topCard = activePane.querySelector('.job-details-jobs-unified-top-card__primary-description-container, .job-details-jobs-unified-top-card__job-insight');
    if (topCard) {
       const res = parseSalaryString(topCard.innerText);
       data._debugData.parseSteps.push({ tier: 1, elementText: topCard.innerText, regexResult: res });
       if (res && res.val > 0) {
           data.maxComp = res.str;
           data.maxCompNum = res.val;
           compFound = true;
       }
    }

    // TIER 2: Contextual Line Filtering from Job Description
    if (!compFound) {
       const descEl = activePane.querySelector('.jobs-description__content') || activePane;
       if (descEl) {
           const lines = descEl.innerText.split(/[\n]/);
           const contextWords = ['salary', 'pay', 'compensation', 'usd', 'annum', 'range'];
           
           for (let line of lines) {
               const lowerLine = line.toLowerCase();
               if (contextWords.some(w => lowerLine.includes(w))) {
                   const res = parseSalaryString(line);
                   data._debugData.parseSteps.push({ tier: 2, matchedContextLine: line, regexResult: res });
                   // Exclude wild numbers like $500M by capping at 5 Million max reasonable salary logic
                   if (res && res.val > 0 && res.val <= 5000000) { 
                       if (res.val > data.maxCompNum) {
                           data.maxComp = res.str;
                           data.maxCompNum = res.val;
                           compFound = true;
                       }
                   }
               }
           }
       }
    }

  } catch (err) {
    console.error("Copilot extraction error:", err);
  }

  return data;
}

let isAutoExtracting = false;

async function handleAutoExtract() {
  const btn = document.getElementById('btn-auto-extract');
  if (isAutoExtracting) {
    isAutoExtracting = false;
    btn.innerText = "Stopping...";
    return;
  }
  
  isAutoExtracting = true;
  btn.innerText = "Stop Auto-Extract";
  
  let jobCards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item'));
  let currentIndex = 0;
  
  while (isAutoExtracting) {
    if (currentIndex >= jobCards.length) {
        
        // 1. Try hitting Next Page button (Traditional Pagination)
        const nextBtn = document.querySelector('.jobs-search-pagination__button--next') 
                     || document.querySelector('.artdeco-pagination__button--next') 
                     || document.querySelector('button[aria-label="Next"]')
                     || document.querySelector('button[aria-label="View next page"]');

        const isDisabled = nextBtn && (nextBtn.disabled || nextBtn.classList.contains('artdeco-button--disabled') || nextBtn.getAttribute('disabled') !== null);

        if (nextBtn && !isDisabled) {
            let randWait = Math.floor(Math.random() * 2000) + 1000; // Wait random 1~3 seconds
            console.log(`Done with page. Waiting ${randWait}ms before next page...`);
            await new Promise(r => setTimeout(r, randWait));
            
            nextBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            nextBtn.click();
            await new Promise(r => setTimeout(r, 4500)); // wait for page routing + ajax
            if (!isAutoExtracting) break;
            
            jobCards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item'));
            currentIndex = 0;
            if (jobCards.length > 0) continue;
        } else {
            // 2. Fallback: Check if it's an Infinite Scroll page
            let newCards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item'));
            
            if (newCards.length === jobCards.length) {
                // Infinite scroll could be lagging, give it a manual nudge
                const scrollContainer = document.querySelector('.jobs-search-results-list, .jobs-search__results-list') || document.body;
                scrollContainer.scrollTop += 1500;
                await new Promise(r => setTimeout(r, 3500));
                newCards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item'));
            }

            if (newCards.length > jobCards.length) {
                jobCards = newCards;
                continue;
            }
        }

        break; // No next button and infinite scroll exhausted, end of the list
    }

    const card = jobCards[currentIndex];
    
    // Scroll element into view, which also triggers infinite loading natively
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    
    // Click it to load details
    const link = card.querySelector('.job-card-list__title') || card.querySelector('a');
    if (link) {
        link.click();
    } else {
        card.click();
    }
    
    // Hardcoded safety wait for DOM to update AJAX
    await new Promise(r => setTimeout(r, 2000));
    
    if (!isAutoExtracting) break; // abort if stopped 
    
    const data = extractTargetJobInfo();
    const minSalaryInput = document.getElementById('min-salary-input').value;
    const minSalary = minSalaryInput ? parseInt(minSalaryInput) : 0;
    
    if (data.maxCompNum && data.maxCompNum >= minSalary || (!data.maxCompNum && minSalary === 0)) {
        let summaryHtml = `<strong>Company:</strong> ${data.company}<br/>`;
        summaryHtml += `<strong>Job Title:</strong> ${data.jobTitle}<br/>`;
        summaryHtml += `<strong>Max Comp:</strong> <span style="color:#057642;font-weight:600;">${data.maxComp}</span><br/>`;
        summaryHtml += `<strong>Link:</strong> <a href="${data.url}" target="_blank" style="color:#0a66c2;text-decoration:underline;">View Posting</a>`;

        const summaryObj = {
          id: Date.now(),
          url: data.url,
          content: summaryHtml,
          timestamp: new Date().toISOString()
        };

        saveSummary(summaryObj);
        appendSummary(summaryObj);
        
        // Log to CSV backend
        await fetch('http://127.0.0.1:5005/save_csv', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ file_prefix: "linkedin_jobs", date_str: localStorage.getItem('copilot_file_date'), job: data })
        }).catch(e => console.warn("Failed to write to local server"));
    }
    
    // Feature Debug Logging Output
    const isDebugEnabled = document.getElementById('feature-debug-toggle')?.checked;
    if (isDebugEnabled) {
        fetch('http://127.0.0.1:5005/debug', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jobTarget: data.company + " - " + data.jobTitle,
                debugExtractionInfo: data._debugData
            })
        }).catch(e => console.warn("Failed to send debug data"));
    }
    
    currentIndex++;
    
    // Re-evaluate list in case infinite scrolling appended new elements
    jobCards = Array.from(document.querySelectorAll('.job-card-container, .jobs-search-results__list-item'));
  }
  
  btn.innerText = "Auto-Extract Done!";
  setTimeout(() => { if (!isAutoExtracting) btn.innerText = "Auto-Extract All Jobs"; }, 3000);
  isAutoExtracting = false;
}

function handleDebugDump() {
  const btn = document.getElementById('btn-debug-dump');
  btn.innerText = "Dumping...";
  
  const debugData = {
    url: window.location.href,
    numJobCards: document.querySelectorAll('.job-card-container, .jobs-search-results__list-item').length,
    jobDetailsHtml: document.querySelector('.jobs-search__job-details--container')?.innerHTML || document.querySelector('main')?.innerHTML || "Not found",
    timestamp: new Date().toISOString()
  };
  
  fetch('http://127.0.0.1:5005/debug', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(debugData)
  }).then(() => {
    btn.innerText = "Saved to Workspace!";
    setTimeout(() => btn.innerText = "Export Debug Logs", 3000);
  }).catch(err => {
    console.error(err);
    btn.innerText = "Error - Server Running?";
    setTimeout(() => btn.innerText = "Export Debug Logs", 3000);
  });
}

function saveSummary(summaryObj) {
  chrome.storage.local.get(['linkedin_summaries'], (result) => {
    const summaries = result.linkedin_summaries || [];
    summaries.unshift(summaryObj);
    chrome.storage.local.set({ linkedin_summaries: summaries.slice(0, 50) }); 
  });
}

function loadSummaries() {
  chrome.storage.local.get(['linkedin_summaries'], (result) => {
    const summaries = result.linkedin_summaries || [];
    const resultsContainer = document.getElementById('copilot-results');
    resultsContainer.innerHTML = '';
    summaries.forEach(appendSummary);
  });
}

function appendSummary(summaryObj) {
  const resultsContainer = document.getElementById('copilot-results');
  const card = document.createElement('div');
  card.className = 'summary-card';
  
  const date = new Date(summaryObj.timestamp).toLocaleTimeString();
  
  card.innerHTML = `
    <div class="summary-title" style="display:flex;justify-content:space-between;">
      <span>Extracted Note</span>
      <span style="font-size:0.75rem; color:#666;">${date}</span>
    </div>
    <div class="summary-content">${summaryObj.content}</div>
  `;
  resultsContainer.insertBefore(card, resultsContainer.firstChild);
}

// Observe DOM for changes if we need to reinject (LinkedIn is an SPA)
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
  }
  injectPanel();
}).observe(document, {subtree: true, childList: true});

// Init
injectPanel();
